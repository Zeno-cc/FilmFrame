import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  canonicalJson,
  createManifest,
  validateManifest,
  validateReleaseInput,
} from "../lib/manifest-contract.mjs";

const digestA = `sha256:${"a".repeat(64)}`;
const digestB = `sha256:${"b".repeat(64)}`;

test("creates a valid canonical stable release manifest", () => {
  const manifest = validManifest();
  assert.deepEqual(validateManifest(manifest), []);
  const canonical = canonicalJson(manifest);
  assert.equal(canonical.endsWith("\n"), true);
  assert.equal(canonical, canonicalJson(JSON.parse(canonical)));
  assert.equal(manifest.images.filmframe.endsWith(digestA), true);
});

test("rejects mutable or missing image digests", () => {
  const latest = validManifest();
  latest.images.filmframe = "ghcr.io/zeno-cc/filmframe/filmframe:latest";
  assert.match(validateManifest(latest).join("\n"), /sha256 digest|mutable tag/);

  const tagged = validManifest();
  tagged.images.access = "ghcr.io/zeno-cc/filmframe/access:v1.0.0";
  assert.match(validateManifest(tagged).join("\n"), /sha256 digest/);
});

test("rejects untrusted repository, workflow, ref, and bundle URL", () => {
  const manifest = validManifest();
  manifest.provenance.repository = "attacker/FilmFrame";
  manifest.provenance.workflow = ".github/workflows/other.yml";
  manifest.provenance.ref = "refs/heads/main";
  manifest.deployBundle.url = "https://example.com/release.tar.gz";
  const errors = validateManifest(manifest).join("\n");
  assert.match(errors, /repository is not trusted/);
  assert.match(errors, /workflow is not trusted/);
  assert.match(errors, /ref must match/);
  assert.match(errors, /fixed asset URL/);
});

test("requires concise, plain Chinese release summaries", () => {
  for (const text of [
    "English release note only",
    "中文",
    " 中文变更摘要必须保持纯文本且长度合适",
    "中文说明 https://example.com 不允许外部地址",
    "中文说明<script>alert(1)</script>",
  ]) {
    const manifest = validManifest();
    manifest.summaryZh = [{ kind: "feature", text }];
    assert.match(validateManifest(manifest).join("\n"), /summaryZh\[0\]\.text/);
  }
});

test("rejects incompatible database metadata", () => {
  const backwardIncompatible = validManifest();
  backwardIncompatible.database.backwardCompatible = false;
  assert.match(validateManifest(backwardIncompatible).join("\n"), /backwardCompatible/);

  const descendingSchema = validManifest();
  descendingSchema.database.schemaFrom = 4;
  descendingSchema.database.schemaTo = 3;
  assert.match(validateManifest(descendingSchema).join("\n"), /schemaTo/);

  const impossibleRollback = validManifest();
  impossibleRollback.database.rollbackFloor = "2.0.0";
  assert.match(validateManifest(impossibleRollback).join("\n"), /rollbackFloor/);
});

test("release input matches the committed manifest contract", async () => {
  const input = JSON.parse(
    await readFile(new URL("../release-input.json", import.meta.url), "utf8"),
  );
  assert.deepEqual(validateReleaseInput(input), []);
  const schema = JSON.parse(
    await readFile(new URL("../manifest.schema.json", import.meta.url), "utf8"),
  );
  assert.equal(schema.properties.manifestVersion.const, 1);
  assert.equal(schema.properties.provenance.properties.repository.const, "Zeno-cc/FilmFrame");
  assert.equal(schema.additionalProperties, false);
  const summaryPattern = new RegExp(
    schema.properties.summaryZh.items.properties.text.pattern,
    "u",
  );
  assert.equal(summaryPattern.test("新增安全可靠的版本更新功能"), true);
  assert.equal(summaryPattern.test("English release summary"), false);
});

function validManifest() {
  return createManifest({
    releaseInput: {
      version: "1.0.0",
      minUpdaterVersion: "1.0.0",
      database: {
        schemaFrom: 3,
        schemaTo: 3,
        rollbackFloor: "1.0.0",
        backwardCompatible: true,
      },
      summaryZh: [{ kind: "feature", text: "新增可信版本清单与安全更新能力" }],
    },
    commit: "c".repeat(40),
    publishedAt: "2026-08-02T04:03:06Z",
    filmframeDigest: digestA,
    accessDigest: digestB,
    deployBundleSha256: "d".repeat(64),
  });
}

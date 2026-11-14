import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  getDistributionBlockers,
  validateProvenanceManifest,
  verifyLocalDigests,
} from "../lib/provenance-contract.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const manifest = JSON.parse(
  await readFile(path.join(root, "ops/provenance/manifest.json"), "utf8"),
);
const node = process.execPath;

test("the real inventory validates and preserves unresolved distribution blockers", async () => {
  assert.deepEqual(validateProvenanceManifest(manifest), []);
  assert.deepEqual(await verifyLocalDigests(manifest, root), []);
  const blockers = getDistributionBlockers(manifest);
  assert.ok(blockers.some((entry) => entry.includes("spektrafilm-spectral-constants")));
  assert.ok(blockers.some((entry) => entry.includes("filmframe-film-templates")));
  assert.ok(blockers.some((entry) => entry.includes("corresponding-source")));
  const result = run(node, ["ops/provenance/validate-provenance.mjs"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Distribution remains blocked/);
  assert.doesNotMatch(result.stdout, /No recorded provenance distribution blockers/);
});

test("a changed local digest is rejected", async () => {
  const changed = structuredClone(manifest);
  changed.entries[0].localPaths[0].sha256 = "0".repeat(64);
  const errors = await verifyLocalDigests(changed, root);
  assert.deepEqual(errors, ["ops/provenance/licenses/SpektraLab-GPL-3.0.txt: SHA-256 mismatch"]);
});

test("schema rejects duplicate IDs, unsafe paths and missing fields", () => {
  const changed = structuredClone(manifest);
  changed.entries[1].id = changed.entries[0].id;
  changed.entries[0].noticePath = "../outside";
  changed.entries[0].source.extra = "not permitted";
  changed.entries[0].localPaths[0].extra = "not permitted";
  changed.entries[0].localPaths.push(structuredClone(changed.entries[0].localPaths[0]));
  changed.projectDistribution.correspondingSource.extra = "not permitted";
  delete changed.entries[0].license;
  const errors = validateProvenanceManifest(changed);
  assert.ok(errors.some((entry) => entry.includes("id must be unique")));
  assert.ok(errors.some((entry) => entry.includes("noticePath must be repository-relative")));
  assert.ok(errors.some((entry) => entry.includes("license is required")));
  assert.ok(errors.some((entry) => entry.includes("source.extra is not an allowed field")));
  assert.ok(errors.some((entry) => entry.includes("localPaths[0].extra is not an allowed field")));
  assert.ok(errors.some((entry) => entry.includes("localPaths[1].path must be unique")));
  assert.ok(errors.some((entry) => entry.includes("correspondingSource.extra is not an allowed field")));
});

test("a CLI hash mismatch exits unsuccessfully", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "filmframe-provenance-"));
  try {
    const changed = structuredClone(manifest);
    changed.entries[0].localPaths[0].sha256 = "0".repeat(64);
    const filePath = path.join(directory, "manifest.json");
    await writeFile(filePath, JSON.stringify(changed));
    const result = run(node, ["ops/provenance/validate-provenance.mjs", filePath]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /SHA-256 mismatch/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a symlinked local file is not accepted as provenance evidence", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "filmframe-provenance-link-"));
  try {
    await symlink(path.join(root, "ops/provenance/README.md"), path.join(directory, "linked.md"));
    const changed = structuredClone(manifest);
    changed.entries[0].localPaths[0].path = path.relative(root, path.join(directory, "linked.md"));
    const errors = await verifyLocalDigests(changed, root);
    assert.ok(errors.some((entry) => entry.endsWith("symbolic links are not accepted")));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a symlinked parent cannot substitute external provenance evidence", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "filmframe-provenance-parent-"));
  const outside = await mkdtemp(path.join(tmpdir(), "filmframe-provenance-outside-"));
  try {
    await mkdir(path.join(directory, "assets"));
    const evidence = await readFile(path.join(root, "ops/provenance/README.md"));
    await writeFile(path.join(outside, "evidence.md"), evidence);
    await symlink(outside, path.join(directory, "assets", "link"));
    const changed = { entries: [structuredClone(manifest.entries[0])] };
    changed.entries[0].localPaths = [structuredClone(changed.entries[0].localPaths[0])];
    changed.entries[0].localPaths[0].path = "assets/link/evidence.md";
    changed.entries[0].localPaths[0].sha256 = createHash("sha256").update(evidence).digest("hex");
    const errors = await verifyLocalDigests(changed, directory);
    assert.deepEqual(errors, [
      "assets/link/evidence.md: resolved file is outside the repository or traverses a symbolic link",
    ]);
  } finally {
    await rm(directory, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test("a fully verified manifest reports blockers only for genuine missing readiness", () => {
  const ready = {
    manifestVersion: 1,
    projectDistribution: {
      license: "GPL-3.0-or-later",
      rightsStatus: "verified",
      correspondingSource: {
        status: "ready",
        url: "https://github.com/Zeno-cc/FilmFrame",
        notes: "Exact source is published.",
      },
      notes: "Owner review completed.",
    },
    entries: [{
      id: "owned-fixture",
      kind: "test-baseline",
      source: {
        url: "https://github.com/Zeno-cc/FilmFrame",
        revision: "a".repeat(40),
      },
      upstreamPath: "tests/fixture.json",
      license: "GPL-3.0-or-later",
      attribution: "FilmFrame project",
      rightsStatus: "verified",
      noticePath: "ops/provenance/README.md",
      modifications: "None.",
      localPaths: [{ path: "ops/provenance/README.md", sha256: "a".repeat(64) }],
      evidence: "Project-owned fixture with recorded permission.",
    }],
  };
  assert.deepEqual(validateProvenanceManifest(ready), []);
  assert.deepEqual(getDistributionBlockers(ready), []);
  ready.entries[0].rightsStatus = "unresolved";
  assert.deepEqual(getDistributionBlockers(ready), ["owned-fixture: unresolved"]);
  ready.entries[0].kind = "spectral-data";
  ready.entries[0].rightsStatus = "verified";
  ready.entries[0].license = "noassertion";
  assert.deepEqual(getDistributionBlockers(ready), ["owned-fixture: spectral-data license is unresolved"]);
});

function run(command, args) {
  return spawnSync(command, args, { cwd: root, encoding: "utf8" });
}

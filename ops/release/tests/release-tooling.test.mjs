import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { canonicalJson, createManifest } from "../lib/manifest-contract.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const node = process.execPath;
const releaseVersion = JSON.parse(
  await readFile(path.join(root, "ops/release/release-input.json"), "utf8"),
).version;

test("release input validator binds versions and latest migration", () => {
  const result = run(node, [
    "ops/release/validate-release-input.mjs",
    "ops/release/release-input.json",
    "--tag",
    `v${releaseVersion}`,
  ]);
  assert.equal(result.status, 0, result.stderr);

  const mismatch = run(node, [
    "ops/release/validate-release-input.mjs",
    "ops/release/release-input.json",
    "--tag",
    "v1.0.1",
  ]);
  assert.notEqual(mismatch.status, 0);
  assert.match(mismatch.stderr, /tag must exactly match/);
});

test("manifest generator emits canonical bytes and Chinese notes", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "filmframe-release-"));
  const manifestPath = path.join(directory, "manifest.json");
  const notesPath = path.join(directory, "notes.md");
  const result = run(node, [
    "ops/release/create-manifest.mjs",
    "--input", "ops/release/release-input.json",
    "--output", manifestPath,
    "--notes-output", notesPath,
    "--commit", "c".repeat(40),
    "--published-at", "2026-08-02T04:03:06Z",
    "--filmframe-digest", `sha256:${"a".repeat(64)}`,
    "--access-digest", `sha256:${"b".repeat(64)}`,
    "--deploy-bundle-sha256", "d".repeat(64),
  ]);
  assert.equal(result.status, 0, result.stderr);
  const source = await readFile(manifestPath, "utf8");
  assert.equal(source, canonicalJson(JSON.parse(source)));
  assert.match(await readFile(notesPath, "utf8"), /中文变更摘要/);
});

test("deploy bundle is deterministic and contains only deployment inputs", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "filmframe-bundle-"));
  const commit = run("git", ["rev-parse", "HEAD"]).stdout.trim();
  const first = path.join(directory, "first.tar.gz");
  const second = path.join(directory, "second.tar.gz");
  for (const output of [first, second]) {
    const result = run("bash", ["ops/release/build-deploy-bundle.sh", commit, "1.0.0", output]);
    assert.equal(result.status, 0, result.stderr);
  }
  assert.equal(await sha256(first), await sha256(second));
  const listing = run("tar", ["-tzf", first]);
  assert.equal(listing.status, 0, listing.stderr);
  assert.deepEqual(listing.stdout.trim().split("\n").sort(), [
    "filmframe-1.0.0/",
    "filmframe-1.0.0/.env.example",
    "filmframe-1.0.0/compose.yaml",
    "filmframe-1.0.0/ops/",
    "filmframe-1.0.0/ops/backup/",
    "filmframe-1.0.0/ops/backup/README.md",
    "filmframe-1.0.0/ops/backup/backup-access.sh",
    "filmframe-1.0.0/ops/backup/check-access-backup.sh",
    "filmframe-1.0.0/ops/backup/filmframe-access-backup.service",
    "filmframe-1.0.0/ops/backup/filmframe-access-backup.timer",
    "filmframe-1.0.0/ops/backup/restore-access.sh",
  ]);
});

test("attestation verifier pins cryptographic identity for every artifact", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "filmframe-attestation-"));
  const bin = path.join(directory, "bin");
  const bundlePath = path.join(directory, "bundle.tar.gz");
  const manifestPath = path.join(directory, "manifest.json");
  const logPath = path.join(directory, "gh.log");
  await writeFile(bundlePath, "deterministic bundle bytes");
  await writeFile(manifestPath, canonicalJson(testManifest(await sha256(bundlePath))));
  await writeFile(
    path.join(directory, "fake-gh"),
    "#!/bin/sh\nprintf '%s\\n' \"$*\" >> \"$GH_LOG\"\n",
  );
  await chmod(path.join(directory, "fake-gh"), 0o755);
  await mkdir(bin);
  await symlink(path.join(directory, "fake-gh"), path.join(bin, "gh"));

  const result = spawnSync(
    node,
    ["ops/release/verify-attestations.mjs", manifestPath, bundlePath],
    {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, GH_LOG: logPath },
    },
  );
  assert.equal(result.status, 0, result.stderr);
  const invocations = (await readFile(logPath, "utf8")).trim().split("\n");
  assert.equal(invocations.length, 4);
  for (const invocation of invocations) {
    assert.match(invocation, /--repo Zeno-cc\/FilmFrame/);
    assert.match(invocation, /--signer-workflow Zeno-cc\/FilmFrame\/\.github\/workflows\/release\.yml/);
    assert.match(invocation, /--source-ref refs\/tags\/v1\.0\.0/);
    assert.match(invocation, new RegExp(`--source-digest ${"c".repeat(40)}`));
    assert.match(invocation, /--deny-self-hosted-runners/);
  }
  assert.equal(invocations.filter((line) => line.includes("--bundle-from-oci")).length, 2);
});

test("release workflow pins actions and never publishes a mutable latest tag", async () => {
  const workflow = await readFile(path.join(root, ".github/workflows/release.yml"), "utf8");
  assert.doesNotMatch(workflow, /:latest\b/i);
  assert.doesNotMatch(workflow, /workflow_dispatch:/);
  assert.equal((workflow.match(/docker\/build-push-action@[0-9a-f]{40}/g) ?? []).length, 2);
  assert.equal((workflow.match(/actions\/attest-build-provenance@[0-9a-f]{40}/g) ?? []).length, 4);
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /attestations: write/);
  assert.match(workflow, /provenance: mode=max/);
  assert.match(workflow, /sbom: true/);
  assert.match(workflow, /verify-attestations\.mjs/);
  assert.match(workflow, /gh release create/);
  assert.match(workflow, /playwright install --with-deps chromium firefox webkit/);
  for (const line of workflow.split("\n").filter((entry) => entry.includes("uses:"))) {
    assert.match(line, /@[0-9a-f]{40}(?:\s|$)/, `action is not commit-pinned: ${line}`);
  }
});

test("release workflow blocks artifact construction on the Ubuntu updater gates", async () => {
  const workflow = await readFile(path.join(root, ".github/workflows/release.yml"), "utf8");
  const pythonGate = "PYTHONPATH=ops/updater python3 -m unittest discover";
  const layoutGate = "bash ops/updater/tests/test-install-layout.sh";
  const bundleBuild = "ops/release/build-deploy-bundle.sh";

  assert.match(workflow, /runs-on: ubuntu-24\.04/);
  assert.match(workflow, /sys\.platform\.startswith\("linux"\).*SO_PEERCRED/);
  assert.match(workflow, new RegExp(pythonGate));
  assert.match(workflow, /-s ops\/updater\/tests -p 'test_\*\.py' -v/);
  assert.match(workflow, new RegExp(layoutGate));
  assert.ok(workflow.indexOf(pythonGate) < workflow.indexOf(layoutGate));
  assert.ok(workflow.indexOf(layoutGate) < workflow.indexOf(bundleBuild));
  assert.doesNotMatch(workflow, /(?:unittest discover|test-install-layout\.sh).*\|\|\s*true/);
});

test("both runtime images expose immutable release identity labels", async () => {
  for (const dockerfile of ["Dockerfile", "server/access/Dockerfile"]) {
    const source = await readFile(path.join(root, dockerfile), "utf8");
    assert.match(source, /ARG FILMFRAME_VERSION=0\.0\.0-dev/);
    assert.match(source, /org\.opencontainers\.image\.source="https:\/\/github\.com\/Zeno-cc\/FilmFrame"/);
    assert.match(source, /org\.opencontainers\.image\.version="\$\{FILMFRAME_VERSION\}"/);
    assert.match(source, /org\.opencontainers\.image\.revision="\$\{FILMFRAME_REVISION\}"/);
  }
});

function testManifest(bundleSha256) {
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
      summaryZh: [{ kind: "security", text: "验证发布制品签名与固定工作流身份" }],
    },
    commit: "c".repeat(40),
    publishedAt: "2026-08-02T04:03:06Z",
    filmframeDigest: `sha256:${"a".repeat(64)}`,
    accessDigest: `sha256:${"b".repeat(64)}`,
    deployBundleSha256: bundleSha256,
  });
}

function run(command, args) {
  return spawnSync(command, args, { cwd: root, encoding: "utf8" });
}

async function sha256(file) {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

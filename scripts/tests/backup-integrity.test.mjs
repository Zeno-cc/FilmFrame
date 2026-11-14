import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const backupName = "access-20261114T000000Z.sqlite";
const otherName = "access-20261113T000000Z.sqlite";
const digest = (value) => createHash("sha256").update(value).digest("hex");

async function fixture(t, manifest) {
  const directory = await realpath(await mkdtemp(path.join(tmpdir(), "filmframe-integrity-")));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const backups = path.join(directory, "backups");
  const bin = path.join(directory, "bin");
  await mkdir(backups);
  await mkdir(bin);
  await writeFile(path.join(backups, backupName), "snapshot");
  await writeFile(path.join(backups, otherName), "unrelated");
  await writeFile(path.join(backups, `${backupName}.sha256`), manifest);
  await writeFile(path.join(backups, "backup-status.env"), `STATUS=success\nBACKUP=${backupName}\n`);
  // Stub Linux find's -printf output on macOS; checksum verification stays real.
  await writeFile(path.join(bin, "find"), `#!/bin/sh\nprintf '1 ${backupName}\\n'\n`, { mode: 0o755 });
  await writeFile(path.join(bin, "docker"), '#!/bin/sh\nprintf called >> "$DOCKER_LOG"\nexit 0\n', { mode: 0o755 });
  const dockerLog = path.join(directory, "docker.log");
  const run = (script, args = []) => spawnSync("bash", [path.join(root, "ops/backup", script), ...args], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      FILMFRAME_BACKUP_DIR: backups,
      FILMFRAME_ALLOW_CUSTOM_BACKUP_DIR: "1",
      FILMFRAME_BACKUP_DISK_WARN_PERCENT: "100",
      DOCKER_LOG: dockerLog,
    },
  });
  return { backups, dockerLog, run };
}

test("monitor and restore reject a checksum for a different backup before Docker", async (t) => {
  const { dockerLog, run } = await fixture(t, `${digest("unrelated")}  ${otherName}\n`);
  const monitor = run("check-access-backup.sh");
  assert.notEqual(monitor.status, 0, monitor.stdout);
  const restore = run("restore-access.sh", [backupName, "filmframe_access_restore_test"]);
  assert.notEqual(restore.status, 0);
  await assert.rejects(readFile(dockerLog), { code: "ENOENT" });
});

test("monitor and restore reject corruption of the named snapshot", async (t) => {
  const { dockerLog, run } = await fixture(t, `${digest("original bytes")}  ${backupName}\n`);
  assert.notEqual(run("check-access-backup.sh").status, 0);
  assert.notEqual(run("restore-access.sh", [backupName, "filmframe_access_restore_test"]).status, 0);
  await assert.rejects(readFile(dockerLog), { code: "ENOENT" });
});

test("valid checksum passes monitoring and reaches restore's existing-volume guard", async (t) => {
  const { dockerLog, run } = await fixture(t, `${digest("snapshot")}  ${backupName}\n`);
  const monitor = run("check-access-backup.sh");
  assert.equal(monitor.status, 0, monitor.stderr);
  const restore = run("restore-access.sh", [backupName, "filmframe_access_restore_test"]);
  assert.equal(restore.status, 1);
  assert.match(restore.stderr, /target volume already exists/);
  assert.equal(await readFile(dockerLog, "utf8"), "called");
});

test("monitor rejects a symlink checksum manifest", async (t) => {
  const { backups, run } = await fixture(t, `${digest("snapshot")}  ${backupName}\n`);
  const manifest = path.join(backups, `${backupName}.sha256`);
  const replacement = path.join(backups, "unrelated.sha256");
  await writeFile(replacement, await readFile(manifest));
  await rm(manifest);
  await symlink(replacement, manifest);
  assert.notEqual(run("check-access-backup.sh").status, 0);
});

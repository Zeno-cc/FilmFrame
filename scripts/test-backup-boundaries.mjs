#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdtemp, mkdir, realpath, symlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = await mkdtemp(path.join(tmpdir(), "filmframe-backup-test-"));
let backupRoot = path.join(root, "backups");
const outside = path.join(root, "outside.sqlite");
await mkdir(backupRoot, { mode: 0o700 });
backupRoot = await realpath(backupRoot);
await writeFile(outside, "outside");

const old = new Date(Date.now() - 31 * 24 * 60 * 60 * 1_000);
const recent = new Date();
const oldBackup = path.join(backupRoot, "access-20260101T000000Z.sqlite");
const oldManifest = `${oldBackup}.sha256`;
const recentBackup = path.join(backupRoot, "access-20260731T000000Z.sqlite");
const malformed = path.join(backupRoot, "access-latest.sqlite");
const linked = path.join(backupRoot, "access-20250101T000000Z.sqlite");

for (const file of [oldBackup, oldManifest, recentBackup, malformed]) {
  await writeFile(file, file);
}
await utimes(oldBackup, old, old);
await utimes(oldManifest, old, old);
await utimes(recentBackup, recent, recent);
await utimes(malformed, old, old);
await symlink(outside, linked);

const result = spawnSync(
  "bash",
  [path.resolve("ops/backup/backup-access.sh"), "--cleanup-only"],
  {
    cwd: path.resolve("."),
    encoding: "utf8",
    env: {
      ...process.env,
      FILMFRAME_BACKUP_DIR: backupRoot,
      FILMFRAME_ALLOW_CUSTOM_BACKUP_DIR: "1",
      FILMFRAME_BACKUP_RETENTION_DAYS: "30",
    },
  },
);

assert.equal(result.status, 0, result.stderr);
const exists = async (file) => {
  try {
    await import("node:fs/promises").then(({ lstat }) => lstat(file));
    return true;
  } catch {
    return false;
  }
};

assert.equal(await exists(oldBackup), false);
assert.equal(await exists(oldManifest), false);
assert.equal(await exists(recentBackup), true);
assert.equal(await exists(malformed), true);
assert.equal(await exists(linked), true);
assert.equal(await exists(outside), true);

const unsafe = spawnSync(
  "bash",
  [path.resolve("ops/backup/backup-access.sh"), "--cleanup-only"],
  {
    cwd: path.resolve("."),
    encoding: "utf8",
    env: { ...process.env, FILMFRAME_BACKUP_DIR: root },
  },
);
assert.notEqual(unsafe.status, 0);

console.log("backup cleanup boundary tests passed");

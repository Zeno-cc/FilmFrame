import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { INVITE_TTL_MS, SESSION_TTL_MS } from "../src/constants.js";
import { openDatabase } from "../src/db.js";
import { runMigrations } from "../src/migrate.js";
import {
  createInvite,
  createInviteIdempotent,
  InviteUnavailableError,
  isSessionValid,
  listInvites,
  listSessions,
  pruneSessions,
  redeemInvite,
  refreshSession,
  revokeInvite,
  revokeSession,
} from "../src/store.js";

describe("invitation and session store", () => {
  it("persists hashes only and applies migrations idempotently", () => {
    const database = openDatabase(":memory:");
    const created = createInvite(database, "首位访客", 1_000);
    runMigrations(database);

    const row = database
      .prepare("SELECT code_hash, typeof(code_hash) AS hash_type FROM invites")
      .get() as { code_hash: Buffer; hash_type: string };
    assert.equal(row.hash_type, "blob");
    assert.equal(row.code_hash.length, 32);
    assert.equal(JSON.stringify(row).includes(created.code), false);
    database.close();
  });

  it("upgrades legacy sessions with public ids and last-seen timestamps", () => {
    const directory = mkdtempSync(join(tmpdir(), "filmframe-access-migration-"));
    const legacyMigrations = join(directory, "migrations");
    const databasePath = join(directory, "access.sqlite");
    mkdirSync(legacyMigrations);
    copyFileSync(join(process.cwd(), "migrations/001_initial.sql"), join(legacyMigrations, "001_initial.sql"));

    try {
      const legacy = openDatabase(databasePath, { migrationsDirectory: legacyMigrations });
      const token = "A".repeat(43);
      legacy
        .prepare(
          `INSERT INTO invites (
            id, code_hash, label, created_at, redeem_by, max_redemptions,
            redemption_count, last_redeemed_at, revoked_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run("legacy-invite", Buffer.alloc(32, 1), "旧会话", 1_000, 9_000, 1, 1, 2_000, null);
      legacy
        .prepare(
          `INSERT INTO sessions (token_hash, invite_id, created_at, expires_at, revoked_at)
           VALUES (?, ?, ?, ?, NULL)`,
        )
        .run(
          createHash("sha256").update(token).digest(),
          "legacy-invite",
          2_000,
          8_000,
        );
      legacy.close();

      const upgraded = openDatabase(databasePath);
      runMigrations(upgraded);
      const session = listSessions(upgraded, 3_000)[0];
      assert.ok(session);
      assert.match(
        session.id,
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
      assert.equal(session.lastSeenAt, 2_000);
      assert.equal(session.inviteLabel, "旧会话");
      assert.equal(isSessionValid(upgraded, token, 3_000), true);
      upgraded.close();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("creates one invitation for repeated idempotency keys without replaying plaintext", () => {
    const database = openDatabase(":memory:");
    const first = createInviteIdempotent(
      database,
      "幂等访客",
      "12345678-1234-4234-9234-123456789abc",
      1_000,
    );
    const replay = createInviteIdempotent(
      database,
      "被忽略的重试标签",
      "12345678-1234-4234-9234-123456789abc",
      2_000,
    );

    assert.equal(first.replayed, false);
    assert.match(first.code ?? "", /^FF1-/);
    assert.equal(replay.replayed, true);
    assert.equal(replay.code, null);
    assert.equal(replay.invite.id, first.invite.id);
    assert.equal(replay.invite.label, "幂等访客");
    assert.deepEqual(database.prepare("SELECT count(*) AS count FROM invites").get(), {
      count: 1,
    });
    database.close();
  });

  it("redeems once and enforces invite/session time boundaries", () => {
    const database = openDatabase(":memory:");
    const createdAt = 2_000;
    const created = createInvite(database, "边界测试", createdAt);
    const session = redeemInvite(database, created.code, createdAt + INVITE_TTL_MS);

    assert.equal(isSessionValid(database, session.token, session.expiresAt - 1), true);
    assert.equal(isSessionValid(database, session.token, session.expiresAt), false);
    assert.throws(
      () => redeemInvite(database, created.code, createdAt + 1),
      InviteUnavailableError,
    );
    database.close();
  });

  it("lets an issued session outlive natural invite expiry", () => {
    const database = openDatabase(":memory:");
    const created = createInvite(database, "自然过期", 10_000);
    const session = redeemInvite(database, created.code, 11_000);
    const afterInviteExpiry = 10_000 + INVITE_TTL_MS + 1;

    assert.ok(afterInviteExpiry < session.expiresAt);
    assert.equal(isSessionValid(database, session.token, afterInviteExpiry), true);
    database.close();
  });

  it("rejects redemption after seven days", () => {
    const database = openDatabase(":memory:");
    const created = createInvite(database, "已过期", 0);
    assert.throws(
      () => redeemInvite(database, created.code, INVITE_TTL_MS + 1),
      InviteUnavailableError,
    );
    assert.equal(listInvites(database, INVITE_TTL_MS + 1)[0]?.status, "expired");
    database.close();
  });

  it("cascades invite revocation to sessions", () => {
    const database = openDatabase(":memory:");
    const created = createInvite(database, "撤销测试", 20_000);
    const session = redeemInvite(database, created.code, 21_000);

    assert.equal(isSessionValid(database, session.token, 22_000), true);
    assert.equal(revokeInvite(database, created.invite.id, 23_000), true);
    assert.equal(isSessionValid(database, session.token, 23_001), false);
    assert.equal(listInvites(database, 23_001)[0]?.status, "revoked");
    database.close();
  });

  it("rejects a revoked invite before redemption", () => {
    const database = openDatabase(":memory:");
    const created = createInvite(database, "兑换前撤销", 24_000);
    assert.equal(revokeInvite(database, created.invite.id, 25_000), true);
    assert.throws(
      () => redeemInvite(database, created.code, 26_000),
      InviteUnavailableError,
    );
    database.close();
  });

  it("atomically rotates a valid session token and renews its expiry", () => {
    const database = openDatabase(":memory:");
    const created = createInvite(database, "续期测试", 30_000);
    const session = redeemInvite(database, created.code, 31_000);
    const renewedAt = 32_000;

    const refreshed = refreshSession(database, session.token, renewedAt);
    assert.ok(refreshed);
    assert.equal(refreshed.sessionId, session.sessionId);
    assert.notEqual(refreshed.token, session.token);
    assert.equal(refreshed.expiresAt, renewedAt + SESSION_TTL_MS);
    assert.deepEqual(
      database.prepare("SELECT expires_at FROM sessions").get(),
      { expires_at: renewedAt + SESSION_TTL_MS },
    );
    assert.equal(isSessionValid(database, session.token, renewedAt + 1), false);
    assert.equal(isSessionValid(database, refreshed.token, renewedAt + SESSION_TTL_MS - 1), true);
    assert.deepEqual(
      database
        .prepare("SELECT length(token_hash) AS size, last_seen_at FROM sessions")
        .get(),
      { size: 32, last_seen_at: renewedAt },
    );
    database.close();
  });

  it("allows only one refresh for the same old token", () => {
    const database = openDatabase(":memory:");
    const created = createInvite(database, "并发续期", 30_000);
    const session = redeemInvite(database, created.code, 31_000);

    const first = refreshSession(database, session.token, 32_000);
    const second = refreshSession(database, session.token, 32_000);
    assert.ok(first);
    assert.equal(second, null);
    assert.equal(isSessionValid(database, session.token, 32_001), false);
    assert.equal(isSessionValid(database, first.token, 32_001), true);
    database.close();
  });

  it("lists, individually revokes, and prunes retained sessions", () => {
    const database = openDatabase(":memory:");
    const firstInvite = createInvite(database, "第一台设备", 40_000);
    const first = redeemInvite(database, firstInvite.code, 41_000);
    const secondInvite = createInvite(database, "第二台设备", 42_000);
    const second = redeemInvite(database, secondInvite.code, 43_000);

    assert.equal(revokeSession(database, first.sessionId, 44_000), true);
    assert.equal(revokeSession(database, "missing-session", 44_000), false);
    assert.equal(isSessionValid(database, first.token, 44_001), false);
    assert.equal(isSessionValid(database, second.token, 44_001), true);
    assert.deepEqual(
      listSessions(database, 44_001).map(({ id, inviteLabel, status }) => ({
        id,
        inviteLabel,
        status,
      })),
      [
        { id: second.sessionId, inviteLabel: "第二台设备", status: "active" },
        { id: first.sessionId, inviteLabel: "第一台设备", status: "revoked" },
      ],
    );

    assert.equal(pruneSessions(database, 44_000 + 1_000, 1_001), 0);
    assert.equal(pruneSessions(database, 44_000 + 1_001, 1_001), 1);
    assert.equal(listSessions(database, 45_001).length, 1);
    database.close();
  });

  it("rejects a tampered session token", () => {
    const database = openDatabase(":memory:");
    const created = createInvite(database, "会话篡改", 33_000);
    const session = redeemInvite(database, created.code, 34_000);
    const last = session.token.at(-1) as string;
    const tampered = `${session.token.slice(0, -1)}${last === "A" ? "B" : "A"}`;

    assert.equal(isSessionValid(database, session.token, 35_000), true);
    assert.equal(isSessionValid(database, tampered, 35_000), false);
    assert.equal(refreshSession(database, tampered, 35_000), null);
    database.close();
  });

  it("rejects refresh for expired and invite-revoked sessions", () => {
    const database = openDatabase(":memory:");
    const expiredInvite = createInvite(database, "已过期会话", 36_000);
    const expired = redeemInvite(database, expiredInvite.code, 37_000);
    assert.equal(refreshSession(database, expired.token, expired.expiresAt), null);

    const revokedInvite = createInvite(database, "已撤销会话", 38_000);
    const revoked = redeemInvite(database, revokedInvite.code, 39_000);
    assert.equal(revokeInvite(database, revokedInvite.invite.id, 40_000), true);
    assert.equal(refreshSession(database, revoked.token, 40_001), null);
    database.close();
  });

  it("survives a database close and reopen", () => {
    const directory = mkdtempSync(join(tmpdir(), "filmframe-access-"));
    const databasePath = join(directory, "access.sqlite");
    try {
      const first = openDatabase(databasePath);
      const created = createInvite(first, "持久化", 40_000);
      const session = redeemInvite(first, created.code, 41_000);
      first.close();

      const second = openDatabase(databasePath);
      assert.equal(isSessionValid(second, session.token, 42_000), true);
      assert.equal(session.expiresAt, 41_000 + SESSION_TTL_MS);
      second.close();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("restricts the database, WAL, and shared-memory file permissions", () => {
    const directory = mkdtempSync(join(tmpdir(), "filmframe-access-mode-"));
    const databasePath = join(directory, "access.sqlite");
    try {
      const database = openDatabase(databasePath);
      createInvite(database, "权限检查", 50_000);

      assert.equal(statSync(directory).mode & 0o777, 0o700, directory);
      for (const path of [databasePath, `${databasePath}-wal`, `${databasePath}-shm`]) {
        assert.equal(statSync(path).mode & 0o777, 0o600, path);
      }
      database.close();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

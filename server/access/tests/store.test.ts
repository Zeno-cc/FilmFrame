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

import { INVITE_TTL_MS, SESSION_RETENTION_MS, SESSION_TTL_MS } from "../src/constants.js";
import { openDatabase } from "../src/db.js";
import { runMigrations } from "../src/migrate.js";
import {
  createInvite,
  createInviteBatchIdempotent,
  createInviteIdempotent,
  BatchIdempotencyConflictError,
  InvalidInviteScheduleError,
  InviteUnavailableError,
  isSessionValid,
  listInvites,
  listBatches,
  listSessions,
  pruneSessions,
  redeemInvite,
  refreshSession,
  revokeInvite,
  revokeBatch,
  revokeSession,
} from "../src/store.js";
import {
  consumeChallenge,
  recoverSessionWithPasskey,
  registerPasskeyForSession,
  pruneWebAuthnChallenges,
  revokePasskey,
  saveChallenge,
  savePasskey,
  WEBAUTHN_CHALLENGE_TTL_MS,
} from "../src/passkeyStore.js";

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
      assert.equal(listInvites(upgraded, 3_000)[0]?.redeemFrom, 1_000);

      upgraded
        .prepare(
          `INSERT INTO invites (
            id, code_hash, label, created_at, redeem_by, max_redemptions,
            redemption_count, last_redeemed_at, revoked_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          "legacy-rollback-invite",
          Buffer.alloc(32, 2),
          "旧应用回滚创建",
          2_500,
          9_500,
          1,
          0,
          null,
          null,
        );
      assert.equal(
        listInvites(upgraded, 3_000).find(({ id }) => id === "legacy-rollback-invite")
          ?.redeemFrom,
        2_500,
      );
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

  it("applies default and partial invitation schedules deterministically", () => {
    const database = openDatabase(":memory:");
    const now = 10_000;
    const defaults = createInvite(database, "默认窗口", now);
    const startOnly = createInvite(database, "只设开始", now, {
      redeemFrom: 20_000,
    });
    const endOnly = createInvite(database, "只设截止", now, {
      redeemBy: 30_000,
    });

    assert.deepEqual(
      [defaults, startOnly, endOnly].map(({ invite }) => ({
        redeemFrom: invite.redeemFrom,
        redeemBy: invite.redeemBy,
      })),
      [
        { redeemFrom: now, redeemBy: now + INVITE_TTL_MS },
        { redeemFrom: 20_000, redeemBy: 20_000 + INVITE_TTL_MS },
        { redeemFrom: now, redeemBy: 30_000 },
      ],
    );
    database.close();
  });

  it("rejects invalid invitation schedules before writing anything", () => {
    const database = openDatabase(":memory:");
    for (const schedule of [
      { redeemFrom: 2_000, redeemBy: 2_000 },
      { redeemFrom: 2_001, redeemBy: 2_000 },
      { redeemFrom: Number.NaN, redeemBy: 3_000 },
      { redeemFrom: 1_000, redeemBy: Number.MAX_SAFE_INTEGER },
    ]) {
      assert.throws(
        () => createInvite(database, "非法窗口", 1_000, schedule),
        InvalidInviteScheduleError,
      );
    }
    assert.deepEqual(database.prepare("SELECT count(*) AS count FROM invites").get(), {
      count: 0,
    });
    database.close();
  });

  it("replays end-only schedules after expiry without resolving a new window", () => {
    const database = openDatabase(":memory:");
    const redeemBy = 2_000;
    const singleKey = "12345678-1234-4234-9234-123456789ac1";
    const batchKey = "12345678-1234-4234-9234-123456789ac2";
    const single = createInviteIdempotent(
      database,
      "跨期单码",
      singleKey,
      1_000,
      { redeemBy },
    );
    const batch = createInviteBatchIdempotent(
      database,
      "跨期批次",
      2,
      batchKey,
      1_000,
      { redeemBy },
    );

    const singleReplay = createInviteIdempotent(
      database,
      "跨期单码",
      singleKey,
      redeemBy + 1,
      { redeemBy },
    );
    const batchReplay = createInviteBatchIdempotent(
      database,
      "跨期批次",
      2,
      batchKey,
      redeemBy + 1,
      { redeemBy },
    );

    assert.equal(singleReplay.replayed, true);
    assert.equal(singleReplay.invite.id, single.invite.id);
    assert.equal(singleReplay.invite.status, "expired");
    assert.equal(batchReplay.replayed, true);
    assert.equal(batchReplay.batch.id, batch.batch.id);
    assert.equal(batchReplay.invites.every(({ status }) => status === "expired"), true);
    assert.deepEqual(database.prepare("SELECT count(*) AS count FROM invites").get(), {
      count: 3,
    });
    database.close();
  });

  it("creates atomic batches at the supported boundaries and persists hashes only", () => {
    const database = openDatabase(":memory:");
    const one = createInviteBatchIdempotent(
      database,
      "单个批次",
      1,
      "12345678-1234-4234-9234-123456789ab1",
      1_000,
    );
    const fifty = createInviteBatchIdempotent(
      database,
      "大型批次",
      50,
      "12345678-1234-4234-9234-123456789ab2",
      2_000,
    );

    assert.equal(one.created.length, 1);
    assert.equal(fifty.created.length, 50);
    assert.equal(new Set(fifty.created.map(({ code }) => code)).size, 50);
    assert.equal(fifty.created.every(({ code }) => /^FF1-/.test(code)), true);
    assert.deepEqual(
      fifty.created.map(({ invite }) => invite.label).slice(0, 2),
      ["大型批次 #01", "大型批次 #02"],
    );
    const stored = JSON.stringify(
      database
        .prepare(
          "SELECT hex(code_hash) AS code_hash, label FROM invites ORDER BY created_at",
        )
        .all(),
    );
    assert.equal(fifty.created.some(({ code }) => stored.includes(code)), false);
    assert.equal(listBatches(database, 3_000).length, 2);
    database.close();
  });

  it("rejects invalid batch counts without writes", () => {
    const database = openDatabase(":memory:");
    for (const count of [0, -1, 1.5, 51]) {
      assert.throws(() =>
        createInviteBatchIdempotent(
          database,
          "非法批次",
          count,
          `12345678-1234-4234-9234-${String(count).padStart(12, "0")}`,
          1_000,
        ),
      );
    }
    assert.deepEqual(database.prepare("SELECT count(*) AS count FROM invites").get(), {
      count: 0,
    });
    assert.deepEqual(database.prepare("SELECT count(*) AS count FROM invite_batches").get(), {
      count: 0,
    });
    database.close();
  });

  it("binds batch idempotency to the normalized payload and never replays codes", () => {
    const database = openDatabase(":memory:");
    const key = "12345678-1234-4234-9234-123456789ab3";
    const first = createInviteBatchIdempotent(database, "  重试批次  ", 3, key, 1_000);
    const replay = createInviteBatchIdempotent(database, "重试批次", 3, key, 2_000);
    assert.equal(first.replayed, false);
    assert.equal(replay.replayed, true);
    assert.equal(replay.created.length, 0);
    assert.equal(replay.invites.length, 3);
    assert.equal(replay.batch.id, first.batch.id);
    assert.throws(
      () => createInviteBatchIdempotent(database, "另一个批次", 3, key, 3_000),
      BatchIdempotencyConflictError,
    );
    assert.deepEqual(database.prepare("SELECT count(*) AS count FROM invites").get(), {
      count: 3,
    });
    database.close();
  });

  it("shares one schedule across a batch and binds it to idempotency", () => {
    const database = openDatabase(":memory:");
    const key = "12345678-1234-4234-9234-123456789ac3";
    const schedule = { redeemFrom: 5_000, redeemBy: 9_000 };
    const first = createInviteBatchIdempotent(
      database,
      "预约批次",
      3,
      key,
      1_000,
      schedule,
    );
    const replay = createInviteBatchIdempotent(
      database,
      "预约批次",
      3,
      key,
      2_000,
      schedule,
    );

    assert.equal(
      first.created.every(
        ({ invite }) =>
          invite.redeemFrom === schedule.redeemFrom &&
          invite.redeemBy === schedule.redeemBy &&
          invite.status === "scheduled" &&
          invite.redeemable === false,
      ),
      true,
    );
    assert.equal(replay.replayed, true);
    assert.throws(
      () =>
        createInviteBatchIdempotent(database, "预约批次", 3, key, 2_000, {
          redeemFrom: 5_001,
          redeemBy: 9_000,
        }),
      BatchIdempotencyConflictError,
    );
    assert.deepEqual(database.prepare("SELECT count(*) AS count FROM invites").get(), {
      count: 3,
    });
    database.close();
  });

  it("rolls back the batch, invites, and idempotency record on insert failure", () => {
    const database = openDatabase(":memory:");
    database.exec(`
      CREATE TRIGGER fail_second_batch_invite
      BEFORE INSERT ON invites
      WHEN NEW.batch_position = 2
      BEGIN
        SELECT RAISE(FAIL, 'injected');
      END
    `);
    assert.throws(() =>
      createInviteBatchIdempotent(
        database,
        "回滚批次",
        3,
        "12345678-1234-4234-9234-123456789ab4",
        1_000,
      ),
    );
    for (const table of [
      "invite_batches",
      "invites",
      "invite_batch_creation_requests",
    ]) {
      assert.deepEqual(database.prepare(`SELECT count(*) AS count FROM ${table}`).get(), {
        count: 0,
      });
    }
    database.close();
  });

  it("revokes a mixed-state batch and all of its live sessions idempotently", () => {
    const database = openDatabase(":memory:");
    const batch = createInviteBatchIdempotent(
      database,
      "撤销批次",
      3,
      "12345678-1234-4234-9234-123456789ab5",
      1_000,
    );
    const session = redeemInvite(database, batch.created[0]!.code, 2_000);
    revokeInvite(database, batch.created[1]!.invite.id, 2_500);

    const first = revokeBatch(database, batch.batch.id, 3_000);
    assert.deepEqual(first, {
      batchId: batch.batch.id,
      inviteCount: 3,
      revokedInviteCount: 2,
      activeSessionCount: 1,
      revokedSessionCount: 1,
    });
    assert.equal(isSessionValid(database, session.token, 3_001), false);
    assert.equal(listInvites(database, 3_001).every(({ status }) => status === "revoked"), true);
    assert.deepEqual(revokeBatch(database, batch.batch.id, 4_000), {
      batchId: batch.batch.id,
      inviteCount: 3,
      revokedInviteCount: 0,
      activeSessionCount: 0,
      revokedSessionCount: 0,
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

  it("enforces inclusive invitation schedule boundaries", () => {
    const database = openDatabase(":memory:");
    const redeemFrom = 10_000;
    const redeemBy = 20_000;
    const startsAtBoundary = createInvite(database, "开始边界", 1_000, {
      redeemFrom,
      redeemBy,
    });
    const endsAtBoundary = createInvite(database, "截止边界", 1_000, {
      redeemFrom,
      redeemBy,
    });
    const expiresAfterBoundary = createInvite(database, "截止后", 1_000, {
      redeemFrom,
      redeemBy,
    });

    const scheduled = listInvites(database, redeemFrom - 1);
    assert.equal(scheduled.every(({ status }) => status === "scheduled"), true);
    assert.equal(scheduled.every(({ redeemable }) => redeemable === false), true);
    assert.throws(
      () => redeemInvite(database, startsAtBoundary.code, redeemFrom - 1),
      InviteUnavailableError,
    );
    assert.doesNotThrow(() =>
      redeemInvite(database, startsAtBoundary.code, redeemFrom),
    );
    assert.doesNotThrow(() => redeemInvite(database, endsAtBoundary.code, redeemBy));
    assert.throws(
      () => redeemInvite(database, expiresAfterBoundary.code, redeemBy + 1),
      InviteUnavailableError,
    );
    const expired = listInvites(database, redeemBy + 1).find(
      ({ id }) => id === expiresAfterBoundary.invite.id,
    );
    assert.equal(expired?.status, "expired");
    assert.equal(expired?.redeemable, false);
    database.close();
  });

  it("reports active device counts independently from invitation availability", () => {
    const database = openDatabase(":memory:");
    const now = 30_000;
    const created = createInvite(database, "设备计数", now, {
      redeemBy: now + 1_000,
    });
    const session = redeemInvite(database, created.code, now);

    let summary = listInvites(database, now)[0];
    assert.equal(summary?.status, "redeemed");
    assert.equal(summary?.redeemable, false);
    assert.equal(summary?.activeSessionCount, 1);

    summary = listInvites(database, now + 1_001)[0];
    assert.equal(summary?.activeSessionCount, 1);
    assert.equal(isSessionValid(database, session.token, now + 1_001), true);

    assert.equal(revokeSession(database, session.sessionId, now + 1_002), true);
    assert.equal(listInvites(database, now + 1_003)[0]?.activeSessionCount, 0);
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

  it("keeps a valid session token stable while renewing its expiry", () => {
    const database = openDatabase(":memory:");
    const created = createInvite(database, "续期测试", 30_000);
    const session = redeemInvite(database, created.code, 31_000);
    const renewedAt = 32_000;

    const refreshed = refreshSession(database, session.token, renewedAt);
    assert.ok(refreshed);
    assert.equal(refreshed.sessionId, session.sessionId);
    assert.equal(refreshed.token, session.token);
    assert.equal(refreshed.expiresAt, renewedAt + SESSION_TTL_MS);
    assert.deepEqual(
      database.prepare("SELECT expires_at FROM sessions").get(),
      { expires_at: renewedAt + SESSION_TTL_MS },
    );
    assert.equal(isSessionValid(database, session.token, renewedAt + 1), true);
    assert.equal(isSessionValid(database, refreshed.token, renewedAt + SESSION_TTL_MS - 1), true);
    assert.deepEqual(
      database
        .prepare("SELECT length(token_hash) AS size, last_seen_at FROM sessions")
        .get(),
      { size: 32, last_seen_at: renewedAt },
    );
    database.close();
  });

  it("allows repeated refreshes for the same token", () => {
    const database = openDatabase(":memory:");
    const created = createInvite(database, "并发续期", 30_000);
    const session = redeemInvite(database, created.code, 31_000);

    const first = refreshSession(database, session.token, 32_000);
    const second = refreshSession(database, session.token, 32_000);
    assert.ok(first);
    assert.ok(second);
    assert.equal(first?.token, session.token);
    assert.equal(second?.token, session.token);
    assert.equal(isSessionValid(database, session.token, 32_001), true);
    database.close();
  });

  it("consumes WebAuthn challenges once, enforces session scope, and prunes stale rows", () => {
    const database = openDatabase(":memory:");
    const invite = createInvite(database, "Passkey challenge", 10_000);
    const session = redeemInvite(database, invite.code, 10_000);
    const created = saveChallenge(database, {
      challenge: "challenge-registration",
      purpose: "registration",
      sessionId: session.sessionId,
      inviteId: invite.invite.id,
      createdAt: 10_000,
      expiresAt: 10_000 + WEBAUTHN_CHALLENGE_TTL_MS,
    });
    assert.equal(
      consumeChallenge(database, created.challenge, "registration", 10_001, "other-session"),
      null,
    );
    assert.ok(consumeChallenge(database, created.challenge, "registration", 10_001, session.sessionId));
    assert.equal(
      consumeChallenge(database, created.challenge, "registration", 10_002, "session-a"),
      null,
    );

    saveChallenge(database, {
      challenge: "expired-challenge",
      purpose: "authentication",
      sessionId: null,
      inviteId: null,
      createdAt: 20_000,
      expiresAt: 20_100,
    });
    const used = saveChallenge(database, {
      challenge: "used-challenge",
      purpose: "authentication",
      sessionId: null,
      inviteId: null,
      createdAt: 20_000,
      expiresAt: 30_000,
    });
    assert.ok(consumeChallenge(database, used.challenge, "authentication", 20_001, null));
    assert.equal(pruneWebAuthnChallenges(database, 20_000 + WEBAUTHN_CHALLENGE_TTL_MS + 1), 3);
    database.close();
  });

  it("prunes session-bound challenges before their referenced sessions", () => {
    const database = openDatabase(":memory:");
    const invite = createInvite(database, "维护顺序", 10_000);
    const session = redeemInvite(database, invite.code, 10_000);
    saveChallenge(database, {
      challenge: "retained-registration",
      purpose: "registration",
      sessionId: session.sessionId,
      inviteId: invite.invite.id,
      createdAt: 10_000,
      expiresAt: 10_000 + WEBAUTHN_CHALLENGE_TTL_MS,
    });
    const pruneAt = 10_000 + SESSION_TTL_MS + SESSION_RETENTION_MS + 1;
    assert.equal(pruneWebAuthnChallenges(database, pruneAt), 1);
    assert.equal(pruneSessions(database, pruneAt), 1);
    database.close();
  });

  it("rechecks live authorization while completing Passkey ceremonies", () => {
    const database = openDatabase(":memory:");
    const invite = createInvite(database, "Passkey 原子授权", 10_000);
    const session = redeemInvite(database, invite.code, 10_000);
    const registration = saveChallenge(database, {
      challenge: "atomic-registration",
      purpose: "registration",
      sessionId: session.sessionId,
      inviteId: invite.invite.id,
      createdAt: 10_000,
      expiresAt: 10_000 + WEBAUTHN_CHALLENGE_TTL_MS,
    });
    assert.equal(
      registerPasskeyForSession(database, {
        challengeId: registration.id,
        challenge: registration.challenge,
        sessionId: session.sessionId,
        inviteId: invite.invite.id,
        credentialId: "atomic-credential",
        publicKey: new Uint8Array([1, 2, 3]),
        counter: 0,
        deviceType: "singleDevice",
        backedUp: false,
        transports: ["internal"],
        now: 10_001,
      }),
      true,
    );

    const authentication = saveChallenge(database, {
      challenge: "atomic-authentication",
      purpose: "authentication",
      sessionId: null,
      inviteId: null,
      createdAt: 10_002,
      expiresAt: 10_002 + WEBAUTHN_CHALLENGE_TTL_MS,
    });
    const recovered = recoverSessionWithPasskey(database, {
      challengeId: authentication.id,
      challenge: authentication.challenge,
      credentialId: "atomic-credential",
      inviteId: invite.invite.id,
      expectedCounter: 0,
      newCounter: 1,
      now: 10_003,
    });
    assert.ok(recovered);
    assert.deepEqual(database.prepare("SELECT redemption_count FROM invites").get(), { redemption_count: 1 });

    const revokedCredential = savePasskey(database, {
      credentialId: "revoked-credential",
      inviteId: invite.invite.id,
      publicKey: new Uint8Array([4, 5, 6]),
      counter: 0,
      deviceType: "singleDevice",
      backedUp: false,
      transports: ["internal"],
      now: 10_004,
    });
    assert.equal(revokePasskey(database, revokedCredential.id, 10_005), true);
    const revokedAuthentication = saveChallenge(database, {
      challenge: "revoked-authentication",
      purpose: "authentication",
      sessionId: null,
      inviteId: null,
      createdAt: 10_006,
      expiresAt: 10_006 + WEBAUTHN_CHALLENGE_TTL_MS,
    });
    assert.equal(
      recoverSessionWithPasskey(database, {
        challengeId: revokedAuthentication.id,
        challenge: revokedAuthentication.challenge,
        credentialId: "revoked-credential",
        inviteId: invite.invite.id,
        expectedCounter: 0,
        newCounter: 1,
        now: 10_007,
      }),
      null,
    );
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

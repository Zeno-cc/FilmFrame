import { randomBytes, randomUUID } from "node:crypto";

import type { AccessDatabase } from "./db.js";
import {
  INVITE_TTL_MS,
  SESSION_RETENTION_MS,
  SESSION_TTL_MS,
} from "./constants.js";
import {
  generateInviteCode,
  hashInviteCode,
  hashValue,
  InvalidInviteCodeError,
} from "./inviteCode.js";

export type InviteStatus = "active" | "redeemed" | "expired" | "revoked";

export interface InviteSummary {
  id: string;
  label: string;
  createdAt: number;
  redeemBy: number;
  maxRedemptions: number;
  redemptionCount: number;
  lastRedeemedAt: number | null;
  revokedAt: number | null;
  status: InviteStatus;
  batchId: string | null;
  batchName: string | null;
  batchPosition: number | null;
}

export interface CreatedInvite {
  code: string;
  invite: InviteSummary;
}

export interface IdempotentInviteResult {
  code: string | null;
  invite: InviteSummary;
  replayed: boolean;
}

export interface BatchSummary {
  id: string;
  name: string;
  inviteCount: number;
  createdAt: number;
  revokedAt: number | null;
  activeSessionCount: number;
}

export interface BatchInviteResult {
  code: string;
  invite: InviteSummary;
}

export interface IdempotentBatchResult {
  batch: BatchSummary;
  invites: InviteSummary[];
  created: BatchInviteResult[];
  replayed: boolean;
}

export interface BatchRevocationResult {
  batchId: string;
  inviteCount: number;
  revokedInviteCount: number;
  activeSessionCount: number;
  revokedSessionCount: number;
}

export type SessionStatus = "active" | "expired" | "revoked";

export interface SessionSummary {
  id: string;
  inviteId: string;
  inviteLabel: string;
  createdAt: number;
  lastSeenAt: number;
  expiresAt: number;
  revokedAt: number | null;
  status: SessionStatus;
}

interface InviteRow {
  id: string;
  label: string;
  created_at: number;
  redeem_by: number;
  max_redemptions: number;
  redemption_count: number;
  last_redeemed_at: number | null;
  revoked_at: number | null;
  batch_id: string | null;
  batch_name: string | null;
  batch_position: number | null;
}

interface BatchRow {
  id: string;
  name: string;
  invite_count: number;
  created_at: number;
  revoked_at: number | null;
  active_session_count: number;
}

interface SessionRow {
  id: string;
  invite_id: string;
  invite_label: string;
  created_at: number;
  last_seen_at: number;
  expires_at: number;
  revoked_at: number | null;
}

export class InviteUnavailableError extends Error {
  constructor() {
    super("Invitation unavailable");
    this.name = "InviteUnavailableError";
  }
}

export class BatchIdempotencyConflictError extends Error {
  readonly status = 409;

  constructor() {
    super("Idempotency key is already bound to another batch payload");
    this.name = "BatchIdempotencyConflictError";
  }
}

function inviteStatus(row: InviteRow, now: number): InviteStatus {
  if (row.revoked_at !== null) return "revoked";
  if (row.redemption_count >= row.max_redemptions) return "redeemed";
  if (now > row.redeem_by) return "expired";
  return "active";
}

function toSummary(row: InviteRow, now: number): InviteSummary {
  return {
    id: row.id,
    label: row.label,
    createdAt: row.created_at,
    redeemBy: row.redeem_by,
    maxRedemptions: row.max_redemptions,
    redemptionCount: row.redemption_count,
    lastRedeemedAt: row.last_redeemed_at,
    revokedAt: row.revoked_at,
    status: inviteStatus(row, now),
    batchId: row.batch_id,
    batchName: row.batch_name,
    batchPosition: row.batch_position,
  };
}

function toBatchSummary(row: BatchRow): BatchSummary {
  return {
    id: row.id,
    name: row.name,
    inviteCount: row.invite_count,
    createdAt: row.created_at,
    revokedAt: row.revoked_at,
    activeSessionCount: row.active_session_count,
  };
}

function validateLabel(label: string): string {
  const normalized = label.trim();
  if (normalized.length < 1 || normalized.length > 80) {
    throw new Error("Invitation label must contain 1 to 80 characters");
  }
  return normalized;
}

function validateIdempotencyKey(key: string): string {
  if (key.length < 16 || key.length > 256 || !/^[\x21-\x7e]+$/.test(key)) {
    throw new Error("Idempotency key must contain 16 to 256 visible ASCII characters");
  }
  return key;
}

function validateBatchName(name: string): string {
  const normalized = name.trim();
  if (normalized.length < 1 || normalized.length > 64) {
    throw new Error("Batch name must contain 1 to 64 characters");
  }
  return normalized;
}

function validateBatchCount(count: number): number {
  if (!Number.isSafeInteger(count) || count < 1 || count > 50) {
    throw new Error("Batch count must be an integer between 1 and 50");
  }
  return count;
}

function createSessionId(): string {
  return randomUUID();
}

function insertInvite(
  database: AccessDatabase,
  normalizedLabel: string,
  now: number,
  batch: { id: string; name: string; position: number } | null = null,
): CreatedInvite {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const id = randomUUID();
    const generated = generateInviteCode();
    const row: InviteRow = {
      id,
      label: normalizedLabel,
      created_at: now,
      redeem_by: now + INVITE_TTL_MS,
      max_redemptions: 1,
      redemption_count: 0,
      last_redeemed_at: null,
      revoked_at: null,
      batch_id: batch?.id ?? null,
      batch_name: batch?.name ?? null,
      batch_position: batch?.position ?? null,
    };

    try {
      database
        .prepare(
          `INSERT INTO invites (
            id, code_hash, label, created_at, redeem_by, max_redemptions,
            redemption_count, last_redeemed_at, revoked_at, batch_id,
            batch_position
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          row.id,
          hashInviteCode(generated.canonical),
          row.label,
          row.created_at,
          row.redeem_by,
          row.max_redemptions,
          row.redemption_count,
          row.last_redeemed_at,
          row.revoked_at,
          row.batch_id,
          row.batch_position,
        );
      return { code: generated.display, invite: toSummary(row, now) };
    } catch (error) {
      const code = (error as { code?: unknown }).code;
      if (code !== "SQLITE_CONSTRAINT_UNIQUE") throw error;
    }
  }

  throw new Error("Unable to allocate a unique invitation code");
}

export function createInvite(
  database: AccessDatabase,
  label: string,
  now = Date.now(),
): CreatedInvite {
  const normalizedLabel = validateLabel(label);
  return insertInvite(database, normalizedLabel, now);
}

export function createInviteIdempotent(
  database: AccessDatabase,
  label: string,
  idempotencyKey: string,
  now = Date.now(),
): IdempotentInviteResult {
  const normalizedLabel = validateLabel(label);
  const key = validateIdempotencyKey(idempotencyKey);
  const keyHash = hashValue(`invite-create:${key}`);

  const transaction = database.transaction(() => {
    const existing = database
      .prepare(
        `SELECT i.id, i.label, i.created_at, i.redeem_by, i.max_redemptions,
                i.redemption_count, i.last_redeemed_at, i.revoked_at,
                i.batch_id, NULL AS batch_name, i.batch_position
         FROM invite_creation_requests request
         JOIN invites i ON i.id = request.invite_id
         WHERE request.key_hash = ?`,
      )
      .get(keyHash) as InviteRow | undefined;
    if (existing) {
      return { code: null, invite: toSummary(existing, now), replayed: true };
    }

    const created = insertInvite(database, normalizedLabel, now);
    database
      .prepare(
        `INSERT INTO invite_creation_requests (key_hash, invite_id, created_at)
         VALUES (?, ?, ?)`,
      )
      .run(keyHash, created.invite.id, now);
    return { ...created, replayed: false };
  });

  return transaction.immediate();
}

function batchRowById(
  database: AccessDatabase,
  batchId: string,
  now: number,
): BatchRow | undefined {
  return database
    .prepare(
      `SELECT b.id, b.name, b.invite_count, b.created_at, b.revoked_at,
              count(s.id) AS active_session_count
       FROM invite_batches b
       LEFT JOIN invites i ON i.batch_id = b.id
       LEFT JOIN sessions s ON s.invite_id = i.id
         AND s.revoked_at IS NULL AND s.expires_at > ?
       WHERE b.id = ?
       GROUP BY b.id`,
    )
    .get(now, batchId) as BatchRow | undefined;
}

function batchInvites(
  database: AccessDatabase,
  batchId: string,
  now: number,
): InviteSummary[] {
  const rows = database
    .prepare(
      `SELECT i.id, i.label, i.created_at, i.redeem_by, i.max_redemptions,
              i.redemption_count, i.last_redeemed_at, i.revoked_at,
              i.batch_id, b.name AS batch_name, i.batch_position
       FROM invites i
       JOIN invite_batches b ON b.id = i.batch_id
       WHERE i.batch_id = ?
       ORDER BY i.batch_position ASC`,
    )
    .all(batchId) as InviteRow[];
  return rows.map((row) => toSummary(row, now));
}

export function createInviteBatchIdempotent(
  database: AccessDatabase,
  name: string,
  count: number,
  idempotencyKey: string,
  now = Date.now(),
): IdempotentBatchResult {
  const normalizedName = validateBatchName(name);
  const normalizedCount = validateBatchCount(count);
  const key = validateIdempotencyKey(idempotencyKey);
  const keyHash = hashValue(`invite-batch-create:${key}`);
  const payloadHash = hashValue(
    JSON.stringify({ name: normalizedName, count: normalizedCount }),
  );

  const transaction = database.transaction(() => {
    const existing = database
      .prepare(
        `SELECT payload_hash, batch_id
         FROM invite_batch_creation_requests
         WHERE key_hash = ?`,
      )
      .get(keyHash) as { payload_hash: Buffer; batch_id: string } | undefined;
    if (existing) {
      if (!existing.payload_hash.equals(payloadHash)) {
        throw new BatchIdempotencyConflictError();
      }
      const row = batchRowById(database, existing.batch_id, now);
      if (!row) throw new Error("Idempotent batch target is missing");
      return {
        batch: toBatchSummary(row),
        invites: batchInvites(database, existing.batch_id, now),
        created: [],
        replayed: true,
      };
    }

    const batchId = randomUUID();
    database
      .prepare(
        `INSERT INTO invite_batches (id, name, invite_count, created_at, revoked_at)
         VALUES (?, ?, ?, ?, NULL)`,
      )
      .run(batchId, normalizedName, normalizedCount, now);

    const created: BatchInviteResult[] = [];
    for (let position = 1; position <= normalizedCount; position += 1) {
      const label = `${normalizedName} #${String(position).padStart(2, "0")}`;
      created.push(
        insertInvite(database, label, now, {
          id: batchId,
          name: normalizedName,
          position,
        }),
      );
    }
    database
      .prepare(
        `INSERT INTO invite_batch_creation_requests
          (key_hash, payload_hash, batch_id, created_at)
         VALUES (?, ?, ?, ?)`,
      )
      .run(keyHash, payloadHash, batchId, now);
    const row = batchRowById(database, batchId, now);
    if (!row) throw new Error("Created batch is missing");
    return {
      batch: toBatchSummary(row),
      invites: created.map(({ invite }) => invite),
      created,
      replayed: false,
    };
  });

  return transaction.immediate();
}

export function hasInviteBatchCreationRequest(
  database: AccessDatabase,
  idempotencyKey: string,
): boolean {
  return Boolean(
    database
      .prepare(
        "SELECT 1 FROM invite_batch_creation_requests WHERE key_hash = ?",
      )
      .get(hashValue(`invite-batch-create:${idempotencyKey}`)),
  );
}

export function listBatches(
  database: AccessDatabase,
  now = Date.now(),
): BatchSummary[] {
  const rows = database
    .prepare(
      `SELECT b.id, b.name, b.invite_count, b.created_at, b.revoked_at,
              count(s.id) AS active_session_count
       FROM invite_batches b
       LEFT JOIN invites i ON i.batch_id = b.id
       LEFT JOIN sessions s ON s.invite_id = i.id
         AND s.revoked_at IS NULL AND s.expires_at > ?
       GROUP BY b.id
       ORDER BY b.created_at DESC, b.id DESC`,
    )
    .all(now) as BatchRow[];
  return rows.map(toBatchSummary);
}

export function listInvites(
  database: AccessDatabase,
  now = Date.now(),
): InviteSummary[] {
  const rows = database
    .prepare(
      `SELECT i.id, i.label, i.created_at, i.redeem_by, i.max_redemptions,
              i.redemption_count, i.last_redeemed_at, i.revoked_at,
              i.batch_id, b.name AS batch_name, i.batch_position
       FROM invites i
       LEFT JOIN invite_batches b ON b.id = i.batch_id
       ORDER BY i.created_at DESC, i.batch_position ASC`,
    )
    .all() as InviteRow[];
  return rows.map((row) => toSummary(row, now));
}

export interface RedeemedSession {
  sessionId: string;
  token: string;
  expiresAt: number;
}

export function redeemInvite(
  database: AccessDatabase,
  submittedCode: string,
  now = Date.now(),
): RedeemedSession {
  let codeHash: Buffer;
  try {
    codeHash = hashInviteCode(submittedCode);
  } catch (error) {
    if (error instanceof InvalidInviteCodeError) throw new InviteUnavailableError();
    throw error;
  }

  const transaction = database.transaction(() => {
    const update = database
      .prepare(
        `UPDATE invites
         SET redemption_count = redemption_count + 1,
             last_redeemed_at = ?
         WHERE code_hash = ?
           AND revoked_at IS NULL
           AND redeem_by >= ?
           AND redemption_count < max_redemptions`,
      )
      .run(now, codeHash, now);

    if (update.changes !== 1) throw new InviteUnavailableError();

    const invite = database
      .prepare("SELECT id FROM invites WHERE code_hash = ?")
      .get(codeHash) as { id: string } | undefined;
    if (!invite) throw new InviteUnavailableError();

    const sessionId = createSessionId();
    const token = randomBytes(32).toString("base64url");
    const expiresAt = now + SESSION_TTL_MS;
    database
      .prepare(
        `INSERT INTO sessions (
          id, token_hash, invite_id, created_at, last_seen_at, expires_at, revoked_at
        ) VALUES (?, ?, ?, ?, ?, ?, NULL)`,
      )
      .run(sessionId, hashValue(token), invite.id, now, now, expiresAt);

    return { sessionId, token, expiresAt };
  });

  return transaction.immediate();
}

function validSessionToken(token: string): boolean {
  return token.length === 43 && /^[A-Za-z0-9_-]+$/.test(token);
}

export function isSessionValid(
  database: AccessDatabase,
  token: string | null,
  now = Date.now(),
): boolean {
  if (!token || !validSessionToken(token)) return false;

  const session = database
    .prepare(
      `SELECT s.id, s.invite_id, i.label AS invite_label, s.created_at,
              s.last_seen_at, s.expires_at, s.revoked_at
       FROM sessions s
       JOIN invites i ON i.id = s.invite_id
       WHERE s.token_hash = ?
         AND i.revoked_at IS NULL`,
    )
    .get(hashValue(token)) as SessionRow | undefined;

  return Boolean(
    session &&
      session.revoked_at === null &&
      now < session.expires_at,
  );
}

export function refreshSession(
  database: AccessDatabase,
  token: string | null,
  now = Date.now(),
): RedeemedSession | null {
  if (!token || !validSessionToken(token)) return null;

  const nextToken = randomBytes(32).toString("base64url");
  const expiresAt = now + SESSION_TTL_MS;
  const transaction = database.transaction(() => {
    const updated = database
      .prepare(
        `UPDATE sessions
         SET token_hash = ?,
             last_seen_at = ?,
             expires_at = ?
         WHERE token_hash = ?
           AND revoked_at IS NULL
           AND expires_at > ?
           AND EXISTS (
             SELECT 1
             FROM invites
             WHERE invites.id = sessions.invite_id
               AND invites.revoked_at IS NULL
           )
         RETURNING id`,
      )
      .get(hashValue(nextToken), now, expiresAt, hashValue(token), now) as
      | { id: string }
      | undefined;
    return updated
      ? { sessionId: updated.id, token: nextToken, expiresAt }
      : null;
  });

  return transaction.immediate();
}

function sessionStatus(row: SessionRow, now: number): SessionStatus {
  if (row.revoked_at !== null) return "revoked";
  if (now >= row.expires_at) return "expired";
  return "active";
}

function toSessionSummary(row: SessionRow, now: number): SessionSummary {
  return {
    id: row.id,
    inviteId: row.invite_id,
    inviteLabel: row.invite_label,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    status: sessionStatus(row, now),
  };
}

export function listSessions(
  database: AccessDatabase,
  now = Date.now(),
): SessionSummary[] {
  const rows = database
    .prepare(
      `SELECT s.id, s.invite_id, i.label AS invite_label, s.created_at,
              s.last_seen_at, s.expires_at, s.revoked_at
       FROM sessions s
       JOIN invites i ON i.id = s.invite_id
       ORDER BY s.last_seen_at DESC, s.created_at DESC`,
    )
    .all() as SessionRow[];
  return rows.map((row) => toSessionSummary(row, now));
}

export function revokeSession(
  database: AccessDatabase,
  sessionId: string,
  now = Date.now(),
): boolean {
  const result = database
    .prepare(
      `UPDATE sessions
       SET revoked_at = COALESCE(revoked_at, ?)
       WHERE id = ?
       RETURNING id`,
    )
    .get(now, sessionId) as { id: string } | undefined;
  return Boolean(result);
}

export function pruneSessions(
  database: AccessDatabase,
  now = Date.now(),
  retentionMs = SESSION_RETENTION_MS,
): number {
  if (!Number.isSafeInteger(retentionMs) || retentionMs < 0) {
    throw new Error("Session retention must be a non-negative integer");
  }
  const cutoff = now - retentionMs;
  const result = database
    .prepare(
      `DELETE FROM sessions
       WHERE expires_at <= ?
          OR (revoked_at IS NOT NULL AND revoked_at <= ?)`,
    )
    .run(cutoff, cutoff);
  return result.changes;
}

export function revokeInvite(
  database: AccessDatabase,
  inviteId: string,
  now = Date.now(),
): boolean {
  const transaction = database.transaction(() => {
    const invite = database
      .prepare("SELECT id FROM invites WHERE id = ?")
      .get(inviteId) as { id: string } | undefined;
    if (!invite) return false;

    database
      .prepare("UPDATE invites SET revoked_at = COALESCE(revoked_at, ?) WHERE id = ?")
      .run(now, inviteId);
    database
      .prepare(
        `UPDATE sessions
         SET revoked_at = COALESCE(revoked_at, ?)
         WHERE invite_id = ?`,
      )
      .run(now, inviteId);
    return true;
  });

  return transaction.immediate();
}

export function revokeBatch(
  database: AccessDatabase,
  batchId: string,
  now = Date.now(),
): BatchRevocationResult | null {
  const transaction = database.transaction(() => {
    const batch = database
      .prepare("SELECT id, invite_count FROM invite_batches WHERE id = ?")
      .get(batchId) as { id: string; invite_count: number } | undefined;
    if (!batch) return null;

    const activeSessions = database
      .prepare(
        `SELECT count(*) AS count
         FROM sessions s
         JOIN invites i ON i.id = s.invite_id
         WHERE i.batch_id = ? AND s.revoked_at IS NULL AND s.expires_at > ?`,
      )
      .get(batchId, now) as { count: number };
    const inviteUpdate = database
      .prepare(
        `UPDATE invites SET revoked_at = ?
         WHERE batch_id = ? AND revoked_at IS NULL`,
      )
      .run(now, batchId);
    const sessionUpdate = database
      .prepare(
        `UPDATE sessions SET revoked_at = ?
         WHERE revoked_at IS NULL
           AND invite_id IN (SELECT id FROM invites WHERE batch_id = ?)`,
      )
      .run(now, batchId);
    database
      .prepare(
        "UPDATE invite_batches SET revoked_at = COALESCE(revoked_at, ?) WHERE id = ?",
      )
      .run(now, batchId);
    return {
      batchId,
      inviteCount: batch.invite_count,
      revokedInviteCount: inviteUpdate.changes,
      activeSessionCount: activeSessions.count,
      revokedSessionCount: sessionUpdate.changes,
    };
  });
  return transaction.immediate();
}

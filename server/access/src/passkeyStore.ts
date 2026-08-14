import { randomBytes, randomUUID } from "node:crypto";

import type { AccessDatabase } from "./db.js";
import { hashValue } from "./inviteCode.js";
import { SESSION_TTL_MS } from "./constants.js";

export const WEBAUTHN_CHALLENGE_TTL_MS = 5 * 60 * 1_000;

export type WebAuthnChallengePurpose = "registration" | "authentication";

export interface WebAuthnChallenge {
  id: string;
  challenge: string;
  purpose: WebAuthnChallengePurpose;
  sessionId: string | null;
  inviteId: string | null;
  createdAt: number;
  expiresAt: number;
}

export interface PasskeyCredential {
  id: string;
  credentialId: string;
  inviteId: string;
  publicKey: Uint8Array;
  counter: number;
  deviceType: "singleDevice" | "multiDevice";
  backedUp: boolean;
  transports: string[];
  createdAt: number;
  lastUsedAt: number | null;
  revokedAt: number | null;
}

export interface PasskeySummary {
  id: string;
  credentialIdShort: string;
  inviteId: string;
  inviteLabel: string;
  deviceType: "singleDevice" | "multiDevice";
  backedUp: boolean;
  createdAt: number;
  lastUsedAt: number | null;
  revokedAt: number | null;
  status: "active" | "revoked";
}

export interface SessionAuthRecord {
  id: string;
  inviteId: string;
  expiresAt: number;
  revokedAt: number | null;
}

export interface PasskeySession {
  sessionId: string;
  token: string;
  expiresAt: number;
}

function decodePublicKey(value: string): Uint8Array {
  return Buffer.from(value, "base64url");
}

function encodePublicKey(value: Uint8Array): string {
  return Buffer.from(value).toString("base64url");
}

export function sessionForToken(
  database: AccessDatabase,
  token: string,
  now: number,
): SessionAuthRecord | null {
  const row = database
    .prepare(
      `SELECT s.id, s.invite_id, s.expires_at, s.revoked_at
       FROM sessions s JOIN invites i ON i.id = s.invite_id
       WHERE s.token_hash = ? AND i.revoked_at IS NULL`,
    )
    .get(hashValue(token)) as
    | { id: string; invite_id: string; expires_at: number; revoked_at: number | null }
    | undefined;
  if (!row) return null;
  const record = {
    id: row.id,
    inviteId: row.invite_id,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
  };
  if (record.revokedAt !== null || record.expiresAt <= now) return null;
  return record;
}

export function challengeById(
  database: AccessDatabase,
  id: string,
  purpose: WebAuthnChallengePurpose,
  now: number,
): WebAuthnChallenge | null {
  const row = database
    .prepare(
      `SELECT id, challenge, purpose, session_id, invite_id, created_at, expires_at
       FROM webauthn_challenges
       WHERE id = ? AND purpose = ? AND used_at IS NULL AND expires_at > ?`,
    )
    .get(id, purpose, now) as
    | {
        id: string;
        challenge: string;
        purpose: WebAuthnChallengePurpose;
        session_id: string | null;
        invite_id: string | null;
        created_at: number;
        expires_at: number;
      }
    | undefined;
  return row
    ? {
        id: row.id,
        challenge: row.challenge,
        purpose: row.purpose,
        sessionId: row.session_id,
        inviteId: row.invite_id,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
      }
    : null;
}

export function saveChallenge(
  database: AccessDatabase,
  input: Omit<WebAuthnChallenge, "id">,
): WebAuthnChallenge {
  const challenge: WebAuthnChallenge = { id: randomUUID(), ...input };
  database
    .prepare(
      `INSERT INTO webauthn_challenges
       (id, challenge, purpose, session_id, invite_id, created_at, expires_at, used_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`,
    )
    .run(
      challenge.id,
      challenge.challenge,
      challenge.purpose,
      challenge.sessionId,
      challenge.inviteId,
      challenge.createdAt,
      challenge.expiresAt,
    );
  return challenge;
}

export function consumeChallenge(
  database: AccessDatabase,
  challenge: string,
  purpose: WebAuthnChallengePurpose,
  now: number,
  sessionId: string | null,
): WebAuthnChallenge | null {
  const transaction = database.transaction(() => {
    const row = database
      .prepare(
        `SELECT id, challenge, purpose, session_id, invite_id, created_at, expires_at
         FROM webauthn_challenges
         WHERE challenge = ? AND purpose = ? AND used_at IS NULL AND expires_at > ?`,
      )
      .get(challenge, purpose, now) as
      | {
          id: string;
          challenge: string;
          purpose: WebAuthnChallengePurpose;
          session_id: string | null;
          invite_id: string | null;
          created_at: number;
          expires_at: number;
        }
      | undefined;
    if (!row || (row.session_id !== null && row.session_id !== sessionId)) return null;
    const updated = database
      .prepare("UPDATE webauthn_challenges SET used_at = ? WHERE id = ? AND used_at IS NULL")
      .run(now, row.id);
    if (updated.changes !== 1) return null;
    return {
      id: row.id,
      challenge: row.challenge,
      purpose: row.purpose,
      sessionId: row.session_id,
      inviteId: row.invite_id,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
    };
  });
  return transaction.immediate();
}

export function getPasskeyByCredentialId(
  database: AccessDatabase,
  credentialId: string,
): PasskeyCredential | null {
  const row = database
    .prepare(
      `SELECT id, credential_id, invite_id, public_key, counter, device_type,
              backed_up, transports, created_at, last_used_at, revoked_at
       FROM passkey_credentials WHERE credential_id = ?`,
    )
    .get(credentialId) as
    | {
        id: string;
        credential_id: string;
        invite_id: string;
        public_key: string;
        counter: number;
        device_type: "singleDevice" | "multiDevice";
        backed_up: number;
        transports: string | null;
        created_at: number;
        last_used_at: number | null;
        revoked_at: number | null;
      }
    | undefined;
  if (!row) return null;
  let transports: string[] = [];
  if (row.transports !== null) {
    try {
      const parsed: unknown = JSON.parse(row.transports);
      if (Array.isArray(parsed)) transports = parsed.filter((value): value is string => typeof value === "string");
    } catch {
      transports = [];
    }
  }
  return {
    id: row.id,
    credentialId: row.credential_id,
    inviteId: row.invite_id,
    publicKey: decodePublicKey(row.public_key),
    counter: row.counter,
    deviceType: row.device_type,
    backedUp: row.backed_up === 1,
    transports,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at,
  };
}

export function savePasskey(
  database: AccessDatabase,
  input: {
    credentialId: string;
    inviteId: string;
    publicKey: Uint8Array;
    counter: number;
    deviceType: "singleDevice" | "multiDevice";
    backedUp: boolean;
    transports: readonly string[];
    now: number;
  },
): PasskeyCredential {
  const id = randomUUID();
  database
    .prepare(
      `INSERT INTO passkey_credentials
       (id, credential_id, invite_id, public_key, counter, device_type, backed_up,
        transports, created_at, last_used_at, revoked_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)`,
    )
    .run(
      id,
      input.credentialId,
      input.inviteId,
      encodePublicKey(input.publicKey),
      input.counter,
      input.deviceType,
      input.backedUp ? 1 : 0,
      JSON.stringify(input.transports),
      input.now,
    );
  return getPasskeyByCredentialId(database, input.credentialId) as PasskeyCredential;
}

export function registerPasskeyForSession(
  database: AccessDatabase,
  input: {
    challengeId: string;
    challenge: string;
    sessionId: string;
    inviteId: string;
    credentialId: string;
    publicKey: Uint8Array;
    counter: number;
    deviceType: "singleDevice" | "multiDevice";
    backedUp: boolean;
    transports: readonly string[];
    now: number;
  },
): boolean {
  const transaction = database.transaction(() => {
    const session = database
      .prepare(
        `SELECT s.id, s.invite_id
         FROM sessions s JOIN invites i ON i.id = s.invite_id
         WHERE s.id = ? AND s.invite_id = ?
           AND s.revoked_at IS NULL AND s.expires_at > ?
           AND i.revoked_at IS NULL`,
      )
      .get(input.sessionId, input.inviteId, input.now) as
      | { id: string; invite_id: string }
      | undefined;
    if (!session) return false;

    const challenge = database
      .prepare(
        `SELECT id
         FROM webauthn_challenges
         WHERE id = ? AND challenge = ? AND purpose = 'registration'
           AND session_id = ? AND invite_id = ?
           AND used_at IS NULL AND expires_at > ?`,
      )
      .get(
        input.challengeId,
        input.challenge,
        input.sessionId,
        input.inviteId,
        input.now,
      ) as { id: string } | undefined;
    if (!challenge) return false;

    const consumed = database
      .prepare("UPDATE webauthn_challenges SET used_at = ? WHERE id = ? AND used_at IS NULL")
      .run(input.now, challenge.id);
    if (consumed.changes !== 1) return false;

    database
      .prepare(
        `INSERT INTO passkey_credentials
         (id, credential_id, invite_id, public_key, counter, device_type, backed_up,
          transports, created_at, last_used_at, revoked_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)`,
      )
      .run(
        randomUUID(),
        input.credentialId,
        input.inviteId,
        encodePublicKey(input.publicKey),
        input.counter,
        input.deviceType,
        input.backedUp ? 1 : 0,
        JSON.stringify(input.transports),
        input.now,
      );
    return true;
  });
  return transaction.immediate();
}

export function markPasskeyUsed(
  database: AccessDatabase,
  credentialId: string,
  counter: number,
  now: number,
): void {
  database
    .prepare(
      `UPDATE passkey_credentials SET counter = ?, last_used_at = ?
       WHERE credential_id = ? AND revoked_at IS NULL`,
    )
    .run(counter, now, credentialId);
}

export function recoverSessionWithPasskey(
  database: AccessDatabase,
  input: {
    challengeId: string;
    challenge: string;
    credentialId: string;
    inviteId: string;
    expectedCounter: number;
    newCounter: number;
    now: number;
  },
): PasskeySession | null {
  const transaction = database.transaction(() => {
    const credential = database
      .prepare(
        `SELECT p.invite_id
         FROM passkey_credentials p JOIN invites i ON i.id = p.invite_id
         WHERE p.credential_id = ? AND p.invite_id = ?
           AND p.counter = ? AND p.revoked_at IS NULL
           AND i.revoked_at IS NULL`,
      )
      .get(input.credentialId, input.inviteId, input.expectedCounter) as
      | { invite_id: string }
      | undefined;
    if (!credential) return null;

    const challenge = database
      .prepare(
        `SELECT id
         FROM webauthn_challenges
         WHERE id = ? AND challenge = ? AND purpose = 'authentication'
           AND session_id IS NULL AND invite_id IS NULL
           AND used_at IS NULL AND expires_at > ?`,
      )
      .get(input.challengeId, input.challenge, input.now) as { id: string } | undefined;
    if (!challenge) return null;

    const consumed = database
      .prepare("UPDATE webauthn_challenges SET used_at = ? WHERE id = ? AND used_at IS NULL")
      .run(input.now, challenge.id);
    if (consumed.changes !== 1) return null;

    const updated = database
      .prepare(
        `UPDATE passkey_credentials
         SET counter = ?, last_used_at = ?
         WHERE credential_id = ? AND invite_id = ?
           AND counter = ? AND revoked_at IS NULL`,
      )
      .run(
        input.newCounter,
        input.now,
        input.credentialId,
        input.inviteId,
        input.expectedCounter,
      );
    if (updated.changes !== 1) return null;

    const token = randomBytes(32).toString("base64url");
    const sessionId = randomUUID();
    const expiresAt = input.now + SESSION_TTL_MS;
    database
      .prepare(
        `INSERT INTO sessions (id, token_hash, invite_id, created_at, last_seen_at, expires_at, revoked_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL)`,
      )
      .run(sessionId, hashValue(token), input.inviteId, input.now, input.now, expiresAt);
    return { sessionId, token, expiresAt };
  });
  return transaction.immediate();
}

export function listPasskeys(database: AccessDatabase): PasskeySummary[] {
  const rows = database
    .prepare(
      `SELECT p.id, p.credential_id, p.invite_id, i.label AS invite_label,
              p.device_type, p.backed_up, p.created_at, p.last_used_at, p.revoked_at
       FROM passkey_credentials p JOIN invites i ON i.id = p.invite_id
       ORDER BY p.created_at DESC, p.id DESC`,
    )
    .all() as Array<{
    id: string;
    credential_id: string;
    invite_id: string;
    invite_label: string;
    device_type: "singleDevice" | "multiDevice";
    backed_up: number;
    created_at: number;
    last_used_at: number | null;
    revoked_at: number | null;
  }>;
  return rows.map((row) => ({
    id: row.id,
    credentialIdShort: row.credential_id.slice(0, 12),
    inviteId: row.invite_id,
    inviteLabel: row.invite_label,
    deviceType: row.device_type,
    backedUp: row.backed_up === 1,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at,
    status: row.revoked_at === null ? "active" : "revoked",
  }));
}

export function revokePasskey(database: AccessDatabase, id: string, now: number): boolean {
  const result = database
    .prepare("UPDATE passkey_credentials SET revoked_at = COALESCE(revoked_at, ?) WHERE id = ? RETURNING id")
    .get(now, id) as { id: string } | undefined;
  return Boolean(result);
}

export function pruneWebAuthnChallenges(database: AccessDatabase, now: number): number {
  return database
    .prepare("DELETE FROM webauthn_challenges WHERE expires_at <= ? OR used_at <= ?")
    .run(now, now - WEBAUTHN_CHALLENGE_TTL_MS)
    .changes;
}

export function createSessionForInvite(
  database: AccessDatabase,
  inviteId: string,
  now: number,
): { sessionId: string; token: string; expiresAt: number } | null {
  const transaction = database.transaction(() => {
    const invite = database
      .prepare("SELECT id FROM invites WHERE id = ? AND revoked_at IS NULL")
      .get(inviteId) as { id: string } | undefined;
    if (!invite) return null;
    const token = randomBytes(32).toString("base64url");
    const sessionId = randomUUID();
    const expiresAt = now + SESSION_TTL_MS;
    database
      .prepare(
        `INSERT INTO sessions (id, token_hash, invite_id, created_at, last_seen_at, expires_at, revoked_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL)`,
      )
      .run(sessionId, hashValue(token), inviteId, now, now, expiresAt);
    return { sessionId, token, expiresAt };
  });
  return transaction.immediate();
}

CREATE TABLE sessions_next (
  id TEXT PRIMARY KEY,
  token_hash BLOB NOT NULL UNIQUE,
  invite_id TEXT NOT NULL REFERENCES invites(id),
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER
);

INSERT INTO sessions_next (
  id, token_hash, invite_id, created_at, last_seen_at, expires_at, revoked_at
)
SELECT
  lower(
    hex(randomblob(4)) || '-' ||
    hex(randomblob(2)) || '-' ||
    '4' || substr(hex(randomblob(2)), 2) || '-' ||
    substr('89ab', abs(random() % 4) + 1, 1) || substr(hex(randomblob(2)), 2) || '-' ||
    hex(randomblob(6))
  ),
  token_hash,
  invite_id,
  created_at,
  created_at,
  expires_at,
  revoked_at
FROM sessions;

DROP TABLE sessions;
ALTER TABLE sessions_next RENAME TO sessions;

CREATE INDEX idx_sessions_invite_id ON sessions(invite_id);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);
CREATE INDEX idx_sessions_last_seen_at ON sessions(last_seen_at);
CREATE INDEX idx_sessions_revoked_at ON sessions(revoked_at);

CREATE TABLE invite_creation_requests (
  key_hash BLOB PRIMARY KEY,
  invite_id TEXT NOT NULL UNIQUE REFERENCES invites(id),
  created_at INTEGER NOT NULL
);

CREATE TABLE health_checks (
  id TEXT PRIMARY KEY,
  checked_at INTEGER NOT NULL
);

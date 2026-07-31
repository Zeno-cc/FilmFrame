CREATE TABLE invites (
  id TEXT PRIMARY KEY,
  code_hash BLOB NOT NULL UNIQUE,
  label TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  redeem_by INTEGER NOT NULL,
  max_redemptions INTEGER NOT NULL DEFAULT 1 CHECK (max_redemptions > 0),
  redemption_count INTEGER NOT NULL DEFAULT 0 CHECK (redemption_count >= 0),
  last_redeemed_at INTEGER,
  revoked_at INTEGER
);

CREATE TABLE sessions (
  token_hash BLOB PRIMARY KEY,
  invite_id TEXT NOT NULL REFERENCES invites(id),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER
);

CREATE INDEX idx_invites_redeem_by ON invites(redeem_by);
CREATE INDEX idx_sessions_invite_id ON sessions(invite_id);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);

CREATE TABLE invite_batches (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  invite_count INTEGER NOT NULL CHECK (invite_count BETWEEN 1 AND 50),
  created_at INTEGER NOT NULL,
  revoked_at INTEGER
);

ALTER TABLE invites ADD COLUMN batch_id TEXT REFERENCES invite_batches(id);
ALTER TABLE invites ADD COLUMN batch_position INTEGER;

CREATE UNIQUE INDEX idx_invites_batch_position
  ON invites(batch_id, batch_position)
  WHERE batch_id IS NOT NULL;
CREATE INDEX idx_invites_batch_id ON invites(batch_id);
CREATE INDEX idx_invite_batches_created_at ON invite_batches(created_at DESC);

CREATE TABLE invite_batch_creation_requests (
  key_hash BLOB PRIMARY KEY,
  payload_hash BLOB NOT NULL,
  batch_id TEXT NOT NULL UNIQUE REFERENCES invite_batches(id),
  created_at INTEGER NOT NULL
);

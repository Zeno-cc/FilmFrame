ALTER TABLE invites ADD COLUMN redeem_from INTEGER NOT NULL DEFAULT 0;

UPDATE invites
SET redeem_from = created_at
WHERE redeem_from = 0;

CREATE TRIGGER invites_set_legacy_redeem_from
AFTER INSERT ON invites
WHEN NEW.redeem_from = 0
BEGIN
  UPDATE invites SET redeem_from = NEW.created_at WHERE id = NEW.id;
END;

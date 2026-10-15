ALTER TABLE monitors ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE monitors ADD CONSTRAINT deleted_monitors_cannot_run
    CHECK (deleted_at IS NULL OR (NOT enabled AND next_check_at IS NULL));
CREATE INDEX monitors_live_owner_idx ON monitors (owner_subject) WHERE deleted_at IS NULL;

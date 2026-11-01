-- "Not yet evaluated" was answered with NOT EXISTS against incident_evaluations, which reads every execution and every
-- evaluation ever kept. The incident processor asked that every second, the system metrics every five seconds and each
-- dashboard poll once more, so the cost grew with retained history until the database spent its time on disk reads.
-- A flag with a partial index keeps the answer proportional to the work still in flight.

-- Existing rows read as evaluated without a table rewrite; new rows start out awaiting evaluation.
ALTER TABLE probe_executions ADD COLUMN awaiting_evaluation BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE probe_executions ALTER COLUMN awaiting_evaluation SET DEFAULT TRUE;

UPDATE probe_executions executions
SET awaiting_evaluation = TRUE
WHERE NOT EXISTS (
    SELECT 1 FROM incident_evaluations evaluations
    WHERE evaluations.execution_id = executions.execution_id
);

-- The database keeps the flag in step with incident_evaluations, so no writer can forget it.
-- The incident processor already holds the execution row (FOR NO KEY UPDATE), so this adds no new lock.
CREATE FUNCTION mark_execution_evaluated() RETURNS trigger AS $$
BEGIN
    UPDATE probe_executions SET awaiting_evaluation = FALSE WHERE execution_id = NEW.execution_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER incident_evaluations_mark_execution_evaluated
    AFTER INSERT ON incident_evaluations
    FOR EACH ROW EXECUTE FUNCTION mark_execution_evaluated();

-- Holds PENDING executions and finalized ones the incident processor has not reached: a handful, whatever the history.
CREATE INDEX probe_executions_awaiting_evaluation_idx
    ON probe_executions (monitor_id, scheduled_at, execution_id)
    WHERE awaiting_evaluation;

-- outbox_events_ready_idx covers only events still eligible for publishing; this one also covers failed events.
CREATE INDEX outbox_events_unpublished_idx
    ON outbox_events (aggregate_id)
    WHERE published_at IS NULL;

-- Without statistics for the new column the planner may not trust the partial index until autovacuum analyzes.
ANALYZE probe_executions;
ANALYZE outbox_events;

CREATE TABLE monitor_schedule_periods
(
    period_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    monitor_id       UUID                     NOT NULL REFERENCES monitors (monitor_id),
    first_check_at   TIMESTAMP WITH TIME ZONE NOT NULL,
    stopped_at       TIMESTAMP WITH TIME ZONE,
    interval_seconds INTEGER                  NOT NULL,

    CONSTRAINT monitor_schedule_periods_interval_range
        CHECK (interval_seconds BETWEEN 30 AND 86400),
    CONSTRAINT monitor_schedule_periods_time_order
        CHECK (stopped_at IS NULL OR stopped_at >= first_check_at)
);

CREATE UNIQUE INDEX monitor_schedule_one_open_period_idx
    ON monitor_schedule_periods (monitor_id)
    WHERE stopped_at IS NULL;

CREATE INDEX monitor_schedule_periods_monitor_time_idx
    ON monitor_schedule_periods (monitor_id, first_check_at);

-- Existing monitors predate schedule history. The reference has no edit/disable API
-- before this migration, so the creation-time cadence is the only known cadence.
INSERT INTO monitor_schedule_periods
    (monitor_id, first_check_at, stopped_at, interval_seconds)
SELECT monitor_id,
       created_at,
       CASE WHEN enabled THEN NULL ELSE GREATEST(created_at, updated_at) END,
       check_interval_seconds
FROM monitors;

CREATE FUNCTION record_monitor_schedule_period() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO monitor_schedule_periods
            (monitor_id, first_check_at, stopped_at, interval_seconds)
        VALUES (
            NEW.monitor_id,
            NEW.created_at,
            CASE WHEN NEW.enabled THEN NULL ELSE GREATEST(NEW.created_at, NEW.updated_at) END,
            NEW.check_interval_seconds
        );
        RETURN NEW;
    END IF;

    IF OLD.enabled AND (
        NOT NEW.enabled OR OLD.check_interval_seconds <> NEW.check_interval_seconds
    ) THEN
        UPDATE monitor_schedule_periods
        SET stopped_at = GREATEST(first_check_at, NEW.updated_at)
        WHERE monitor_id = NEW.monitor_id
          AND stopped_at IS NULL;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'enabled monitor % has no open schedule period', NEW.monitor_id;
        END IF;
    END IF;

    IF NEW.enabled AND (
        NOT OLD.enabled OR OLD.check_interval_seconds <> NEW.check_interval_seconds
    ) THEN
        INSERT INTO monitor_schedule_periods
            (monitor_id, first_check_at, interval_seconds)
        VALUES (NEW.monitor_id, NEW.next_check_at, NEW.check_interval_seconds);
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER monitors_record_initial_schedule
    AFTER INSERT ON monitors
    FOR EACH ROW EXECUTE FUNCTION record_monitor_schedule_period();

CREATE TRIGGER monitors_record_schedule_change
    AFTER UPDATE OF enabled, check_interval_seconds ON monitors
    FOR EACH ROW EXECUTE FUNCTION record_monitor_schedule_period();

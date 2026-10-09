-- Operator-only addition for an already seeded demo. psql must use ON_ERROR_STOP=1.
BEGIN;
-- Serialize against API creations too, so the two configured caps stay enforced.
LOCK TABLE monitors IN SHARE ROW EXCLUSIVE MODE;
CREATE TEMP TABLE drill_owner (subject text) ON COMMIT DROP;
INSERT INTO drill_owner VALUES (:'demo_subject');
DO $$
DECLARE
    subject text := (SELECT drill_owner.subject FROM drill_owner);
BEGIN
    IF subject IS NULL OR subject !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
        RAISE EXCEPTION 'Expected the demo Cognito subject UUID';
    END IF;
    -- Keep this operator fallback usable before and after the V11 migration.
    IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'monitors'::regclass
               AND attname = 'deleted_at' AND NOT attisdropped) THEN
        EXECUTE 'CREATE TEMP VIEW drill_live_monitors AS SELECT * FROM monitors WHERE deleted_at IS NULL';
    ELSE
        EXECUTE 'CREATE TEMP VIEW drill_live_monitors AS SELECT * FROM monitors';
    END IF;
    IF EXISTS (SELECT 1 FROM drill_live_monitors WHERE owner_subject = subject
               AND target_url = 'https://rcp-ali.duckdns.org/drill/status.html') THEN
        RAISE NOTICE 'Drill monitor already exists; unchanged';
        RETURN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM drill_live_monitors WHERE owner_subject = subject) THEN
        RAISE EXCEPTION 'Existing demo workspace not found; verify demo_owner_subject';
    END IF;
    IF (SELECT count(*) FROM drill_live_monitors) >= 8 THEN
        RAISE EXCEPTION 'Global monitor cap of 8 reached';
    END IF;
    IF (SELECT count(*) FROM drill_live_monitors WHERE owner_subject = subject) >= 5 THEN
        RAISE EXCEPTION 'Demo owner quota of 5 reached';
    END IF;
    INSERT INTO monitors (monitor_id, owner_subject, name, target_url,
                          check_interval_seconds, timeout_ms, enabled, next_check_at)
    VALUES (gen_random_uuid(), subject, 'Scheduled outage drill',
            'https://rcp-ali.duckdns.org/drill/status.html', 60, 5000, true, CURRENT_TIMESTAMP);
    -- The existing database trigger creates the schedule-history period.
END;
$$;
DROP VIEW drill_live_monitors;
COMMIT;

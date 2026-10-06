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
    IF EXISTS (SELECT 1 FROM monitors WHERE owner_subject = subject
               AND target_url = 'https://rcp-ali.duckdns.org/drill/status.html') THEN
        RAISE NOTICE 'Drill monitor already exists; unchanged';
        RETURN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM monitors WHERE owner_subject = subject) THEN
        RAISE EXCEPTION 'Existing demo workspace not found; verify demo_owner_subject';
    END IF;
    IF (SELECT count(*) FROM monitors) >= 8 THEN
        RAISE EXCEPTION 'Global monitor cap of 8 reached';
    END IF;
    IF (SELECT count(*) FROM monitors WHERE owner_subject = subject) >= 3 THEN
        RAISE EXCEPTION 'Demo owner quota of 3 reached';
    END IF;
    INSERT INTO monitors (monitor_id, owner_subject, name, target_url,
                          check_interval_seconds, timeout_ms, enabled, next_check_at)
    VALUES (gen_random_uuid(), subject, 'Scheduled outage drill',
            'https://rcp-ali.duckdns.org/drill/status.html', 60, 5000, true, CURRENT_TIMESTAMP);
    -- The existing database trigger creates the schedule-history period.
END;
$$;
COMMIT;

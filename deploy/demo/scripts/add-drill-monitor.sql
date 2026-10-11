-- Operator-only addition for an already seeded demo. psql must use ON_ERROR_STOP=1.
BEGIN;
CREATE TEMP TABLE drill_owner (subject text) ON COMMIT DROP;
INSERT INTO drill_owner VALUES (:'demo_subject');
DO $$
DECLARE
    subject text := (SELECT drill_owner.subject FROM drill_owner);
    owner_key bigint := 0;
    character_index integer;
BEGIN
    IF subject IS NULL OR subject !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
        RAISE EXCEPTION 'Expected the demo Cognito subject UUID';
    END IF;
    -- Cognito subjects are ASCII UUIDs. Match Java String.hashCode and MonitorService's owner-lock family.
    FOR character_index IN 1..length(subject) LOOP
      owner_key := (owner_key * 31 + ascii(substr(subject, character_index, 1))) % 4294967296;
    END LOOP;
    IF owner_key >= 2147483648 THEN owner_key := owner_key - 4294967296; END IF;
    PERFORM pg_advisory_xact_lock(1380143181, owner_key::integer);
    LOCK TABLE monitors IN SHARE ROW EXCLUSIVE MODE;
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
    IF (SELECT count(*) FROM drill_live_monitors WHERE owner_subject = subject) >= 15 THEN
        RAISE EXCEPTION 'Separate demo fleet ceiling of 15 reached';
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

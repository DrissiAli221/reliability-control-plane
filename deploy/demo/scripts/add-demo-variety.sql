-- Operator-only, idempotent fleet additions. Invoke psql with ON_ERROR_STOP=1.
BEGIN;
CREATE TEMP TABLE variety_owner (subject text) ON COMMIT DROP;
INSERT INTO variety_owner VALUES (:'demo_subject');
CREATE TEMP TABLE variety_targets (name text, url text) ON COMMIT DROP;
INSERT INTO variety_targets VALUES
  ('GitHub Status', 'https://www.githubstatus.com/api/v2/status.json'),
  ('Cloudflare Status', 'https://www.cloudflarestatus.com/api/v2/status.json');
DO $$
DECLARE
  subject text := (SELECT variety_owner.subject FROM variety_owner);
  missing integer;
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
  -- The fallback also supports deployments that have not applied V11 yet.
  -- All capacity, workspace and target checks below use this live-row view.
  IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'monitors'::regclass
             AND attname = 'deleted_at' AND NOT attisdropped) THEN
    EXECUTE 'CREATE TEMP VIEW variety_live_monitors AS SELECT * FROM monitors WHERE deleted_at IS NULL';
  ELSE
    EXECUTE 'CREATE TEMP VIEW variety_live_monitors AS SELECT * FROM monitors';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM variety_live_monitors WHERE owner_subject = subject) THEN
    RAISE EXCEPTION 'Existing demo workspace not found; verify demo_owner_subject';
  END IF;
  SELECT count(*) INTO missing FROM variety_targets t WHERE NOT EXISTS
    (SELECT 1 FROM variety_live_monitors m WHERE m.owner_subject = subject AND m.target_url = t.url);
  IF (SELECT count(*) FROM variety_live_monitors WHERE owner_subject = subject) + missing > 15 THEN
    RAISE EXCEPTION 'Demo fleet ceiling of 15 would be exceeded';
  END IF;
  INSERT INTO monitors (monitor_id, owner_subject, name, target_url,
                        check_interval_seconds, timeout_ms, enabled, next_check_at)
    SELECT gen_random_uuid(), subject, t.name, t.url, 60, 5000, true, CURRENT_TIMESTAMP
      FROM variety_targets t WHERE NOT EXISTS
        (SELECT 1 FROM variety_live_monitors m WHERE m.owner_subject = subject AND m.target_url = t.url);
END;
$$;
DROP VIEW variety_live_monitors;
COMMIT;

-- Operator-only, idempotent fleet additions. Invoke psql with ON_ERROR_STOP=1.
BEGIN;
LOCK TABLE monitors IN SHARE ROW EXCLUSIVE MODE;
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
BEGIN
  IF subject IS NULL OR subject !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
    RAISE EXCEPTION 'Expected the demo Cognito subject UUID';
  END IF;
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
  IF (SELECT count(*) FROM variety_live_monitors) + missing > 8 THEN
    RAISE EXCEPTION 'Global monitor cap of 8 would be exceeded';
  END IF;
  IF (SELECT count(*) FROM variety_live_monitors WHERE owner_subject = subject) + missing > 5 THEN
    RAISE EXCEPTION 'Owner quota of 5 would be exceeded';
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

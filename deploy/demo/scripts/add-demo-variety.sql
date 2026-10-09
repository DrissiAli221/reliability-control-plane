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
  IF NOT EXISTS (SELECT 1 FROM monitors WHERE owner_subject = subject) THEN
    RAISE EXCEPTION 'Existing demo workspace not found; verify demo_owner_subject';
  END IF;
  SELECT count(*) INTO missing FROM variety_targets t WHERE NOT EXISTS
    (SELECT 1 FROM monitors m WHERE m.owner_subject = subject AND m.target_url = t.url);
  IF (SELECT count(*) FROM monitors) + missing > 8 THEN
    RAISE EXCEPTION 'Global monitor cap of 8 would be exceeded';
  END IF;
  IF (SELECT count(*) FROM monitors WHERE owner_subject = subject) + missing > 5 THEN
    RAISE EXCEPTION 'Owner quota of 5 would be exceeded';
  END IF;
  INSERT INTO monitors (monitor_id, owner_subject, name, target_url,
                        check_interval_seconds, timeout_ms, enabled, next_check_at)
    SELECT gen_random_uuid(), subject, t.name, t.url, 60, 5000, true, CURRENT_TIMESTAMP
      FROM variety_targets t WHERE NOT EXISTS
        (SELECT 1 FROM monitors m WHERE m.owner_subject = subject AND m.target_url = t.url);
END;
$$;
COMMIT;

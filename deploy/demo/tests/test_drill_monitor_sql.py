"""Test the operator transaction against an isolated local PostgreSQL cluster."""
import os
from concurrent.futures import ThreadPoolExecutor, TimeoutError
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

DEMO = Path(__file__).resolve().parent.parent
MIGRATIONS = DEMO.parent.parent / "rcp-control-plane/src/main/resources/db/migration"
SUBJECT = "11111111-2222-3333-4444-555555555555"


@unittest.skipUnless(all(shutil.which(tool) for tool in ["initdb", "pg_ctl", "psql"]),
                     "Requires local PostgreSQL tools; never connects to the deployed database")
class DrillMonitorSQL(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix="rcp-drill-pg-", dir="/tmp")
        cls.directory = Path(cls.temp.name)
        cls.env = {key: value for key, value in os.environ.items() if not key.startswith("PG")} | {"PGHOST": str(cls.directory), "PGDATABASE": "postgres",
                                "PGUSER": "rcp_drill_test", "PGPORT": "55439"}
        subprocess.run(["initdb", "-D", str(cls.directory / "data"), "-U", "rcp_drill_test",
                        "--no-locale", "-E", "UTF8", "-A", "trust"], check=True, capture_output=True)
        subprocess.run(["pg_ctl", "-D", str(cls.directory / "data"), "-l", str(cls.directory / "log"),
                        "-o", f"-k {cls.directory} -p 55439 -c listen_addresses=''", "-w", "start"],
                       check=True, capture_output=True)

    @classmethod
    def tearDownClass(cls):
        try:
            subprocess.run(["pg_ctl", "-D", str(cls.directory / "data"), "-m", "immediate", "-w", "stop"],
                           check=True, capture_output=True)
        finally:
            cls.temp.cleanup()

    def sql(self, sql, *, subject=SUBJECT, success=True):
        result = subprocess.run(["psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1",
                                 "-v", "demo_subject=" + subject], input=sql, text=True,
                                env=self.env, capture_output=True)
        if success:
            self.assertEqual(result.returncode, 0, result.stderr)
        else:
            self.assertNotEqual(result.returncode, 0)
        return result.stdout.strip()

    def setUp(self):
        self.sql("DROP SCHEMA public CASCADE; CREATE SCHEMA public;" +
                 (MIGRATIONS / "V1__create_monitors_table.sql").read_text() + "\n" +
                 (MIGRATIONS / "V7__create_monitor_schedule_periods.sql").read_text())
        self.add_monitors(2, SUBJECT)

    def add_monitors(self, count, subject):
        self.sql(f"""INSERT INTO monitors (monitor_id, owner_subject, name, target_url,
                    check_interval_seconds, timeout_ms, next_check_at)
                    SELECT gen_random_uuid(), '{subject}', 'Existing ' || n,
                    'https://example.com/' || n, 60, 5000, CURRENT_TIMESTAMP
                    FROM generate_series(1, {count}) n;""")

    def test_add_is_idempotent_and_creates_schedule_history(self):
        script = (DEMO / "scripts/add-drill-monitor.sql").read_text()
        self.sql(script)
        self.sql(script)
        self.assertEqual(self.sql("SELECT count(*) FROM monitors"), "3")
        self.assertEqual(self.sql("SELECT count(*) FROM monitor_schedule_periods"), "3")
        self.assertEqual(self.sql("SELECT check_interval_seconds || ',' || timeout_ms FROM monitors "
                                  "WHERE name = 'Scheduled outage drill'"), "60,5000")
        self.assertEqual(self.sql("SELECT count(*) FROM monitors WHERE name LIKE 'Existing %'"), "2")

    def test_demo_ceiling_is_atomic_and_does_not_consume_visitor_capacity(self):
        script = (DEMO / "scripts/add-drill-monitor.sql").read_text()
        self.add_monitors(13, SUBJECT)
        self.sql(script, success=False)
        self.assertEqual(self.sql("SELECT count(*) FROM monitors"), "15")
        self.setUp()
        self.add_monitors(30, "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")
        self.sql(script)
        self.assertEqual(self.sql("SELECT count(*) FROM monitors"), "33")

    def test_variety_is_idempotent_preserves_history_and_has_atomic_caps(self):
        script = (DEMO / "scripts/add-demo-variety.sql").read_text()
        self.sql(script)
        self.sql(script)
        self.assertEqual(self.sql("SELECT count(*) FROM monitors"), "4")
        self.assertEqual(self.sql("SELECT count(*) FROM monitor_schedule_periods"), "4")
        self.assertEqual(self.sql("SELECT count(*) FROM monitors WHERE name LIKE 'Existing %'"), "2")
        self.setUp()
        self.add_monitors(12, SUBJECT)
        self.sql(script, success=False)
        self.assertEqual(self.sql("SELECT count(*) FROM monitors"), "14")
        self.setUp()
        self.add_monitors(30, "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")
        self.sql(script)
        self.assertEqual(self.sql("SELECT count(*) FROM monitors"), "34")

    def test_unknown_or_invalid_subject_cannot_create_workspace(self):
        for subject in ["not-a-subject", "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"]:
            with self.subTest(subject=subject):
                self.sql((DEMO / "scripts/add-drill-monitor.sql").read_text(), subject=subject, success=False)
                self.assertEqual(self.sql("SELECT count(*) FROM monitors"), "2")

    def enable_soft_delete(self):
        self.sql((MIGRATIONS / "V11__soft_delete_monitors.sql").read_text())

    def add_deleted(self, count, subject):
        self.sql(f"""INSERT INTO monitors (monitor_id, owner_subject, name, target_url,
                    check_interval_seconds, timeout_ms, enabled, next_check_at, deleted_at)
                    SELECT gen_random_uuid(), '{subject}', 'Deleted ' || n,
                    'https://example.com/deleted/' || n, 60, 5000, false, NULL, CURRENT_TIMESTAMP
                    FROM generate_series(1, {count}) n;""")

    def test_deleted_rows_free_both_quotas_without_erasing_history(self):
        for helper, added in [('add-demo-variety.sql', 2), ('add-drill-monitor.sql', 1)]:
            with self.subTest(helper=helper):
                self.setUp()
                self.enable_soft_delete()
                self.add_deleted(5, SUBJECT)
                self.add_deleted(5, "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")
                before = self.sql("SELECT monitor_id FROM monitors ORDER BY monitor_id")
                self.sql((DEMO / 'scripts' / helper).read_text())
                self.assertEqual(self.sql("SELECT count(*) FROM monitors WHERE deleted_at IS NULL"), str(2 + added))
                self.assertEqual(self.sql("SELECT count(*) FROM monitors WHERE deleted_at IS NOT NULL AND NOT enabled"), "10")
                self.assertEqual(self.sql("SELECT count(*) FROM monitor_schedule_periods WHERE stopped_at IS NOT NULL"), "10")
                self.assertTrue(set(before.splitlines()).issubset(self.sql("SELECT monitor_id FROM monitors").splitlines()))

    def test_deleted_targets_are_recreated_once_with_new_ids(self):
        targets = {
            'add-demo-variety.sql': ['https://www.githubstatus.com/api/v2/status.json',
                                     'https://www.cloudflarestatus.com/api/v2/status.json'],
            'add-drill-monitor.sql': ['https://rcp-ali.duckdns.org/drill/status.html'],
        }
        for helper, urls in targets.items():
            with self.subTest(helper=helper):
                self.setUp()
                self.enable_soft_delete()
                for url in urls:
                    self.sql(f"""INSERT INTO monitors (monitor_id,owner_subject,name,target_url,
                              check_interval_seconds,timeout_ms,enabled,next_check_at,deleted_at)
                              VALUES (gen_random_uuid(),'{SUBJECT}','Old target','{url}',60,5000,false,NULL,CURRENT_TIMESTAMP);""")
                old_ids = set(self.sql("SELECT monitor_id FROM monitors WHERE deleted_at IS NOT NULL").splitlines())
                script = (DEMO / 'scripts' / helper).read_text()
                self.sql(script)
                first_ids = self.sql("SELECT monitor_id FROM monitors WHERE deleted_at IS NULL ORDER BY monitor_id")
                # Both runs share one psql session: helper-local views must be cleaned up.
                self.sql(script + '\n' + script)
                self.assertEqual(self.sql("SELECT monitor_id FROM monitors WHERE deleted_at IS NULL ORDER BY monitor_id"), first_ids)
                self.assertEqual(self.sql("SELECT count(*) FROM monitors WHERE deleted_at IS NULL"), str(2 + len(urls)))
                self.assertEqual(set(self.sql("SELECT monitor_id FROM monitors WHERE deleted_at IS NOT NULL").splitlines()), old_ids)
                self.assertTrue(old_ids.isdisjoint(first_ids.splitlines()))

    def test_soft_delete_keeps_demo_ceiling_and_failure_atomicity(self):
        for helper, additions in [('add-demo-variety.sql', 2), ('add-drill-monitor.sql', 1)]:
            with self.subTest(helper=helper):
                self.setUp()
                self.enable_soft_delete()
                self.add_deleted(10, SUBJECT)
                self.add_monitors(14 - additions, SUBJECT)
                before = self.sql("SELECT monitor_id FROM monitors ORDER BY monitor_id")
                self.sql((DEMO / 'scripts' / helper).read_text(), success=False)
                self.assertEqual(self.sql("SELECT monitor_id FROM monitors ORDER BY monitor_id"), before)

    def test_deleted_only_workspace_does_not_authorize_sql_seeding(self):
        for helper in ['add-demo-variety.sql', 'add-drill-monitor.sql']:
            with self.subTest(helper=helper):
                self.setUp()
                self.enable_soft_delete()
                self.sql("UPDATE monitors SET enabled=false,next_check_at=NULL,deleted_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP")
                self.sql((DEMO / 'scripts' / helper).read_text(), success=False)
                self.assertEqual(self.sql("SELECT count(*) FROM monitors"), "2")
                self.assertEqual(self.sql("SELECT count(*) FROM monitors WHERE deleted_at IS NULL"), "0")


    def test_operator_helpers_share_the_backend_owner_lock_before_counting(self):
        # A backend transaction has checked capacity, but has not inserted yet.
        # Without the same owner lock, an operator can fill its last slots and the backend can then exceed 15.
        owner_key = 0
        for character in SUBJECT:
            owner_key = (owner_key * 31 + ord(character)) & 0xffffffff
        if owner_key >= 0x80000000:
            owner_key -= 0x100000000
        for helper, additions in [('add-demo-variety.sql', 2), ('add-drill-monitor.sql', 1)]:
            with self.subTest(helper=helper):
                self.setUp()
                self.add_monitors(13 - additions, SUBJECT)
                backend = subprocess.Popen(['psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'],
                                           stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                           text=True, env=self.env)
                try:
                    backend.stdin.write(f"BEGIN; SELECT pg_advisory_xact_lock(1380143181, {owner_key}); "
                                        f"SELECT count(*) FROM monitors WHERE owner_subject = '{SUBJECT}';\n"
                                        "\\echo READY\n")
                    backend.stdin.flush()
                    while backend.stdout.readline().strip() != 'READY':
                        if backend.poll() is not None:
                            self.fail('Backend transaction did not acquire its owner lock')
                    with ThreadPoolExecutor(max_workers=1) as workers:
                        pending = workers.submit(subprocess.run,
                            ['psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-v', 'demo_subject=' + SUBJECT],
                            input=(DEMO / 'scripts' / helper).read_text(), text=True, env=self.env,
                            capture_output=True, timeout=10)
                        try:
                            with self.assertRaises(TimeoutError):
                                pending.result(timeout=0.3)
                        finally:
                            backend.communicate(f"INSERT INTO monitors (monitor_id,owner_subject,name,target_url,check_interval_seconds,timeout_ms,next_check_at) "
                                f"VALUES (gen_random_uuid(),'{SUBJECT}','Backend addition','https://example.com/backend',60,5000,CURRENT_TIMESTAMP); COMMIT;\n", timeout=5)
                        result = pending.result(timeout=10)
                        self.assertNotEqual(result.returncode, 0, 'Helper must recheck the updated ceiling')
                    self.assertEqual(self.sql('SELECT count(*) FROM monitors'), str(16 - additions))
                finally:
                    if backend.poll() is None:
                        backend.kill()
                    backend.wait(timeout=5)


if __name__ == "__main__":
    unittest.main()

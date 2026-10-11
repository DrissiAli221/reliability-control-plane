package dev.ali.rcp;

import dev.ali.rcp.incidents.ExecutionVerdict;
import dev.ali.rcp.monitors.Monitor;
import dev.ali.rcp.monitors.MonitorRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.ZoneOffset;
import java.util.UUID;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class MonitorReadApiTest {
    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private MonitorRepository monitorRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void listsOnlyTheOwnersMonitorsWithLatestOperationalState() throws Exception {
        Monitor owned = create("ali-subject", "Owned monitor");
        create("other-subject", "Hidden monitor");
        insertVerdict(owned, ExecutionVerdict.UP);

        mockMvc.perform(get("/api/monitors")
                        .with(jwt().jwt(token -> token.subject("ali-subject"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].name").value("Owned monitor"))
                .andExpect(jsonPath("$[0].incidentStatus").value("HEALTHY"))
                .andExpect(jsonPath("$[0].latestVerdict").value("UP"));
    }

    @Test
    void blockedRequiresEveryRegionAndUsesTheChecksSavedStatusPolicy() throws Exception {
        Monitor monitor = create("blocked-owner", "Blocked");
        UUID execution = insertVerdict(monitor, ExecutionVerdict.NO_DATA);
        for (String region : new String[]{"eu", "us"}) {
            UUID job = UUID.randomUUID();
            jdbcTemplate.update("INSERT INTO probe_jobs (job_id, execution_id, probe_region) VALUES (?, ?, ?)", job, execution, region);
            if (region.equals("us")) assertBlocked("blocked-owner", false); // one missing result is not all regions blocked
            jdbcTemplate.update("""
                    INSERT INTO probe_results (job_id, execution_id, monitor_id, probe_region, scheduled_at, started_at,
                        completed_at, outcome, http_status, latency_ms, response_bytes, monitor_behavior_version, bot_protection)
                    VALUES (?, ?, ?, ?, ?, ?, ?, 'HTTP_RESPONSE', 403, 100, 0, ?, 'CLOUDFLARE_CHALLENGE')
                    """, job, execution, monitor.getId(), region, timestamp("2026-09-07T12:01:00Z"),
                    timestamp("2026-09-07T12:01:01Z"), timestamp("2026-09-07T12:01:02Z"), monitor.getBehaviorVersion());
        }
        assertBlocked("blocked-owner", true);
        // Editing the monitor now must not reinterpret a finalized check.
        jdbcTemplate.update("UPDATE monitors SET accepted_http_statuses = ARRAY[403] WHERE monitor_id = ?", monitor.getId());
        assertBlocked("blocked-owner", true);
        jdbcTemplate.update("UPDATE probe_executions SET accepted_http_statuses_snapshot = ARRAY[403] WHERE execution_id = ?", execution);
        assertBlocked("blocked-owner", false);
        jdbcTemplate.update("UPDATE probe_executions SET accepted_http_statuses_snapshot = NULL WHERE execution_id = ?", execution);
        jdbcTemplate.update("UPDATE probe_results SET bot_protection = NULL WHERE execution_id = ? AND probe_region = 'us'", execution);
        assertBlocked("blocked-owner", false);
    }

    private void assertBlocked(String owner, boolean blocked) throws Exception {
        mockMvc.perform(get("/api/monitors").with(jwt().jwt(token -> token.subject(owner))))
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].latestBlocked").value(blocked));
    }

    private java.time.OffsetDateTime timestamp(String instant) { return Instant.parse(instant).atOffset(ZoneOffset.UTC); }

    private Monitor create(String owner, String name) {
        return monitorRepository.saveAndFlush(Monitor.create(
                owner, name, "https://example.com", 60, 5_000,
                Instant.parse("2026-09-07T12:00:00Z")
        ));
    }

    private UUID insertVerdict(Monitor monitor, ExecutionVerdict verdict) {
        Instant scheduledAt = Instant.parse("2026-09-07T12:01:00Z");
        UUID executionId = UUID.randomUUID();
        jdbcTemplate.update(
                """
                INSERT INTO probe_executions
                (
                    execution_id, monitor_id, scheduled_at, result_deadline_at,
                    target_url_snapshot, timeout_ms_snapshot, monitor_behavior_version,
                    incident_policy_version, expected_region_count, status, verdict, finalized_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 2, 'FINALIZED', ?, ?)
                """,
                executionId, monitor.getId(),
                scheduledAt.atOffset(ZoneOffset.UTC),
                scheduledAt.plusSeconds(30).atOffset(ZoneOffset.UTC),
                monitor.getTargetUrl(), monitor.getTimeoutMs(), monitor.getBehaviorVersion(),
                verdict.name(), scheduledAt.plusSeconds(31).atOffset(ZoneOffset.UTC)
        );
        return executionId;
    }
}

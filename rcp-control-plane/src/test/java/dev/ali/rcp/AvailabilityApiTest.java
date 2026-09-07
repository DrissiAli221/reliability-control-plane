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
class AvailabilityApiTest {
    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private MonitorRepository monitorRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void ownerReceivesAvailabilityAndCoverageWithAnExplicitDenominator() throws Exception {
        Monitor monitor = createMonitor("ali-subject");
        insertVerdict(monitor, 0, ExecutionVerdict.UP);
        insertVerdict(monitor, 1, ExecutionVerdict.UP);
        insertVerdict(monitor, 2, ExecutionVerdict.DOWN);
        insertVerdict(monitor, 3, ExecutionVerdict.DISAGREEMENT);
        insertVerdict(monitor, 4, ExecutionVerdict.NO_DATA);

        mockMvc.perform(get("/api/monitors/{id}/availability", monitor.getId())
                        .with(jwt().jwt(token -> token.subject("ali-subject")))
                        .queryParam("from", "2026-09-07T12:00:00Z")
                        .queryParam("to", "2026-09-07T13:00:00Z")
                        .queryParam("sloTargetPercent", "99.9"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.measuredAvailabilityPercent").value(66.66667))
                .andExpect(jsonPath("$.evidenceCoveragePercent").value(60.0))
                .andExpect(jsonPath("$.sloMet").value(false))
                .andExpect(jsonPath("$.conclusiveExecutions").value(3))
                .andExpect(jsonPath("$.totalFinalizedExecutions").value(5))
                .andExpect(jsonPath("$.disagreementExecutions").value(1))
                .andExpect(jsonPath("$.noDataExecutions").value(1))
                .andExpect(jsonPath("$.denominatorPolicy").value(
                        "UP_AND_DOWN_ONLY; DISAGREEMENT_AND_NO_DATA_EXCLUDED; MAINTENANCE_WINDOWS_NOT_YET_IMPLEMENTED"
                ));
    }

    @Test
    void anotherOwnerCannotDiscoverTheMonitorThroughTheReportApi() throws Exception {
        Monitor monitor = createMonitor("ali-subject");

        mockMvc.perform(get("/api/monitors/{id}/availability", monitor.getId())
                        .with(jwt().jwt(token -> token.subject("other-subject")))
                        .queryParam("from", "2026-09-07T12:00:00Z")
                        .queryParam("to", "2026-09-07T13:00:00Z"))
                .andExpect(status().isNotFound());
    }

    private Monitor createMonitor(String owner) {
        return monitorRepository.saveAndFlush(Monitor.create(
                owner,
                "Availability target",
                "https://example.com",
                60,
                5_000,
                Instant.parse("2026-09-07T12:00:00Z")
        ));
    }

    private void insertVerdict(Monitor monitor, long minute, ExecutionVerdict verdict) {
        Instant scheduledAt = Instant.parse("2026-09-07T12:00:00Z").plusSeconds(minute * 60);
        jdbcTemplate.update(
                """
                INSERT INTO probe_executions
                (
                    execution_id, monitor_id, scheduled_at, result_deadline_at,
                    target_url_snapshot, timeout_ms_snapshot, monitor_behavior_version,
                    incident_policy_version, expected_region_count, status, verdict, finalized_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, 1, 2, 'FINALIZED', ?, ?)
                """,
                UUID.randomUUID(),
                monitor.getId(),
                scheduledAt.atOffset(ZoneOffset.UTC),
                scheduledAt.plusSeconds(30).atOffset(ZoneOffset.UTC),
                monitor.getTargetUrl(),
                monitor.getTimeoutMs(),
                monitor.getBehaviorVersion(),
                verdict.name(),
                scheduledAt.plusSeconds(31).atOffset(ZoneOffset.UTC)
        );
    }
}

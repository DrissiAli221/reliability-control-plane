package dev.ali.rcp;

import dev.ali.rcp.monitors.Monitor;
import dev.ali.rcp.monitors.MonitorRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.OffsetDateTime;
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
class PipelineApiTest {
    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private MonitorRepository monitorRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private Monitor owned;
    private Monitor foreign;
    private UUID executionId;
    private Instant scheduledAt;

    @BeforeEach
    void seedOneTracedCheck() {
        scheduledAt = jdbcTemplate.queryForObject("SELECT clock_timestamp()", OffsetDateTime.class)
                .toInstant().minusSeconds(60);
        owned = monitor("ali-subject", "Traced monitor");
        foreign = monitor("other-subject", "Someone else's monitor");
        executionId = execution(owned, scheduledAt);
        execution(foreign, scheduledAt);
        jdbcTemplate.update(
                """
                INSERT INTO monitor_incident_state
                (monitor_id, status, consecutive_down, consecutive_up, last_evaluated_at)
                VALUES (?, 'HEALTHY', 1, 0, ?)
                """,
                owned.getId(), timestamp(scheduledAt)
        );
    }

    @Test
    void traceCarriesEveryStageTimestampForTheOwner() throws Exception {
        mockMvc.perform(get("/api/monitors/{monitorId}/executions/{executionId}/trace", owned.getId(), executionId)
                        .with(jwt().jwt(token -> token.subject("ali-subject"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.verdict").value("DOWN"))
                .andExpect(jsonPath("$.expectedRegionCount").value(2))
                .andExpect(jsonPath("$.jobs.length()").value(2))
                .andExpect(jsonPath("$.jobs[0].region").value("eu-west-1"))
                .andExpect(jsonPath("$.jobs[0].failedPublishAttempts").value(2))
                .andExpect(jsonPath("$.jobs[0].publishedAt").exists())
                .andExpect(jsonPath("$.jobs[0].startedAt").exists())
                .andExpect(jsonPath("$.jobs[0].receivedAt").exists())
                .andExpect(jsonPath("$.jobs[0].httpStatus").value(503))
                .andExpect(jsonPath("$.evaluation.transition").value("NONE"));
    }

    @Test
    void anotherOwnerCannotReadTheTraceOrIncidentState() throws Exception {
        mockMvc.perform(get("/api/monitors/{monitorId}/executions/{executionId}/trace", owned.getId(), executionId)
                        .with(jwt().jwt(token -> token.subject("other-subject"))))
                .andExpect(status().isNotFound());
        mockMvc.perform(get("/api/monitors/{monitorId}/incident-state", owned.getId())
                        .with(jwt().jwt(token -> token.subject("other-subject"))))
                .andExpect(status().isNotFound());
    }

    @Test
    void executionOfAnotherMonitorIsNotReachableThroughAnOwnedMonitor() throws Exception {
        UUID foreignExecution = jdbcTemplate.queryForObject(
                "SELECT execution_id FROM probe_executions WHERE monitor_id = ?", UUID.class, foreign.getId());

        mockMvc.perform(get("/api/monitors/{monitorId}/executions/{executionId}/trace", owned.getId(), foreignExecution)
                        .with(jwt().jwt(token -> token.subject("ali-subject"))))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.title").value("Execution not found"));
    }

    @Test
    void incidentStateExposesStreaksAndThePolicyThresholds() throws Exception {
        mockMvc.perform(get("/api/monitors/{monitorId}/incident-state", owned.getId())
                        .with(jwt().jwt(token -> token.subject("ali-subject"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("HEALTHY"))
                .andExpect(jsonPath("$.consecutiveDown").value(1))
                .andExpect(jsonPath("$.failuresToOpen").value(2))
                .andExpect(jsonPath("$.successesToResolve").value(2))
                .andExpect(jsonPath("$.recentEvaluations[0].verdict").value("DOWN"));
    }

    private Monitor monitor(String owner, String name) {
        return monitorRepository.saveAndFlush(Monitor.create(
                owner, name, "https://example.com", 60, 5_000, scheduledAt.minusSeconds(600)
        ));
    }

    private UUID execution(Monitor monitor, Instant at) {
        UUID id = UUID.randomUUID();
        jdbcTemplate.update(
                """
                INSERT INTO probe_executions
                (execution_id, monitor_id, scheduled_at, result_deadline_at,
                 target_url_snapshot, timeout_ms_snapshot, monitor_behavior_version,
                 incident_policy_version, expected_region_count, status, verdict, finalized_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, 1, 2, 'FINALIZED', 'DOWN', ?)
                """,
                id, monitor.getId(), timestamp(at), timestamp(at.plusSeconds(35)),
                monitor.getTargetUrl(), monitor.getTimeoutMs(), monitor.getBehaviorVersion(),
                timestamp(at.plusSeconds(3))
        );
        for (String region : new String[]{"eu-west-1", "us-east-1"}) {
            UUID jobId = UUID.randomUUID();
            jdbcTemplate.update("INSERT INTO probe_jobs (job_id, execution_id, probe_region) VALUES (?, ?, ?)",
                    jobId, id, region);
            jdbcTemplate.update(
                    """
                    INSERT INTO outbox_events
                    (event_id, aggregate_type, aggregate_id, event_type, destination_region, payload,
                     attempt_count, published_at, created_at)
                    VALUES (?, 'PROBE_JOB', ?, 'PROBE_JOB_REQUESTED', ?, '{"schemaVersion":1}'::jsonb, 2, ?, ?)
                    """,
                    UUID.randomUUID(), jobId, region, timestamp(at.plusMillis(40)), timestamp(at)
            );
            jdbcTemplate.update(
                    """
                    INSERT INTO probe_results
                    (job_id, execution_id, monitor_id, probe_region, scheduled_at, started_at,
                     completed_at, outcome, http_status, latency_ms, response_bytes,
                     monitor_behavior_version, received_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, 'HTTP_RESPONSE', 503, 180, 12, ?, ?)
                    """,
                    jobId, id, monitor.getId(), region, timestamp(at),
                    timestamp(at.plusMillis(100)), timestamp(at.plusMillis(280)),
                    monitor.getBehaviorVersion(), timestamp(at.plusMillis(900))
            );
        }
        jdbcTemplate.update(
                """
                INSERT INTO incident_evaluations (execution_id, monitor_id, verdict, transition, evaluated_at)
                VALUES (?, ?, 'DOWN', 'NONE', ?)
                """,
                id, monitor.getId(), timestamp(at.plusSeconds(4))
        );
        return id;
    }

    private OffsetDateTime timestamp(Instant instant) {
        return instant.atOffset(ZoneOffset.UTC);
    }
}

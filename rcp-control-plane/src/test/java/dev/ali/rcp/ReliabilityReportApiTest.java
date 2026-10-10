package dev.ali.rcp;

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

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class ReliabilityReportApiTest {
    private static final Instant WINDOW_START = Instant.parse("2026-09-07T12:00:00Z");

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private MonitorRepository monitorRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void jsonAndHtmlRenderTheSameOwnedEvidenceWithoutHtmlInjection() throws Exception {
        Monitor monitor = monitor("ali-subject", "<script>alert('x')</script>");
        UUID down = execution(monitor, WINDOW_START, "DOWN", 503);
        UUID up = execution(monitor, WINDOW_START.plusSeconds(60), "UP", 200);
        incident(monitor, down, up);

        mockMvc.perform(get("/api/monitors/{id}/reliability-report", monitor.getId())
                        .with(jwt().jwt(token -> token.subject("ali-subject")))
                        .queryParam("from", WINDOW_START.toString())
                        .queryParam("to", WINDOW_START.plusSeconds(120).toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.schemaVersion").value("rcp-report-v1"))
                .andExpect(jsonPath("$.availability.measuredAvailabilityPercent").value(50))
                .andExpect(jsonPath("$.availability.evidenceCoveragePercent").value(100))
                .andExpect(jsonPath("$.availability.expectedOpportunities").value(2))
                .andExpect(jsonPath("$.availability.missingExecutions").value(0))
                .andExpect(jsonPath("$.availability.sloMet").value(false))
                .andExpect(jsonPath("$.errorBudget.observedBadExecutions").value(1))
                .andExpect(jsonPath("$.latency.sampleCount").value(4))
                .andExpect(jsonPath("$.incidentTimeline.length()").value(2))
                .andExpect(jsonPath("$.incidentTimeline[0].eventType").value("OPENED"))
                .andExpect(jsonPath("$.incidentTimeline[1].eventType").value("RESOLVED"));

        String html = mockMvc.perform(get("/api/monitors/{id}/reliability-report/html", monitor.getId())
                        .with(jwt().jwt(token -> token.subject("ali-subject")))
                        .queryParam("from", WINDOW_START.toString())
                        .queryParam("to", WINDOW_START.plusSeconds(120).toString()))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Disposition", "attachment; filename=rcp-reliability-report.html"))
                .andExpect(header().string("Content-Security-Policy",
                        "sandbox; default-src 'none'; style-src 'unsafe-inline'"))
                .andReturn().getResponse().getContentAsString();
        assertThat(html).contains("50.00%", "RESOLVED", "&lt;script&gt;");
        assertThat(html).doesNotContain("<script>");
    }

    @Test
    void csvListsIncidentsAsAnAttachment() throws Exception {
        Monitor monitor = monitor("ali-subject", "CSV target");
        UUID down = execution(monitor, WINDOW_START, "DOWN", 503);
        UUID up = execution(monitor, WINDOW_START.plusSeconds(60), "UP", 200);
        incident(monitor, down, up);

        var response = mockMvc.perform(get("/api/monitors/{id}/reliability-report/csv", monitor.getId())
                        .with(jwt().jwt(token -> token.subject("ali-subject")))
                        .queryParam("from", WINDOW_START.toString())
                        .queryParam("to", WINDOW_START.plusSeconds(120).toString()))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Disposition", "attachment; filename=rcp-reliability-incidents.csv"))
                .andReturn().getResponse();

        assertThat(response.getContentType()).startsWith("text/csv");
        String[] lines = response.getContentAsString().split("\r\n");
        assertThat(lines).hasSize(2);
        assertThat(lines[0]).isEqualTo("incident_id,state,opened_at,resolved_at,duration_seconds");
        assertThat(lines[1]).matches("[0-9a-f-]{36},RESOLVED,2026-09-07T12:00:00Z,2026-09-07T12:01:00Z,60");
    }

    @Test
    void anotherOwnerCannotExportTheCsv() throws Exception {
        Monitor monitor = monitor("ali-subject", "Private target");

        mockMvc.perform(get("/api/monitors/{id}/reliability-report/csv", monitor.getId())
                        .with(jwt().jwt(token -> token.subject("other-subject")))
                        .queryParam("from", WINDOW_START.toString())
                        .queryParam("to", WINDOW_START.plusSeconds(120).toString()))
                .andExpect(status().isNotFound());
    }

    @Test
    void csvRequiresAuthentication() throws Exception {
        mockMvc.perform(get("/api/monitors/{id}/reliability-report/csv", UUID.randomUUID())
                        .queryParam("from", WINDOW_START.toString())
                        .queryParam("to", WINDOW_START.plusSeconds(120).toString()))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void anotherOwnerCannotGenerateTheReport() throws Exception {
        Monitor monitor = monitor("ali-subject", "Private target");

        mockMvc.perform(get("/api/monitors/{id}/reliability-report", monitor.getId())
                        .with(jwt().jwt(token -> token.subject("other-subject")))
                        .queryParam("from", WINDOW_START.toString())
                        .queryParam("to", WINDOW_START.plusSeconds(120).toString()))
                .andExpect(status().isNotFound());
    }

    @Test
    void reportDoesNotCallSparseGreenEvidenceAnSloPass() throws Exception {
        Monitor monitor = monitor("ali-subject", "Sparse evidence");
        execution(monitor, WINDOW_START, "UP", 200);

        mockMvc.perform(get("/api/monitors/{id}/reliability-report", monitor.getId())
                        .with(jwt().jwt(token -> token.subject("ali-subject")))
                        .queryParam("from", WINDOW_START.toString())
                        .queryParam("to", WINDOW_START.plusSeconds(600).toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.availability.measuredAvailabilityPercent").value(100))
                .andExpect(jsonPath("$.availability.evidenceCoveragePercent").value(10))
                .andExpect(jsonPath("$.availability.missingExecutions").value(9))
                .andExpect(jsonPath("$.availability.sloMet").value(org.hamcrest.Matchers.nullValue()));
    }

    @Test
    void rejectsInvalidWindow() throws Exception {
        Monitor monitor = monitor("ali-subject", "Private target");

        mockMvc.perform(get("/api/monitors/{id}/reliability-report", monitor.getId())
                        .with(jwt().jwt(token -> token.subject("ali-subject")))
                        .queryParam("from", WINDOW_START.toString())
                        .queryParam("to", WINDOW_START.toString()))
                .andExpect(status().isBadRequest());
    }

    @Test
    void presetWindowsAreNamedByDaysAndTheDefaultIsSevenDays() throws Exception {
        Monitor monitor = monitor("ali-subject", "Window target");
        for (int days : new int[]{1, 7, 30, 90}) {
            String body = mockMvc.perform(get("/api/monitors/{id}/reliability-report", monitor.getId())
                            .with(jwt().jwt(token -> token.subject("ali-subject")))
                            .queryParam("days", Integer.toString(days)))
                    .andExpect(status().isOk())
                    .andReturn().getResponse().getContentAsString();
            assertThat(windowDays(body)).isEqualTo(days);
        }
        String defaulted = mockMvc.perform(get("/api/monitors/{id}/reliability-report", monitor.getId())
                        .with(jwt().jwt(token -> token.subject("ali-subject"))))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        assertThat(windowDays(defaulted)).isEqualTo(7);
    }

    @Test
    void rejectsWindowsOutsideThePresetsAndMixedWindowParameters() throws Exception {
        Monitor monitor = monitor("ali-subject", "Window target");
        for (String path : new String[]{"", "/html", "/csv"}) {
            for (String days : new String[]{"0", "2", "14", "91", "365", "-7"}) {
                mockMvc.perform(get("/api/monitors/{id}/reliability-report" + path, monitor.getId())
                                .with(jwt().jwt(token -> token.subject("ali-subject")))
                                .queryParam("days", days))
                        .andExpect(status().isBadRequest());
            }
            mockMvc.perform(get("/api/monitors/{id}/reliability-report" + path, monitor.getId())
                            .with(jwt().jwt(token -> token.subject("ali-subject")))
                            .queryParam("days", "30")
                            .queryParam("from", WINDOW_START.toString())
                            .queryParam("to", WINDOW_START.plusSeconds(60).toString()))
                    .andExpect(status().isBadRequest());
            mockMvc.perform(get("/api/monitors/{id}/reliability-report" + path, monitor.getId())
                            .with(jwt().jwt(token -> token.subject("ali-subject")))
                            .queryParam("from", WINDOW_START.toString()))
                    .andExpect(status().isBadRequest());
        }
    }

    @Test
    void downloadsNameTheirPresetWindow() throws Exception {
        Monitor monitor = monitor("ali-subject", "Window target");
        mockMvc.perform(get("/api/monitors/{id}/reliability-report/html", monitor.getId())
                        .with(jwt().jwt(token -> token.subject("ali-subject"))).queryParam("days", "30"))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Disposition", "attachment; filename=rcp-reliability-report-30d.html"));
        mockMvc.perform(get("/api/monitors/{id}/reliability-report/csv", monitor.getId())
                        .with(jwt().jwt(token -> token.subject("ali-subject"))).queryParam("days", "90"))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Disposition", "attachment; filename=rcp-reliability-incidents-90d.csv"));
        String html = mockMvc.perform(get("/api/monitors/{id}/reliability-report/html", monitor.getId())
                        .with(jwt().jwt(token -> token.subject("ali-subject"))).queryParam("days", "30"))
                .andReturn().getResponse().getContentAsString();
        assertThat(html).contains("30 days");
    }

    private static long windowDays(String json) {
        Instant from = Instant.parse(com.jayway.jsonpath.JsonPath.read(json, "$.availability.from"));
        Instant to = Instant.parse(com.jayway.jsonpath.JsonPath.read(json, "$.availability.to"));
        return java.time.Duration.between(from, to).toDays();
    }

    @Test
    void publishesLatencyPercentilesOnlyWithEnoughHttpSamples() throws Exception {
        Monitor monitor = monitor("ali-subject", "Latency target");
        for (int minute = 0; minute < 10; minute++) {
            execution(monitor, WINDOW_START.plusSeconds(minute * 60L), "UP", 200);
        }

        mockMvc.perform(get("/api/monitors/{id}/reliability-report", monitor.getId())
                        .with(jwt().jwt(token -> token.subject("ali-subject")))
                        .queryParam("from", WINDOW_START.toString())
                        .queryParam("to", WINDOW_START.plusSeconds(600).toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.latency.sampleCount").value(20))
                .andExpect(jsonPath("$.latency.p50Ms").value(100))
                .andExpect(jsonPath("$.latency.p95Ms").value(100));
    }

    private Monitor monitor(String owner, String name) {
        return monitorRepository.saveAndFlush(Monitor.create(
                owner, name, "https://example.com", 60, 5_000, WINDOW_START
        ));
    }

    private UUID execution(Monitor monitor, Instant scheduledAt, String verdict, int httpStatus) {
        UUID executionId = UUID.randomUUID();
        jdbcTemplate.update(
                """
                INSERT INTO probe_executions
                (execution_id, monitor_id, scheduled_at, result_deadline_at,
                 target_url_snapshot, timeout_ms_snapshot, monitor_behavior_version,
                 incident_policy_version, expected_region_count, status, verdict, finalized_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, 1, 2, 'FINALIZED', ?, ?)
                """,
                executionId, monitor.getId(), timestamp(scheduledAt), timestamp(scheduledAt.plusSeconds(30)),
                monitor.getTargetUrl(), monitor.getTimeoutMs(), monitor.getBehaviorVersion(),
                verdict, timestamp(scheduledAt.plusSeconds(31))
        );
        for (String region : new String[]{"eu", "us"}) {
            UUID jobId = UUID.randomUUID();
            jdbcTemplate.update(
                    "INSERT INTO probe_jobs (job_id, execution_id, probe_region) VALUES (?, ?, ?)",
                    jobId, executionId, region
            );
            jdbcTemplate.update(
                    """
                    INSERT INTO probe_results
                    (job_id, execution_id, monitor_id, probe_region, scheduled_at, started_at,
                     completed_at, outcome, http_status, latency_ms, response_bytes,
                     monitor_behavior_version)
                    VALUES (?, ?, ?, ?, ?, ?, ?, 'HTTP_RESPONSE', ?, 100, 0, ?)
                    """,
                    jobId, executionId, monitor.getId(), region, timestamp(scheduledAt),
                    timestamp(scheduledAt.plusSeconds(1)), timestamp(scheduledAt.plusSeconds(2)),
                    httpStatus, monitor.getBehaviorVersion()
            );
        }
        return executionId;
    }

    private void incident(Monitor monitor, UUID down, UUID up) {
        UUID incidentId = UUID.randomUUID();
        jdbcTemplate.update(
                """
                INSERT INTO incidents
                (incident_id, monitor_id, status, opened_by_execution_id, opened_at,
                 resolved_by_execution_id, resolved_at)
                VALUES (?, ?, 'RESOLVED', ?, ?, ?, ?)
                """,
                incidentId, monitor.getId(), down, timestamp(WINDOW_START),
                up, timestamp(WINDOW_START.plusSeconds(60))
        );
        jdbcTemplate.update(
                """
                INSERT INTO incident_events
                (event_id, incident_id, execution_id, event_type, occurred_at)
                VALUES (?, ?, ?, 'OPENED', ?), (?, ?, ?, 'RESOLVED', ?)
                """,
                UUID.randomUUID(), incidentId, down, timestamp(WINDOW_START),
                UUID.randomUUID(), incidentId, up, timestamp(WINDOW_START.plusSeconds(60))
        );
    }

    private java.time.OffsetDateTime timestamp(Instant instant) {
        return instant.atOffset(ZoneOffset.UTC);
    }
}

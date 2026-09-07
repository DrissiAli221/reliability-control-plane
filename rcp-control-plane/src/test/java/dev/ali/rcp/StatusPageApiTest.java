package dev.ali.rcp;

import dev.ali.rcp.incidents.ExecutionVerdict;
import dev.ali.rcp.monitors.Monitor;
import dev.ali.rcp.monitors.MonitorRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.ZoneOffset;
import java.util.UUID;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class StatusPageApiTest {
    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private MonitorRepository monitorRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void explicitlyPublishedPageIsPublicWithoutLeakingTargetUrl() throws Exception {
        Monitor monitor = createMonitor("ali-subject", "Portfolio API");
        insertVerdict(monitor, ExecutionVerdict.UP);

        mockMvc.perform(post("/api/status-pages")
                        .with(jwt().jwt(token -> token.subject("ali-subject")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "name": "Ali Systems",
                                  "slug": "ali-systems",
                                  "monitorIds": ["%s"],
                                  "published": true
                                }
                                """.formatted(monitor.getId())))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.published").value(true));

        mockMvc.perform(get("/status/ali-systems"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.overallStatus").value("OPERATIONAL"))
                .andExpect(jsonPath("$.components[0].name").value("Portfolio API"))
                .andExpect(jsonPath("$.components[0].status").value("OPERATIONAL"))
                .andExpect(jsonPath("$.components[0].targetUrl").doesNotExist());
    }

    @Test
    void unpublishedPageIsNotPublic() throws Exception {
        Monitor monitor = createMonitor("ali-subject", "Private component");

        mockMvc.perform(post("/api/status-pages")
                        .with(jwt().jwt(token -> token.subject("ali-subject")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "name": "Private page",
                                  "slug": "private-page",
                                  "monitorIds": ["%s"]
                                }
                                """.formatted(monitor.getId())))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.published").value(false));

        mockMvc.perform(get("/status/private-page"))
                .andExpect(status().isNotFound());
    }

    @Test
    void ownerCannotPublishSomeoneElsesMonitor() throws Exception {
        Monitor monitor = createMonitor("other-subject", "Someone else's monitor");

        mockMvc.perform(post("/api/status-pages")
                        .with(jwt().jwt(token -> token.subject("ali-subject")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "name": "Invalid page",
                                  "slug": "invalid-page",
                                  "monitorIds": ["%s"],
                                  "published": true
                                }
                                """.formatted(monitor.getId())))
                .andExpect(status().isBadRequest());
    }

    private Monitor createMonitor(String owner, String name) {
        return monitorRepository.saveAndFlush(Monitor.create(
                owner, name, "https://example.com", 60, 5_000,
                Instant.parse("2026-09-07T12:00:00Z")
        ));
    }

    private void insertVerdict(Monitor monitor, ExecutionVerdict verdict) {
        Instant scheduledAt = Instant.parse("2026-09-07T12:01:00Z");
        jdbcTemplate.update(
                """
                INSERT INTO probe_executions
                (
                    execution_id, monitor_id, scheduled_at, result_deadline_at,
                    target_url_snapshot, timeout_ms_snapshot, monitor_behavior_version,
                    incident_policy_version, expected_region_count, status, verdict, finalized_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 2, 'FINALIZED', ?, ?)
                """,
                UUID.randomUUID(), monitor.getId(),
                scheduledAt.atOffset(ZoneOffset.UTC),
                scheduledAt.plusSeconds(30).atOffset(ZoneOffset.UTC),
                monitor.getTargetUrl(), monitor.getTimeoutMs(), monitor.getBehaviorVersion(),
                verdict.name(), scheduledAt.plusSeconds(31).atOffset(ZoneOffset.UTC)
        );
    }
}

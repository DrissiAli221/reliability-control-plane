package dev.ali.rcp;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = {
        "rcp.monitors.min-interval-seconds=60",
        "rcp.monitors.max-timeout-ms=5000",
        "rcp.monitors.max-total=40"
})
@AutoConfigureMockMvc
@Transactional
class MonitorLimitsIntegrationTest {
    @Autowired MockMvc mockMvc;
    @Autowired JdbcTemplate jdbc;

    private static String body(int intervalSeconds, int timeoutMs) {
        return """
                {"name":"Portfolio","targetUrl":"https://1.1.1.1","checkIntervalSeconds":%d,"timeoutMs":%d}
                """.formatted(intervalSeconds, timeoutMs);
    }

    @Test
    void rejectsIntervalsAndTimeoutsOutsideTheDeploymentLimits() throws Exception {
        String owner = UUID.randomUUID().toString();
        mockMvc.perform(post("/api/monitors").with(jwt().jwt(token -> token.subject(owner)))
                        .contentType(MediaType.APPLICATION_JSON).content(body(30, 5000)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("Checks can run at most every 60 s on this deployment"));
        mockMvc.perform(post("/api/monitors").with(jwt().jwt(token -> token.subject(owner)))
                        .contentType(MediaType.APPLICATION_JSON).content(body(60, 10_000)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.title").value("Outside this deployment's limits"));
        mockMvc.perform(post("/api/monitors").with(jwt().jwt(token -> token.subject(owner)))
                        .contentType(MediaType.APPLICATION_JSON).content(body(60, 5000)))
                .andExpect(status().isCreated());
    }

    @Test
    void refusesNewMonitorsOnceTheDeploymentIsFull() throws Exception {
        // Fill the deployment to its cap inside this rolled-back transaction, whatever other tests left behind.
        Long existing = jdbc.queryForObject("SELECT COUNT(*) FROM monitors", Long.class);
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
        for (long index = existing; index < 40; index++) {
            jdbc.update("""
                    INSERT INTO monitors (monitor_id, owner_subject, name, target_url, check_interval_seconds, timeout_ms,
                                          enabled, next_check_at, behavior_version, created_at, updated_at)
                    VALUES (?, ?, 'Filler', 'https://1.1.1.1', 60, 5000, false, NULL, 1, ?, ?)
                    """, UUID.randomUUID(), "filler-" + index, now, now);
        }

        mockMvc.perform(post("/api/monitors").with(jwt().jwt(token -> token.subject(UUID.randomUUID().toString())))
                        .contentType(MediaType.APPLICATION_JSON).content(body(60, 5000)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.title").value("Deployment monitor limit reached"));
    }
}

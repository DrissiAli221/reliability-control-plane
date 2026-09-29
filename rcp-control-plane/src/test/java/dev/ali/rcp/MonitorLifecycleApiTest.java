package dev.ali.rcp;

import dev.ali.rcp.scheduling.DueMonitorScheduler;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class MonitorLifecycleApiTest {
    @Autowired MockMvc mockMvc;
    @Autowired JdbcTemplate jdbcTemplate;
    @Autowired DueMonitorScheduler scheduler;

    @Test
    void ownerCanPauseAndResumeWithoutCountingThePausedInterval() throws Exception {
        UUID id = createMonitor("ali-subject");
        assertThat(openPeriods(id)).isEqualTo(1);

        mockMvc.perform(patch("/api/monitors/{id}/enabled", id)
                        .with(jwt().jwt(token -> token.subject("ali-subject")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"enabled\":false}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.enabled").value(false))
                .andExpect(jsonPath("$.nextCheckAt").value(org.hamcrest.Matchers.nullValue()));

        assertThat(openPeriods(id)).isZero();
        assertThat(scheduler.scheduleBatch()).isZero();

        mockMvc.perform(patch("/api/monitors/{id}/enabled", id)
                        .with(jwt().jwt(token -> token.subject("ali-subject")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"enabled\":true}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.enabled").value(true))
                .andExpect(jsonPath("$.nextCheckAt").isNotEmpty());

        assertThat(periods(id)).isEqualTo(2);
        assertThat(openPeriods(id)).isEqualTo(1);
        Integer overlapping = jdbcTemplate.queryForObject(
                """
                SELECT COUNT(*) FROM monitor_schedule_periods first_period
                JOIN monitor_schedule_periods second_period
                  ON first_period.monitor_id = second_period.monitor_id
                 AND first_period.period_id <> second_period.period_id
                 AND first_period.first_check_at < COALESCE(second_period.stopped_at, 'infinity')
                 AND second_period.first_check_at < COALESCE(first_period.stopped_at, 'infinity')
                WHERE first_period.monitor_id = ?
                """, Integer.class, id
        );
        assertThat(overlapping).isZero();
    }

    @Test
    void ownerIsolationAndIdempotentPauseAreEnforced() throws Exception {
        UUID id = createMonitor("ali-subject");

        mockMvc.perform(patch("/api/monitors/{id}/enabled", id)
                        .with(jwt().jwt(token -> token.subject("other-subject")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"enabled\":false}"))
                .andExpect(status().isNotFound());
        assertThat(openPeriods(id)).isEqualTo(1);

        for (int attempt = 0; attempt < 2; attempt++) {
            mockMvc.perform(patch("/api/monitors/{id}/enabled", id)
                            .with(jwt().jwt(token -> token.subject("ali-subject")))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"enabled\":false}"))
                    .andExpect(status().isOk());
        }
        assertThat(periods(id)).isEqualTo(1);
        assertThat(openPeriods(id)).isZero();
    }

    private UUID createMonitor(String owner) throws Exception {
        String body = mockMvc.perform(post("/api/monitors")
                        .with(jwt().jwt(token -> token.subject(owner)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"Lifecycle", "targetUrl":"https://1.1.1.1/",
                                 "checkIntervalSeconds":60, "timeoutMs":5000}
                                """))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return UUID.fromString(new tools.jackson.databind.ObjectMapper().readTree(body).get("id").asText());
    }

    private int periods(UUID id) {
        return jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM monitor_schedule_periods WHERE monitor_id = ?", Integer.class, id
        );
    }

    private int openPeriods(UUID id) {
        return jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM monitor_schedule_periods WHERE monitor_id = ? AND stopped_at IS NULL",
                Integer.class, id
        );
    }
}

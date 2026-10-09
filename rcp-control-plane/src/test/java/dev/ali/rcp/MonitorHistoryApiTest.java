package dev.ali.rcp;

import dev.ali.rcp.monitors.Monitor;
import dev.ali.rcp.monitors.MonitorHistoryRepository;
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

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class MonitorHistoryApiTest {
    private static final String EU = "eu-west-1";
    private static final String US = "us-east-1";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private MonitorRepository monitorRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private MonitorHistoryRepository historyRepository;

    private Monitor monitor;
    private Instant todayStart;

    @BeforeEach
    void seedEvidence() {
        // Day buckets follow PostgreSQL's clock, so seed relative to the database's UTC day.
        todayStart = jdbcTemplate.queryForObject("SELECT clock_timestamp()", OffsetDateTime.class)
                .toInstant().truncatedTo(ChronoUnit.DAYS);
        monitor = monitorRepository.saveAndFlush(Monitor.create(
                "ali-subject", "History monitor", "https://example.com", 60, 5_000,
                todayStart.minus(Duration.ofDays(3))
        ));

        execution(todayStart.minus(Duration.ofDays(2)).plusSeconds(3_600), "DOWN",
                http(EU, 503, 900), http(US, 503, 900));
        execution(todayStart.plusSeconds(60), "UP", http(EU, 200, 100), http(US, 200, 300));
        execution(todayStart.plusSeconds(120), "UP", http(EU, 200, 200), http(US, 200, 400));
        execution(todayStart.plusSeconds(180), "NO_DATA", failure(EU), failure(US));
    }

    @Test
    void dailyEvidenceUsesUtcBoundariesRegardlessOfConnectionTimeZone() {
        LocalDate day = LocalDate.of(2026, 1, 15);
        Instant start = day.atStartOfDay(ZoneOffset.UTC).toInstant();
        monitor = monitorRepository.saveAndFlush(Monitor.create(
                "ali-subject", "UTC boundary monitor", "https://example.com", 60, 5_000,
                start.minus(Duration.ofDays(2))
        ));
        execution(start.minusSeconds(1), "DOWN");
        execution(start, "UP");
        execution(start.plusSeconds(43_200), "UP");
        execution(start.plusSeconds(86_399), "UP");
        execution(start.plusSeconds(86_400), "DOWN");

        for (String zone : List.of("UTC", "Africa/Casablanca", "America/Los_Angeles")) {
            jdbcTemplate.queryForObject("SELECT set_config('TimeZone', ?, true)", String.class, zone);
            var days = historyRepository.dailyEvidence(List.of(monitor.getId()), day.minusDays(1), day.plusDays(1))
                    .get(monitor.getId());
            assertThat(days).as("UTC buckets with connection zone %s", zone).hasSize(3);
            assertThat(days.get(0).day()).isEqualTo(day.minusDays(1));
            assertThat(days.get(0).up()).as("previous-day UP in %s", zone).isZero();
            assertThat(days.get(0).down()).as("previous-day DOWN in %s", zone).isEqualTo(1);
            assertThat(days.get(1).day()).isEqualTo(day);
            assertThat(days.get(1).up()).as("same-day UP in %s", zone).isEqualTo(3);
            assertThat(days.get(1).down()).as("same-day DOWN in %s", zone).isZero();
            assertThat(days.get(2).day()).isEqualTo(day.plusDays(1));
            assertThat(days.get(2).up()).isZero();
            assertThat(days.get(2).down()).isEqualTo(1);
        }
    }

    @Test
    void ownerReadsZeroFilledDailyEvidenceRegionLatencyAndRecentChecks() throws Exception {
        mockMvc.perform(get("/api/monitors/{id}/history", monitor.getId())
                        .queryParam("days", "7")
                        .with(jwt().jwt(token -> token.subject("ali-subject"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.days.length()").value(7))
                .andExpect(jsonPath("$.days[6].day").value(todayStart.atOffset(ZoneOffset.UTC).toLocalDate().toString()))
                .andExpect(jsonPath("$.days[6].up").value(2))
                .andExpect(jsonPath("$.days[6].noData").value(1))
                .andExpect(jsonPath("$.days[6].status").value("OPERATIONAL"))
                .andExpect(jsonPath("$.days[4].down").value(1))
                .andExpect(jsonPath("$.days[4].status").value("OUTAGE"))
                .andExpect(jsonPath("$.days[5].status").value("NO_DATA"))
                .andExpect(jsonPath("$.days[0].up").value(0))
                // The 24-hour region window excludes the two-day-old 503s; timeouts carry no latency sample.
                .andExpect(jsonPath("$.regions.length()").value(2))
                .andExpect(jsonPath("$.regions[0].region").value(EU))
                .andExpect(jsonPath("$.regions[0].httpSamples").value(2))
                .andExpect(jsonPath("$.regions[0].p50Ms").value(100))
                .andExpect(jsonPath("$.regions[0].p95Ms").value(200))
                .andExpect(jsonPath("$.regions[0].lastOutcome").value("CONNECT_TIMEOUT"))
                .andExpect(jsonPath("$.regions[0].lastHttpStatus").value(nullValue()))
                .andExpect(jsonPath("$.regions[1].p95Ms").value(400))
                .andExpect(jsonPath("$.recentChecks.length()").value(4))
                .andExpect(jsonPath("$.recentChecks[0].verdict").value("NO_DATA"))
                .andExpect(jsonPath("$.recentChecks[0].results.length()").value(2))
                .andExpect(jsonPath("$.recentChecks[1].results[1].region").value(US))
                .andExpect(jsonPath("$.recentChecks[1].results[1].latencyMs").value(400));
    }

    @Test
    void anotherOwnerCannotLearnTheMonitorExists() throws Exception {
        mockMvc.perform(get("/api/monitors/{id}/history", monitor.getId())
                        .with(jwt().jwt(token -> token.subject("other-subject"))))
                .andExpect(status().isNotFound());
    }

    @Test
    void anonymousCallerIsRejected() throws Exception {
        mockMvc.perform(get("/api/monitors/{id}/history", monitor.getId()))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void rejectsWindowsOutsideOneToNinetyDays() throws Exception {
        for (String days : new String[]{"0", "91"}) {
            mockMvc.perform(get("/api/monitors/{id}/history", monitor.getId())
                            .queryParam("days", days)
                            .with(jwt().jwt(token -> token.subject("ali-subject"))))
                    .andExpect(status().isBadRequest());
        }
    }

    @Test
    void heatmapCountsHttpResponsesByRegionTimeColumnAndLatencyBand() throws Exception {
        // 24 hours, not 48: a 48-hour window reaches into "two days ago" during the first hour of every UTC day,
        // which made this test fail between 00:00 and 01:00 UTC.
        mockMvc.perform(get("/api/monitors/{id}/latency-heatmap", monitor.getId())
                        .queryParam("hours", "24")
                        .with(jwt().jwt(token -> token.subject("ali-subject"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.bucketSeconds").value(1800))
                .andExpect(jsonPath("$.latencyBoundsMs.length()").value(7))
                .andExpect(jsonPath("$.regions.length()").value(2))
                .andExpect(jsonPath("$.regions[0].region").value(EU))
                // Today's two HTTP responses in eu-west-1: 100 ms (band 2: 100-200) and 200 ms (band 3: 200-400);
                // the two-day-old 503 is outside 24 hours and the timeout carries no latency sample.
                .andExpect(jsonPath("$.regions[0].samples").value(2))
                .andExpect(jsonPath("$.regions[0].counts.length()").value(48))
                .andExpect(jsonPath("$.regions[0].counts[0].length()").value(8))
                .andExpect(jsonPath("$.regions[0].counts[*][2]", hasItem(1)))
                .andExpect(jsonPath("$.regions[0].counts[*][3]", hasItem(1)))
                .andExpect(jsonPath("$.regions[0].counts[*][1]", not(hasItem(1))))
                .andExpect(jsonPath("$.regions[1].samples").value(2))
                // Nearest-rank percentiles per column: eu-west-1 measured 100 and 200 ms, us-east-1 300 and 400 ms.
                // Columns without an HTTP response stay null rather than zero.
                .andExpect(jsonPath("$.regions[0].p50Ms.length()").value(48))
                .andExpect(jsonPath("$.regions[0].p50Ms[*]", hasItem(100)))
                .andExpect(jsonPath("$.regions[0].p95Ms[*]", hasItem(200)))
                // Any empty column, not column 0: the samples sit just after today's UTC midnight, which falls in
                // column 0 of the trailing 24 hours once the clock passes 23:30 UTC.
                .andExpect(jsonPath("$.regions[0].p50Ms[*]", hasItem(nullValue())))
                .andExpect(jsonPath("$.regions[1].p50Ms[*]", hasItem(300)))
                .andExpect(jsonPath("$.regions[1].p95Ms[*]", hasItem(400)))
                // The same nearest-rank percentiles over the whole window, per region.
                .andExpect(jsonPath("$.regions[0].windowP50Ms").value(100))
                .andExpect(jsonPath("$.regions[0].windowP95Ms").value(200))
                .andExpect(jsonPath("$.regions[1].windowP50Ms").value(300))
                .andExpect(jsonPath("$.regions[1].windowP95Ms").value(400));
    }

    @Test
    void heatmapIsOwnerOnlyAndBoundedToOneWeek() throws Exception {
        mockMvc.perform(get("/api/monitors/{id}/latency-heatmap", monitor.getId())
                        .with(jwt().jwt(token -> token.subject("other-subject"))))
                .andExpect(status().isNotFound());
        mockMvc.perform(get("/api/monitors/{id}/latency-heatmap", monitor.getId())
                        .queryParam("hours", "169")
                        .with(jwt().jwt(token -> token.subject("ali-subject"))))
                .andExpect(status().isBadRequest());
    }

    private record Fact(String region, String outcome, Integer httpStatus, long latencyMs) {
    }

    private static Fact http(String region, int httpStatus, long latencyMs) {
        return new Fact(region, "HTTP_RESPONSE", httpStatus, latencyMs);
    }

    private static Fact failure(String region) {
        return new Fact(region, "CONNECT_TIMEOUT", null, 5_000);
    }

    private void execution(Instant scheduledAt, String verdict, Fact... facts) {
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
        for (Fact fact : facts) {
            UUID jobId = UUID.randomUUID();
            jdbcTemplate.update(
                    "INSERT INTO probe_jobs (job_id, execution_id, probe_region) VALUES (?, ?, ?)",
                    jobId, executionId, fact.region()
            );
            jdbcTemplate.update(
                    """
                    INSERT INTO probe_results
                    (job_id, execution_id, monitor_id, probe_region, scheduled_at, started_at,
                     completed_at, outcome, http_status, latency_ms, response_bytes,
                     monitor_behavior_version)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
                    """,
                    jobId, executionId, monitor.getId(), fact.region(), timestamp(scheduledAt),
                    timestamp(scheduledAt.plusSeconds(1)), timestamp(scheduledAt.plusSeconds(2)),
                    fact.outcome(), fact.httpStatus(), fact.latencyMs(), monitor.getBehaviorVersion()
            );
        }
    }

    private OffsetDateTime timestamp(Instant instant) {
        return instant.atOffset(ZoneOffset.UTC);
    }
}

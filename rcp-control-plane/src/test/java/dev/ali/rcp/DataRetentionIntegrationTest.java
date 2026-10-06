package dev.ali.rcp;

import dev.ali.rcp.monitors.Monitor;
import dev.ali.rcp.monitors.MonitorRepository;
import dev.ali.rcp.retention.DataRetention;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
@Transactional
class DataRetentionIntegrationTest {
    @Autowired DataRetention retention;
    @Autowired MonitorRepository monitorRepository;
    @Autowired JdbcTemplate jdbc;

    private Monitor monitor;
    private Instant now;

    @BeforeEach
    void createMonitor() {
        // Retention ages rows with database time, so the fixtures are placed relative to it.
        now = jdbc.queryForObject("SELECT clock_timestamp()", OffsetDateTime.class).toInstant();
        monitor = monitorRepository.saveAndFlush(Monitor.create(
                "retention-owner", "Retention monitor", "https://example.com", 60, 5_000, now.minus(Duration.ofDays(200))
        ));
    }

    @Test
    void oldCheckHistoryGoesButIncidentEvidenceRecentChecksAndUnfinishedWorkStay() {
        UUID old = execution(now.minus(Duration.ofDays(120)), true);
        UUID opener = execution(now.minus(Duration.ofDays(119)), true);
        UUID recent = execution(now.minus(Duration.ofDays(10)), true);
        UUID oldPending = execution(now.minus(Duration.ofDays(121)), false);
        jdbc.update("""
                INSERT INTO incidents (incident_id, monitor_id, status, opened_by_execution_id, opened_at)
                VALUES (?, ?, 'OPEN', ?, ?)
                """, UUID.randomUUID(), monitor.getId(), opener, timestamp(now.minus(Duration.ofDays(119))));

        retention.prune();

        assertThat(exists("probe_executions", old)).isFalse();
        assertThat(count("probe_jobs", old)).isZero();
        assertThat(count("probe_results", old)).isZero();
        assertThat(count("incident_evaluations", old)).isZero();
        assertThat(exists("probe_executions", opener)).isTrue();
        assertThat(count("probe_results", opener)).isEqualTo(2);
        assertThat(exists("probe_executions", recent)).isTrue();
        assertThat(count("probe_results", recent)).isEqualTo(2);
        assertThat(exists("probe_executions", oldPending)).isTrue();
    }

    @Test
    void publishedOutboxEventsAndProcessedMessageIdsExpireButPendingEventsStay() {
        UUID oldPublished = outboxEvent(now.minus(Duration.ofDays(20)), true);
        UUID recentPublished = outboxEvent(now.minus(Duration.ofDays(2)), true);
        UUID oldUnpublished = outboxEvent(now.minus(Duration.ofDays(20)), false);
        jdbc.update("INSERT INTO processed_messages (consumer_name, message_id, processed_at) VALUES ('results', 'old', ?)",
                timestamp(now.minus(Duration.ofDays(20))));
        jdbc.update("INSERT INTO processed_messages (consumer_name, message_id, processed_at) VALUES ('results', 'new', ?)",
                timestamp(now.minus(Duration.ofDays(2))));

        retention.prune();

        assertThat(jdbc.queryForObject("SELECT count(*) FROM outbox_events WHERE event_id = ?", Integer.class, oldPublished)).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM outbox_events WHERE event_id = ?", Integer.class, recentPublished)).isOne();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM outbox_events WHERE event_id = ?", Integer.class, oldUnpublished)).isOne();
        assertThat(jdbc.queryForList("SELECT message_id FROM processed_messages WHERE consumer_name = 'results'", String.class))
                .containsExactly("new");
    }

    private UUID execution(Instant scheduledAt, boolean finalized) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO probe_executions
                (execution_id, monitor_id, scheduled_at, result_deadline_at, target_url_snapshot, timeout_ms_snapshot,
                 monitor_behavior_version, incident_policy_version, expected_region_count, status, verdict, finalized_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, 1, 2, ?, ?, ?)
                """,
                id, monitor.getId(), timestamp(scheduledAt), timestamp(scheduledAt.plusSeconds(30)),
                monitor.getTargetUrl(), monitor.getTimeoutMs(), monitor.getBehaviorVersion(),
                finalized ? "FINALIZED" : "PENDING", finalized ? "UP" : null,
                finalized ? timestamp(scheduledAt.plusSeconds(31)) : null);
        if (!finalized) return id;
        for (String region : new String[]{"eu-west-1", "us-east-1"}) {
            UUID jobId = UUID.randomUUID();
            jdbc.update("INSERT INTO probe_jobs (job_id, execution_id, probe_region) VALUES (?, ?, ?)", jobId, id, region);
            jdbc.update("""
                    INSERT INTO probe_results
                    (job_id, execution_id, monitor_id, probe_region, scheduled_at, started_at, completed_at, outcome,
                     http_status, latency_ms, response_bytes, monitor_behavior_version)
                    VALUES (?, ?, ?, ?, ?, ?, ?, 'HTTP_RESPONSE', 200, 120, 0, ?)
                    """,
                    jobId, id, monitor.getId(), region, timestamp(scheduledAt), timestamp(scheduledAt.plusSeconds(1)),
                    timestamp(scheduledAt.plusSeconds(2)), monitor.getBehaviorVersion());
        }
        jdbc.update("""
                INSERT INTO incident_evaluations (execution_id, monitor_id, verdict, transition, evaluated_at)
                VALUES (?, ?, 'UP', 'NONE', ?)
                """, id, monitor.getId(), timestamp(scheduledAt.plusSeconds(32)));
        return id;
    }

    private UUID outboxEvent(Instant createdAt, boolean published) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO outbox_events
                (event_id, aggregate_type, aggregate_id, event_type, destination_region, payload, published_at, created_at)
                VALUES (?, 'PROBE_JOB', ?, 'PROBE_JOB_REQUESTED', 'eu-west-1', '{"schemaVersion":1}'::jsonb, ?, ?)
                """, id, UUID.randomUUID(), published ? timestamp(createdAt.plusSeconds(1)) : null, timestamp(createdAt));
        return id;
    }

    private boolean exists(String table, UUID executionId) {
        return count(table, executionId) > 0;
    }

    private int count(String table, UUID executionId) {
        return jdbc.queryForObject("SELECT count(*) FROM " + table + " WHERE execution_id = ?", Integer.class, executionId);
    }

    private OffsetDateTime timestamp(Instant instant) {
        return instant.atOffset(ZoneOffset.UTC);
    }
}

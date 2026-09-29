package dev.ali.rcp;

import dev.ali.rcp.incidents.ExecutionVerdict;
import dev.ali.rcp.incidents.IncidentProcessor;
import dev.ali.rcp.monitors.Monitor;
import dev.ali.rcp.monitors.MonitorRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
@Transactional
class IncidentProcessorIntegrationTest {
    @Autowired
    private MonitorRepository monitorRepository;

    @Autowired
    private IncidentProcessor processor;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void opensAndResolvesExactlyOneIncidentFromOrderedVerdicts() {
        Monitor monitor = createMonitor();
        insertFinalizedExecution(monitor, minute(0), ExecutionVerdict.DOWN);
        insertFinalizedExecution(monitor, minute(1), ExecutionVerdict.DOWN);
        insertFinalizedExecution(monitor, minute(2), ExecutionVerdict.UP);
        insertFinalizedExecution(monitor, minute(3), ExecutionVerdict.UP);

        assertThat(processor.processBatch()).isEqualTo(1);
        assertThat(processor.processBatch()).isEqualTo(1);
        assertThat(currentState(monitor)).isEqualTo("OPEN");
        assertThat(count("incidents")).isEqualTo(1);
        assertThat(eventTypes()).isEqualTo("OPENED");

        assertThat(processor.processBatch()).isEqualTo(1);
        assertThat(processor.processBatch()).isEqualTo(1);
        assertThat(processor.processBatch()).isZero();

        assertThat(currentState(monitor)).isEqualTo("HEALTHY");
        assertThat(incidentStatus()).isEqualTo("RESOLVED");
        assertThat(eventTypes()).isEqualTo("OPENED,RESOLVED");
        assertThat(count("incident_evaluations")).isEqualTo(4);
    }

    @Test
    void inconclusiveVerdictBreaksTheFailureStreak() {
        Monitor monitor = createMonitor();
        insertFinalizedExecution(monitor, minute(0), ExecutionVerdict.DOWN);
        insertFinalizedExecution(monitor, minute(1), ExecutionVerdict.DISAGREEMENT);
        insertFinalizedExecution(monitor, minute(2), ExecutionVerdict.DOWN);

        assertThat(processor.processBatch()).isEqualTo(1);
        assertThat(processor.processBatch()).isEqualTo(1);
        assertThat(processor.processBatch()).isEqualTo(1);

        assertThat(currentState(monitor)).isEqualTo("HEALTHY");
        assertThat(count("incidents")).isZero();
        assertThat(consecutiveDown(monitor)).isEqualTo(1);
    }

    @Test
    void oldFailureStreakDoesNotCarryIntoResumedMonitor() {
        Monitor monitor = createMonitor();
        insertFinalizedExecution(monitor, minute(0), ExecutionVerdict.DOWN);
        assertThat(processor.processBatch()).isEqualTo(1);
        assertThat(consecutiveDown(monitor)).isEqualTo(1);

        monitor.changeEnabled(false, minute(0).plusSeconds(30));
        monitorRepository.flush();
        monitor.changeEnabled(true, minute(1));
        monitorRepository.flush();
        insertFinalizedExecution(monitor, minute(2), ExecutionVerdict.DOWN);

        assertThat(processor.processBatch()).isEqualTo(1);
        assertThat(consecutiveDown(monitor)).isEqualTo(1);
        assertThat(count("incidents")).isZero();
    }

    @Test
    void pendingOldExecutionCannotOpenIncidentAfterPause() {
        Monitor monitor = createMonitor();
        insertFinalizedExecution(monitor, minute(0), ExecutionVerdict.DOWN);
        monitor.changeEnabled(false, minute(0).plusSeconds(30));
        monitorRepository.flush();

        assertThat(processor.processBatch()).isEqualTo(1);
        assertThat(count("incidents")).isZero();
        assertThat(count("monitor_incident_state")).isZero();
        assertThat(jdbcTemplate.queryForObject(
                "SELECT transition FROM incident_evaluations", String.class
        )).isEqualTo("IGNORED_STALE");
    }

    @Test
    void openIncidentPersistsThroughPauseAndNeedsTwoFreshUpsToResolve() {
        Monitor monitor = createMonitor();
        insertFinalizedExecution(monitor, minute(0), ExecutionVerdict.DOWN);
        insertFinalizedExecution(monitor, minute(1), ExecutionVerdict.DOWN);
        assertThat(processor.processBatch()).isEqualTo(1);
        assertThat(processor.processBatch()).isEqualTo(1);
        assertThat(currentState(monitor)).isEqualTo("OPEN");

        monitor.changeEnabled(false, minute(1).plusSeconds(30));
        monitorRepository.flush();
        monitor.changeEnabled(true, minute(2));
        monitorRepository.flush();
        insertFinalizedExecution(monitor, minute(3), ExecutionVerdict.UP);
        insertFinalizedExecution(monitor, minute(4), ExecutionVerdict.UP);

        assertThat(processor.processBatch()).isEqualTo(1);
        assertThat(currentState(monitor)).isEqualTo("OPEN");
        assertThat(processor.processBatch()).isEqualTo(1);
        assertThat(currentState(monitor)).isEqualTo("HEALTHY");
        assertThat(eventTypes()).isEqualTo("OPENED,RESOLVED");
    }

    private Monitor createMonitor() {
        Monitor monitor = Monitor.create(
                "incident-processor-test",
                "Incident target",
                "https://example.com",
                60,
                5_000,
                minute(0)
        );
        return monitorRepository.saveAndFlush(monitor);
    }

    private void insertFinalizedExecution(
            Monitor monitor,
            Instant scheduledAt,
            ExecutionVerdict verdict
    ) {
        jdbcTemplate.update(
                """
                INSERT INTO probe_executions
                (
                    execution_id, monitor_id, scheduled_at, result_deadline_at,
                    target_url_snapshot, timeout_ms_snapshot,
                    monitor_behavior_version, incident_policy_version,
                    expected_region_count, status, verdict, finalized_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, 1, 2, 'FINALIZED', ?, ?)
                """,
                UUID.randomUUID(),
                monitor.getId(),
                timestamp(scheduledAt),
                timestamp(scheduledAt.plusSeconds(30)),
                monitor.getTargetUrl(),
                monitor.getTimeoutMs(),
                monitor.getBehaviorVersion(),
                verdict.name(),
                timestamp(scheduledAt.plusSeconds(31))
        );
    }

    private String currentState(Monitor monitor) {
        return jdbcTemplate.queryForObject(
                "SELECT status FROM monitor_incident_state WHERE monitor_id = ?",
                String.class,
                monitor.getId()
        );
    }

    private int consecutiveDown(Monitor monitor) {
        return jdbcTemplate.queryForObject(
                "SELECT consecutive_down FROM monitor_incident_state WHERE monitor_id = ?",
                Integer.class,
                monitor.getId()
        );
    }

    private String incidentStatus() {
        return jdbcTemplate.queryForObject("SELECT status FROM incidents", String.class);
    }

    private String eventTypes() {
        return jdbcTemplate.queryForObject(
                """
                SELECT STRING_AGG(event_type, ',' ORDER BY occurred_at)
                FROM incident_events
                """,
                String.class
        );
    }

    private int count(String table) {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM " + table, Integer.class);
    }

    private Instant minute(long minute) {
        return Instant.parse("2026-09-07T12:00:00Z").plusSeconds(minute * 60);
    }

    private OffsetDateTime timestamp(Instant instant) {
        return instant.atOffset(ZoneOffset.UTC);
    }
}

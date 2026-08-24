package dev.ali.rcp;

import dev.ali.rcp.monitors.Monitor;
import dev.ali.rcp.monitors.MonitorRepository;
import dev.ali.rcp.scheduling.DueMonitorScheduler;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
@Transactional
class DueMonitorSchedulerTest {

    @Autowired
    private MonitorRepository monitorRepository;

    @Autowired
    private DueMonitorScheduler scheduler;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void createsDurableRegionalWorkForOneDueMonitor() {
        Instant originalDueTime =
                Instant.parse("2026-08-17T12:00:00Z");

        Monitor monitor = Monitor.create(
                "ali-subject",
                "Portfolio",
                "https://example.com",
                60,
                5_000,
                originalDueTime
        );

        monitorRepository.saveAndFlush(monitor);

        int scheduledMonitors = scheduler.scheduleBatch();

        assertThat(scheduledMonitors).isEqualTo(1);
        assertThat(countExecutions(monitor)).isEqualTo(1);
        assertThat(countJobs(monitor)).isEqualTo(2);
        assertThat(countOutboxEvents(monitor)).isEqualTo(2);
        assertThat(regionsFor(monitor))
                .containsExactly("eu-west-1", "us-east-1");
        assertThat(nextCheckAtFor(monitor))
                .isAfter(originalDueTime);

        assertThat(scheduler.scheduleBatch()).isZero();
        assertThat(countExecutions(monitor)).isEqualTo(1);
    }

    private int countExecutions(Monitor monitor) {
        return jdbcTemplate.queryForObject(
                """
                SELECT COUNT(*)
                FROM probe_executions
                WHERE monitor_id = ?
                """,
                Integer.class,
                monitor.getId()
        );
    }

    private int countJobs(Monitor monitor) {
        return jdbcTemplate.queryForObject(
                """
                SELECT COUNT(*)
                FROM probe_jobs jobs
                JOIN probe_executions executions
                  ON executions.execution_id = jobs.execution_id
                WHERE executions.monitor_id = ?
                """,
                Integer.class,
                monitor.getId()
        );
    }

    private int countOutboxEvents(Monitor monitor) {
        return jdbcTemplate.queryForObject(
                """
                SELECT COUNT(*)
                FROM outbox_events events
                JOIN probe_jobs jobs
                  ON jobs.job_id = events.aggregate_id
                JOIN probe_executions executions
                  ON executions.execution_id = jobs.execution_id
                WHERE executions.monitor_id = ?
                """,
                Integer.class,
                monitor.getId()
        );
    }

    private List<String> regionsFor(Monitor monitor) {
        return jdbcTemplate.queryForList(
                """
                SELECT jobs.probe_region
                FROM probe_jobs jobs
                JOIN probe_executions executions
                  ON executions.execution_id = jobs.execution_id
                WHERE executions.monitor_id = ?
                ORDER BY jobs.probe_region
                """,
                String.class,
                monitor.getId()
        );
    }

    private Instant nextCheckAtFor(Monitor monitor) {
        OffsetDateTime nextCheckAt = jdbcTemplate.queryForObject(
                """
                SELECT next_check_at
                FROM monitors
                WHERE monitor_id = ?
                """,
                OffsetDateTime.class,
                monitor.getId()
        );

        return nextCheckAt.toInstant();
    }
}

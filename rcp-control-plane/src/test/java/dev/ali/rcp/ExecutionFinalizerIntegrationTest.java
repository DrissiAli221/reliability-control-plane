package dev.ali.rcp;

import dev.ali.rcp.incidents.ExecutionFinalizer;
import dev.ali.rcp.monitors.Monitor;
import dev.ali.rcp.monitors.MonitorRepository;
import dev.ali.rcp.probes.ProbeMessageCodec;
import dev.ali.rcp.probes.ProbeOutcome;
import dev.ali.rcp.probes.ProbeResult;
import dev.ali.rcp.probes.ProbeResultIngestionService;
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
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
@Transactional
class ExecutionFinalizerIntegrationTest {
    @Autowired
    private MonitorRepository monitorRepository;

    @Autowired
    private DueMonitorScheduler scheduler;

    @Autowired
    private ProbeMessageCodec codec;

    @Autowired
    private ProbeResultIngestionService ingestionService;

    @Autowired
    private ExecutionFinalizer finalizer;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void finalizesCompleteMixedRegionalEvidenceExactlyOnce() {
        Monitor monitor = scheduleMonitor("mixed-regions");
        List<ScheduledJob> jobs = jobsFor(monitor.getId());

        ingest(jobs.get(0), monitor, 200, "message-eu");
        ingest(jobs.get(1), monitor, 503, "message-us");

        assertThat(finalizer.finalizeBatch()).isEqualTo(1);
        assertThat(finalizer.finalizeBatch()).isZero();
        assertThat(executionState(jobs.get(0).executionId()))
                .isEqualTo("FINALIZED:DISAGREEMENT");
    }

    @Test
    void finalizesExpiredExecutionWithoutResultsAsNoData() {
        Monitor monitor = scheduleMonitor("no-data");
        ScheduledJob job = jobsFor(monitor.getId()).get(0);
        jdbcTemplate.update(
                """
                UPDATE probe_executions
                SET result_deadline_at = scheduled_at + INTERVAL '1 second'
                WHERE execution_id = ?
                """,
                job.executionId()
        );

        assertThat(finalizer.finalizeBatch()).isEqualTo(1);
        assertThat(executionState(job.executionId()))
                .isEqualTo("FINALIZED:NO_DATA");
    }

    private Monitor scheduleMonitor(String owner) {
        Monitor monitor = Monitor.create(
                owner,
                "Execution target",
                "https://example.com",
                60,
                5_000,
                Instant.parse("2026-09-07T12:00:00Z")
        );
        monitorRepository.saveAndFlush(monitor);
        assertThat(scheduler.scheduleBatch()).isEqualTo(1);
        return monitor;
    }

    private List<ScheduledJob> jobsFor(UUID monitorId) {
        return jdbcTemplate.query(
                """
                SELECT jobs.job_id, jobs.execution_id, jobs.probe_region,
                       executions.scheduled_at
                FROM probe_jobs jobs
                JOIN probe_executions executions
                  ON executions.execution_id = jobs.execution_id
                WHERE executions.monitor_id = ?
                ORDER BY jobs.probe_region
                """,
                (resultSet, rowNumber) -> new ScheduledJob(
                        resultSet.getObject("job_id", UUID.class),
                        resultSet.getObject("execution_id", UUID.class),
                        resultSet.getString("probe_region"),
                        resultSet.getObject("scheduled_at", OffsetDateTime.class).toInstant()
                ),
                monitorId
        );
    }

    private void ingest(ScheduledJob job, Monitor monitor, int status, String messageId) {
        ProbeResult result = new ProbeResult(
                job.jobId(),
                job.executionId(),
                monitor.getId(),
                job.probeRegion(),
                job.scheduledAt(),
                job.scheduledAt().plusMillis(10),
                job.scheduledAt().plusMillis(30),
                ProbeOutcome.HTTP_RESPONSE,
                status,
                20,
                0,
                null,
                Math.toIntExact(monitor.getBehaviorVersion())
        );
        ingestionService.ingest(messageId, codec.encodeResult(result));
    }

    private String executionState(UUID executionId) {
        return jdbcTemplate.queryForObject(
                """
                SELECT status || ':' || verdict
                FROM probe_executions
                WHERE execution_id = ?
                """,
                String.class,
                executionId
        );
    }

    private record ScheduledJob(
            UUID jobId,
            UUID executionId,
            String probeRegion,
            Instant scheduledAt
    ) {
    }
}

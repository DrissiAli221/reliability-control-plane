package dev.ali.rcp;

import dev.ali.rcp.monitors.Monitor;
import dev.ali.rcp.monitors.MonitorRepository;
import dev.ali.rcp.probes.ProbeMessageCodec;
import dev.ali.rcp.probes.ProbeOutcome;
import dev.ali.rcp.probes.ProbeResult;
import dev.ali.rcp.probes.ProbeResultIngestion;
import dev.ali.rcp.probes.ProbeResultIngestionService;
import dev.ali.rcp.scheduling.DueMonitorScheduler;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
@Transactional
class ProbeResultIngestionTest {
    @Autowired
    private MonitorRepository monitorRepository;

    @Autowired
    private DueMonitorScheduler scheduler;

    @Autowired
    private ProbeMessageCodec codec;

    @Autowired
    private ProbeResultIngestionService ingestionService;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void duplicateDeliveryOfTheSameMessageStoresOneLogicalResult() {
        ProbeResult result = scheduledResult();
        String payload = codec.encodeResult(result);

        assertThat(ingestionService.ingest("sqs-message-1", payload))
                .isEqualTo(ProbeResultIngestion.STORED);
        assertThat(ingestionService.ingest("sqs-message-1", payload))
                .isEqualTo(ProbeResultIngestion.DUPLICATE_MESSAGE);

        assertThat(count("probe_results")).isEqualTo(1);
        assertThat(count("processed_messages")).isEqualTo(1);
    }

    @Test
    void duplicatePublicationWithANewQueueMessageStillStoresOneLogicalResult() {
        ProbeResult result = scheduledResult();
        String payload = codec.encodeResult(result);

        assertThat(ingestionService.ingest("sqs-message-1", payload))
                .isEqualTo(ProbeResultIngestion.STORED);
        assertThat(ingestionService.ingest("sqs-message-2", payload))
                .isEqualTo(ProbeResultIngestion.DUPLICATE_LOGICAL_RESULT);

        assertThat(count("probe_results")).isEqualTo(1);
        assertThat(count("processed_messages")).isEqualTo(2);
    }

    private ProbeResult scheduledResult() {
        Monitor monitor = Monitor.create(
                "result-test-owner",
                "Result target",
                "https://example.com",
                60,
                5_000,
                Instant.parse("2026-09-07T12:00:00Z")
        );
        monitorRepository.saveAndFlush(monitor);
        assertThat(scheduler.scheduleBatch()).isEqualTo(1);

        ScheduledJob job = jdbcTemplate.queryForObject(
                """
                SELECT jobs.job_id, jobs.execution_id, jobs.probe_region,
                       executions.scheduled_at
                FROM probe_jobs jobs
                JOIN probe_executions executions
                  ON executions.execution_id = jobs.execution_id
                ORDER BY jobs.probe_region
                LIMIT 1
                """,
                (resultSet, rowNumber) -> new ScheduledJob(
                        resultSet.getObject("job_id", UUID.class),
                        resultSet.getObject("execution_id", UUID.class),
                        resultSet.getString("probe_region"),
                        resultSet.getObject("scheduled_at", java.time.OffsetDateTime.class).toInstant()
                )
        );

        return new ProbeResult(
                job.jobId(),
                job.executionId(),
                monitor.getId(),
                job.probeRegion(),
                job.scheduledAt(),
                job.scheduledAt().plusMillis(10),
                job.scheduledAt().plusMillis(42),
                ProbeOutcome.HTTP_RESPONSE,
                503,
                32,
                12,
                null,
                Math.toIntExact(monitor.getBehaviorVersion())
        );
    }

    private int count(String table) {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM " + table, Integer.class);
    }

    private record ScheduledJob(
            UUID jobId,
            UUID executionId,
            String probeRegion,
            Instant scheduledAt
    ) {
    }
}

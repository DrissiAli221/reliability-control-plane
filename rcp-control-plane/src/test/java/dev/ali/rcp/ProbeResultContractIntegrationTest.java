package dev.ali.rcp;

import dev.ali.rcp.monitors.Monitor;
import dev.ali.rcp.monitors.MonitorRepository;
import dev.ali.rcp.monitors.MonitorService;
import dev.ali.rcp.probes.ProbeMessageCodec;
import dev.ali.rcp.probes.ProbeOutcome;
import dev.ali.rcp.probes.ProbeResult;
import dev.ali.rcp.probes.ProbeResultIngestion;
import dev.ali.rcp.probes.ProbeResultIngestionService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
class ProbeResultContractIntegrationTest {
    private static final Instant SCHEDULED = Instant.parse("2026-09-07T12:00:00Z");

    @Autowired MonitorRepository monitors;
    @Autowired MonitorService monitorService;
    @Autowired JdbcTemplate jdbc;
    @Autowired ProbeMessageCodec codec;
    @Autowired ProbeResultIngestionService ingestion;
    private UUID ownerId;
    private UUID otherId;
    private UUID executionId;
    private UUID jobId;

    @Test
    void forgedSnapshotFieldsAreRejectedWithoutConsumingMessageId() {
        Monitor owner = monitor();
        ownerId = owner.getId();
        Monitor other = monitor();
        otherId = other.getId();
        executionId = UUID.randomUUID();
        jobId = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO probe_executions
                    (execution_id, monitor_id, scheduled_at, result_deadline_at,
                     target_url_snapshot, timeout_ms_snapshot, monitor_behavior_version,
                     incident_policy_version, expected_region_count)
                VALUES (?, ?, ?, ?, 'https://example.com/', 5000, 1, 1, 1)
                """, executionId, owner.getId(), dbTime(SCHEDULED),
                dbTime(SCHEDULED.plusSeconds(60)));
        jdbc.update("INSERT INTO probe_jobs (job_id, execution_id, probe_region) VALUES (?, ?, ?)",
                jobId, executionId, "eu-west-1");
        // The test uses committed transactions so a rejected insert can roll back
        // independently. Keep the fixtures off the scheduler until cleanup.
        monitorService.setEnabled(owner.getOwnerSubject(), owner.getId(), false);
        monitorService.setEnabled(other.getOwnerSubject(), other.getId(), false);

        ProbeResult valid = result(jobId, executionId, owner.getId(), "eu-west-1", SCHEDULED, 1);
        List<ProbeResult> forged = List.of(
                result(jobId, executionId, other.getId(), "eu-west-1", SCHEDULED, 1),
                result(jobId, executionId, owner.getId(), "eu-west-1", SCHEDULED.plusSeconds(1), 1),
                result(jobId, executionId, owner.getId(), "eu-west-1", SCHEDULED, 2),
                result(jobId, executionId, owner.getId(), "us-east-1", SCHEDULED, 1)
        );

        for (ProbeResult forgedResult : forged) {
            String messageId = UUID.randomUUID().toString();
            assertThatThrownBy(() -> ingestion.ingest(messageId, codec.encodeResult(forgedResult)))
                    .isInstanceOf(DataIntegrityViolationException.class);
            assertThat(jdbc.queryForObject(
                    "SELECT COUNT(*) FROM processed_messages WHERE message_id = ?",
                    Integer.class, messageId)).isZero();
        }

        assertThat(ingestion.ingest("valid-" + jobId, codec.encodeResult(valid)))
                .isEqualTo(ProbeResultIngestion.STORED);
        assertThat(jdbc.queryForObject(
                "SELECT COUNT(*) FROM probe_results WHERE job_id = ?", Integer.class, jobId))
                .isEqualTo(1);
    }

    @AfterEach
    void removeOnlyThisTestsCommittedFixtures() {
        if (jobId != null) {
            jdbc.update("DELETE FROM processed_messages WHERE message_id = ?", "valid-" + jobId);
            jdbc.update("DELETE FROM probe_results WHERE job_id = ?", jobId);
            jdbc.update("DELETE FROM probe_jobs WHERE job_id = ?", jobId);
        }
        if (executionId != null) {
            jdbc.update("DELETE FROM probe_executions WHERE execution_id = ?", executionId);
        }
        if (ownerId != null) {
            jdbc.update("DELETE FROM monitor_schedule_periods WHERE monitor_id = ?", ownerId);
            jdbc.update("DELETE FROM monitors WHERE monitor_id = ?", ownerId);
        }
        if (otherId != null) {
            jdbc.update("DELETE FROM monitor_schedule_periods WHERE monitor_id = ?", otherId);
            jdbc.update("DELETE FROM monitors WHERE monitor_id = ?", otherId);
        }
    }

    private Monitor monitor() {
        return monitors.saveAndFlush(Monitor.create(
                "contract-test-" + UUID.randomUUID(), "Target", "https://example.com/",
                60, 5000, SCHEDULED));
    }

    private ProbeResult result(
            UUID jobId, UUID executionId, UUID monitorId, String region,
            Instant scheduledAt, int behaviorVersion
    ) {
        return new ProbeResult(
                jobId, executionId, monitorId, region, scheduledAt,
                SCHEDULED.plusMillis(10), SCHEDULED.plusMillis(40),
                ProbeOutcome.HTTP_RESPONSE, 503, 30, 12, null, behaviorVersion);
    }

    private OffsetDateTime dbTime(Instant instant) {
        return instant.atOffset(ZoneOffset.UTC);
    }
}

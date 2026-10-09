package dev.ali.rcp.probes;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Objects;

@Repository
public class ProbeResultRepository {
    private final JdbcTemplate jdbcTemplate;

    public ProbeResultRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = Objects.requireNonNull(jdbcTemplate);
    }

    public boolean markMessageProcessed(String consumerName, String messageId) {
        return jdbcTemplate.update(
                """
                INSERT INTO processed_messages (consumer_name, message_id)
                VALUES (?, ?)
                ON CONFLICT (consumer_name, message_id) DO NOTHING
                """,
                consumerName,
                messageId
        ) == 1;
    }

    public boolean lockLiveMonitor(java.util.UUID monitorId) {
        return !jdbcTemplate.queryForList(
                "SELECT monitor_id FROM monitors WHERE monitor_id = ? AND deleted_at IS NULL FOR SHARE",
                java.util.UUID.class, monitorId).isEmpty();
    }

    public boolean insertResult(ProbeResult result) {
        return jdbcTemplate.update(
                """
                INSERT INTO probe_results
                (
                    job_id,
                    execution_id,
                    monitor_id,
                    probe_region,
                    scheduled_at,
                    started_at,
                    completed_at,
                    outcome,
                    http_status,
                    latency_ms,
                    response_bytes,
                    error_type,
                    monitor_behavior_version
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (job_id) DO NOTHING
                """,
                result.jobId(),
                result.executionId(),
                result.monitorId(),
                result.probeRegion(),
                timestamp(result.scheduledAt()),
                timestamp(result.startedAt()),
                timestamp(result.completedAt()),
                result.outcome().name(),
                result.httpStatus(),
                result.latencyMillis(),
                result.responseBytes(),
                result.errorType(),
                result.monitorBehaviorVersion()
        ) == 1;
    }

    private OffsetDateTime timestamp(Instant instant) {
        return instant.atOffset(ZoneOffset.UTC);
    }
}

package dev.ali.rcp.scheduling;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

@Repository
public class SchedulingRepository {

    private final JdbcTemplate jdbcTemplate;

    public SchedulingRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public Instant currentDatabaseTime() {
        OffsetDateTime databaseTime = jdbcTemplate.queryForObject(
                "SELECT CURRENT_TIMESTAMP",
                OffsetDateTime.class
        );

        return Objects.requireNonNull(databaseTime).toInstant();
    }

    public List<DueMonitor> findAndLockDueMonitors(int batchSize) {
        if (batchSize < 1) {
            throw new IllegalArgumentException(
                    "batchSize must be positive"
            );
        }

        return jdbcTemplate.query(
                """
                SELECT
                    monitor_id,
                    target_url,
                    check_interval_seconds,
                    timeout_ms,
                    behavior_version,
                    next_check_at
                FROM monitors
                WHERE deleted_at IS NULL AND enabled = TRUE
                  AND next_check_at <= CURRENT_TIMESTAMP
                ORDER BY next_check_at, monitor_id
                LIMIT ?
                FOR UPDATE SKIP LOCKED
                """,
                (resultSet, rowNumber) -> new DueMonitor(
                        resultSet.getObject(
                                "monitor_id",
                                UUID.class
                        ),
                        resultSet.getString("target_url"),
                        resultSet.getInt(
                                "check_interval_seconds"
                        ),
                        resultSet.getInt("timeout_ms"),
                        resultSet.getLong("behavior_version"),
                        resultSet.getObject(
                                "next_check_at",
                                OffsetDateTime.class
                        ).toInstant()
                ),
                batchSize
        );
    }

    public void insertExecution(
            UUID executionId,
            DueMonitor monitor,
            Instant resultDeadlineAt,
            long incidentPolicyVersion,
            int expectedRegionCount
    ) {
        int changedRows = jdbcTemplate.update(
                """
                INSERT INTO probe_executions
                (
                    execution_id,
                    monitor_id,
                    scheduled_at,
                    result_deadline_at,
                    target_url_snapshot,
                    timeout_ms_snapshot,
                    monitor_behavior_version,
                    incident_policy_version,
                    expected_region_count,
                    status,
                    created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', CURRENT_TIMESTAMP)
                """,
                executionId,
                monitor.monitorId(),
                databaseTimestamp(monitor.scheduledAt()),
                databaseTimestamp(resultDeadlineAt),
                monitor.targetUrl(),
                monitor.timeoutMs(),
                monitor.behaviorVersion(),
                incidentPolicyVersion,
                expectedRegionCount
        );

        requireOneChangedRow("insert probe execution", changedRows);
    }

    public void insertJobAndOutboxEvent(
            UUID executionId,
            UUID jobId,
            UUID eventId,
            DueMonitor monitor,
            String probeRegion,
            Instant resultDeadlineAt
    ) {
        int insertedJobs = jdbcTemplate.update(
                """
                INSERT INTO probe_jobs
                    (job_id, execution_id, probe_region, created_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                """,
                jobId,
                executionId,
                probeRegion
        );

        requireOneChangedRow("insert probe job", insertedJobs);

        int insertedEvents = jdbcTemplate.update(
                """
                INSERT INTO outbox_events
                (
                    event_id,
                    aggregate_type,
                    aggregate_id,
                    event_type,
                    destination_region,
                    payload,
                    next_attempt_at,
                    created_at
                )
                VALUES
                (
                    ?,
                    'PROBE_JOB',
                    ?,
                    'PROBE_JOB_REQUESTED',
                    ?,
                    JSONB_BUILD_OBJECT(
                        'schemaVersion', 1,
                        'eventId', CAST(? AS TEXT),
                        'jobId', CAST(? AS TEXT),
                        'executionId', CAST(? AS TEXT),
                        'monitorId', CAST(? AS TEXT),
                        'scheduledAt', ?,
                        'resultDeadlineAt', ?,
                        'targetUrl', ?,
                        'timeoutMs', ?,
                        'probeRegion', ?,
                        'monitorBehaviorVersion', ?
                    ),
                    CURRENT_TIMESTAMP,
                    CURRENT_TIMESTAMP
                )
                """,
                eventId,
                jobId,
                probeRegion,
                eventId,
                jobId,
                executionId,
                monitor.monitorId(),
                databaseTimestamp(monitor.scheduledAt()),
                databaseTimestamp(resultDeadlineAt),
                monitor.targetUrl(),
                monitor.timeoutMs(),
                probeRegion,
                monitor.behaviorVersion()
        );

        requireOneChangedRow("insert outbox event", insertedEvents);
    }

    public void advanceNextCheckAt(
            UUID monitorId,
            Instant claimedScheduledAt,
            Instant nextCheckAt
    ) {
        int changedRows = jdbcTemplate.update(
                """
                UPDATE monitors
                SET next_check_at = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE monitor_id = ?
                  AND enabled = TRUE
                  AND next_check_at = ?
                """,
                databaseTimestamp(nextCheckAt),
                monitorId,
                databaseTimestamp(claimedScheduledAt)
        );

        requireOneChangedRow("advance monitor schedule", changedRows);
    }

    private OffsetDateTime databaseTimestamp(Instant instant) {
        return instant.atOffset(ZoneOffset.UTC);
    }

    private void requireOneChangedRow(
            String operation,
            int changedRows
    ) {
        if (changedRows != 1) {
            throw new IllegalStateException(
                    operation + " changed " + changedRows + " rows"
            );
        }
    }
}

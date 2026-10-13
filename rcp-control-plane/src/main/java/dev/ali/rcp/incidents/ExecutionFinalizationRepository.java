package dev.ali.rcp.incidents;

import dev.ali.rcp.probes.ProbeOutcome;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

@Repository
public class ExecutionFinalizationRepository {
    private final JdbcTemplate jdbcTemplate;

    public ExecutionFinalizationRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = Objects.requireNonNull(jdbcTemplate);
    }

    public List<FinalizableExecution> findAndLockFinalizable(int batchSize) {
        if (batchSize < 1) {
            throw new IllegalArgumentException("batchSize must be positive");
        }
        return jdbcTemplate.query(
                """
                SELECT execution_id, monitor_id, scheduled_at,
                       result_deadline_at, expected_region_count,
                       result_deadline_at <= CURRENT_TIMESTAMP AS deadline_elapsed
                FROM probe_executions executions
                WHERE status = 'PENDING'
                  AND EXISTS (SELECT 1 FROM monitors m WHERE m.monitor_id = executions.monitor_id AND m.deleted_at IS NULL)
                  AND (
                      result_deadline_at <= CURRENT_TIMESTAMP
                      OR (
                          SELECT COUNT(*)
                          FROM probe_results results
                          WHERE results.execution_id = executions.execution_id
                      ) >= expected_region_count
                  )
                ORDER BY scheduled_at, execution_id
                LIMIT ?
                FOR UPDATE SKIP LOCKED
                """,
                (resultSet, rowNumber) -> new FinalizableExecution(
                        resultSet.getObject("execution_id", UUID.class),
                        resultSet.getObject("monitor_id", UUID.class),
                        resultSet.getObject("scheduled_at", OffsetDateTime.class).toInstant(),
                        resultSet.getObject("result_deadline_at", OffsetDateTime.class).toInstant(),
                        resultSet.getBoolean("deadline_elapsed"),
                        resultSet.getInt("expected_region_count")
                ),
                batchSize
        );
    }

    public List<RegionalProbeFact> findFacts(UUID executionId) {
        return jdbcTemplate.query(
                """
                SELECT probe_region, outcome, http_status, results.bot_protection, executions.accepted_http_statuses_snapshot
                FROM probe_results results JOIN probe_executions executions ON executions.execution_id = results.execution_id
                WHERE results.execution_id = ?
                ORDER BY probe_region
                """,
                (resultSet, rowNumber) -> new RegionalProbeFact(
                        resultSet.getString("probe_region"),
                        ProbeOutcome.valueOf(resultSet.getString("outcome")),
                        resultSet.getObject("http_status", Integer.class),
                        dev.ali.rcp.monitors.AcceptedHttpStatuses.read(resultSet, "accepted_http_statuses_snapshot"),
                        resultSet.getString("bot_protection")
                ),
                executionId
        );
    }

    public void finalizeExecution(UUID executionId, ExecutionVerdict verdict) {
        int changed = jdbcTemplate.update(
                """
                UPDATE probe_executions
                SET status = 'FINALIZED',
                    verdict = ?,
                    finalized_at = CURRENT_TIMESTAMP
                WHERE execution_id = ?
                  AND status = 'PENDING'
                """,
                verdict.name(),
                executionId
        );
        if (changed != 1) {
            throw new IllegalStateException("execution was already finalized: " + executionId);
        }
    }
}

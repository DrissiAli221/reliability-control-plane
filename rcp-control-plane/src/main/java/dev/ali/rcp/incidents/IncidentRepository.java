package dev.ali.rcp.incidents;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

@Repository
public class IncidentRepository {
    private final JdbcTemplate jdbcTemplate;

    public IncidentRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = Objects.requireNonNull(jdbcTemplate);
    }

    public List<FinalizedExecution> findAndLockNextUnevaluated(int batchSize) {
        if (batchSize < 1) {
            throw new IllegalArgumentException("batchSize must be positive");
        }
        return jdbcTemplate.query(
                """
                SELECT execution_id, monitor_id, scheduled_at, verdict
                FROM probe_executions executions
                WHERE status = 'FINALIZED'
                  AND NOT EXISTS (
                      SELECT 1 FROM incident_evaluations evaluated
                      WHERE evaluated.execution_id = executions.execution_id
                  )
                  AND NOT EXISTS (
                      SELECT 1
                      FROM probe_executions earlier
                      WHERE earlier.monitor_id = executions.monitor_id
                        AND (earlier.scheduled_at, earlier.execution_id)
                            < (executions.scheduled_at, executions.execution_id)
                        AND NOT EXISTS (
                            SELECT 1 FROM incident_evaluations earlier_evaluation
                            WHERE earlier_evaluation.execution_id = earlier.execution_id
                        )
                  )
                ORDER BY scheduled_at, execution_id
                LIMIT ?
                FOR UPDATE SKIP LOCKED
                """,
                (resultSet, rowNumber) -> new FinalizedExecution(
                        resultSet.getObject("execution_id", UUID.class),
                        resultSet.getObject("monitor_id", UUID.class),
                        resultSet.getObject("scheduled_at", OffsetDateTime.class).toInstant(),
                        ExecutionVerdict.valueOf(resultSet.getString("verdict"))
                ),
                batchSize
        );
    }

    public PersistedIncidentState findState(UUID monitorId) {
        return jdbcTemplate.query(
                """
                SELECT status, consecutive_down, consecutive_up,
                       last_evaluated_at, open_incident_id, opened_at
                FROM monitor_incident_state
                WHERE monitor_id = ?
                FOR UPDATE
                """,
                resultSet -> {
                    if (!resultSet.next()) {
                        return PersistedIncidentState.healthy();
                    }
                    OffsetDateTime lastEvaluated = resultSet.getObject("last_evaluated_at", OffsetDateTime.class);
                    OffsetDateTime openedAt = resultSet.getObject("opened_at", OffsetDateTime.class);
                    IncidentState state = new IncidentState(
                            IncidentState.Status.valueOf(resultSet.getString("status")),
                            resultSet.getInt("consecutive_down"),
                            resultSet.getInt("consecutive_up"),
                            lastEvaluated == null ? null : lastEvaluated.toInstant(),
                            openedAt == null ? null : openedAt.toInstant()
                    );
                    return new PersistedIncidentState(
                            state,
                            resultSet.getObject("open_incident_id", UUID.class)
                    );
                },
                monitorId
        );
    }

    public void openIncident(UUID incidentId, FinalizedExecution execution) {
        jdbcTemplate.update(
                """
                INSERT INTO incidents
                    (incident_id, monitor_id, status, opened_by_execution_id, opened_at)
                VALUES (?, ?, 'OPEN', ?, ?)
                """,
                incidentId,
                execution.monitorId(),
                execution.executionId(),
                timestamp(execution.scheduledAt())
        );
    }

    public void resolveIncident(UUID incidentId, FinalizedExecution execution) {
        int changed = jdbcTemplate.update(
                """
                UPDATE incidents
                SET status = 'RESOLVED',
                    resolved_by_execution_id = ?,
                    resolved_at = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE incident_id = ?
                  AND status = 'OPEN'
                """,
                execution.executionId(),
                timestamp(execution.scheduledAt()),
                incidentId
        );
        if (changed != 1) {
            throw new IllegalStateException("open incident was not resolvable: " + incidentId);
        }
    }

    public void insertEvent(
            UUID eventId,
            UUID incidentId,
            FinalizedExecution execution,
            IncidentDecision.Transition transition
    ) {
        jdbcTemplate.update(
                """
                INSERT INTO incident_events
                    (event_id, incident_id, execution_id, event_type, occurred_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                eventId,
                incidentId,
                execution.executionId(),
                transition.name(),
                timestamp(execution.scheduledAt())
        );
    }

    public void saveState(UUID monitorId, IncidentState state, UUID openIncidentId) {
        jdbcTemplate.update(
                """
                INSERT INTO monitor_incident_state
                (
                    monitor_id, status, consecutive_down, consecutive_up,
                    last_evaluated_at, open_incident_id, opened_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (monitor_id) DO UPDATE
                SET status = EXCLUDED.status,
                    consecutive_down = EXCLUDED.consecutive_down,
                    consecutive_up = EXCLUDED.consecutive_up,
                    last_evaluated_at = EXCLUDED.last_evaluated_at,
                    open_incident_id = EXCLUDED.open_incident_id,
                    opened_at = EXCLUDED.opened_at,
                    updated_at = CURRENT_TIMESTAMP
                """,
                monitorId,
                state.status().name(),
                state.consecutiveDown(),
                state.consecutiveUp(),
                optionalTimestamp(state.lastEvaluatedAt()),
                openIncidentId,
                optionalTimestamp(state.openedAt())
        );
    }

    public void recordEvaluation(
            FinalizedExecution execution,
            IncidentDecision.Transition transition
    ) {
        jdbcTemplate.update(
                """
                INSERT INTO incident_evaluations
                    (execution_id, monitor_id, verdict, transition)
                VALUES (?, ?, ?, ?)
                """,
                execution.executionId(),
                execution.monitorId(),
                execution.verdict().name(),
                transition.name()
        );
    }

    private OffsetDateTime timestamp(Instant instant) {
        return instant.atOffset(ZoneOffset.UTC);
    }

    private OffsetDateTime optionalTimestamp(Instant instant) {
        return instant == null ? null : timestamp(instant);
    }
}

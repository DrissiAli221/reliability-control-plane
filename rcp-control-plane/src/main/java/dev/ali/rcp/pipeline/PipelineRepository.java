package dev.ali.rcp.pipeline;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

@Repository
public class PipelineRepository {
    private final JdbcTemplate jdbcTemplate;

    public PipelineRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = Objects.requireNonNull(jdbcTemplate);
    }

    public boolean ownsMonitor(String ownerSubject, UUID monitorId) {
        Boolean owned = jdbcTemplate.queryForObject(
                "SELECT EXISTS (SELECT 1 FROM monitors WHERE monitor_id = ? AND owner_subject = ?)",
                Boolean.class, monitorId, ownerSubject
        );
        return Boolean.TRUE.equals(owned);
    }

    public Optional<ExecutionTrace> findTrace(UUID monitorId, UUID executionId) {
        List<ExecutionTrace.JobTrace> jobs = jdbcTemplate.query(
                """
                SELECT jobs.job_id, jobs.probe_region, jobs.created_at,
                       outbox.published_at, outbox.attempt_count, outbox.failed_at, outbox.last_error,
                       results.started_at, results.completed_at, results.received_at, results.outcome,
                       results.http_status, results.latency_ms, results.response_bytes, results.error_type
                FROM probe_jobs jobs
                LEFT JOIN outbox_events outbox
                  ON outbox.event_type = 'PROBE_JOB_REQUESTED'
                 AND outbox.aggregate_id = jobs.job_id
                LEFT JOIN probe_results results ON results.job_id = jobs.job_id
                WHERE jobs.execution_id = ?
                ORDER BY jobs.probe_region
                """,
                (resultSet, rowNumber) -> new ExecutionTrace.JobTrace(
                        resultSet.getObject("job_id", UUID.class),
                        resultSet.getString("probe_region"),
                        instant(resultSet, "created_at"),
                        instant(resultSet, "published_at"),
                        resultSet.getInt("attempt_count"),
                        instant(resultSet, "failed_at"),
                        resultSet.getString("last_error"),
                        instant(resultSet, "started_at"),
                        instant(resultSet, "completed_at"),
                        instant(resultSet, "received_at"),
                        resultSet.getString("outcome"),
                        resultSet.getObject("http_status", Integer.class),
                        resultSet.getObject("latency_ms", Long.class),
                        resultSet.getObject("response_bytes", Long.class),
                        resultSet.getString("error_type")
                ),
                executionId
        );

        List<ExecutionTrace.Evaluation> evaluation = jdbcTemplate.query(
                "SELECT verdict, transition, evaluated_at FROM incident_evaluations WHERE execution_id = ?",
                (resultSet, rowNumber) -> new ExecutionTrace.Evaluation(
                        resultSet.getString("verdict"),
                        resultSet.getString("transition"),
                        instant(resultSet, "evaluated_at")
                ),
                executionId
        );

        return jdbcTemplate.query(
                """
                SELECT execution_id, monitor_id, scheduled_at, created_at, result_deadline_at,
                       status, verdict, finalized_at, expected_region_count
                FROM probe_executions
                WHERE execution_id = ? AND monitor_id = ?
                """,
                (resultSet, rowNumber) -> new ExecutionTrace(
                        resultSet.getObject("execution_id", UUID.class),
                        resultSet.getObject("monitor_id", UUID.class),
                        instant(resultSet, "scheduled_at"),
                        instant(resultSet, "created_at"),
                        instant(resultSet, "result_deadline_at"),
                        resultSet.getString("status"),
                        resultSet.getString("verdict"),
                        instant(resultSet, "finalized_at"),
                        resultSet.getInt("expected_region_count"),
                        jobs,
                        evaluation.stream().findFirst().orElse(null)
                ),
                executionId, monitorId
        ).stream().findFirst();
    }

    public IncidentStateView incidentState(UUID monitorId, int failuresToOpen, int successesToResolve) {
        List<IncidentStateView.Evaluation> evaluations = jdbcTemplate.query(
                """
                SELECT evaluations.execution_id, executions.scheduled_at, evaluations.verdict,
                       evaluations.transition, evaluations.evaluated_at
                FROM incident_evaluations evaluations
                JOIN probe_executions executions ON executions.execution_id = evaluations.execution_id
                WHERE evaluations.monitor_id = ?
                ORDER BY evaluations.evaluated_at DESC, executions.scheduled_at DESC
                LIMIT 8
                """,
                (resultSet, rowNumber) -> new IncidentStateView.Evaluation(
                        resultSet.getObject("execution_id", UUID.class),
                        instant(resultSet, "scheduled_at"),
                        resultSet.getString("verdict"),
                        resultSet.getString("transition"),
                        instant(resultSet, "evaluated_at")
                ),
                monitorId
        );

        // A monitor that has never been evaluated has no state row yet; that is the healthy initial state.
        return jdbcTemplate.query(
                """
                SELECT status, consecutive_down, consecutive_up, opened_at, last_evaluated_at
                FROM monitor_incident_state
                WHERE monitor_id = ?
                """,
                (resultSet, rowNumber) -> new IncidentStateView(
                        resultSet.getString("status"),
                        resultSet.getInt("consecutive_down"),
                        resultSet.getInt("consecutive_up"),
                        failuresToOpen,
                        successesToResolve,
                        instant(resultSet, "opened_at"),
                        instant(resultSet, "last_evaluated_at"),
                        evaluations
                ),
                monitorId
        ).stream().findFirst().orElse(new IncidentStateView(
                "HEALTHY", 0, 0, failuresToOpen, successesToResolve, null, null, evaluations
        ));
    }

    private static Instant instant(ResultSet resultSet, String column) throws SQLException {
        OffsetDateTime value = resultSet.getObject(column, OffsetDateTime.class);
        return value == null ? null : value.toInstant();
    }

    private static OffsetDateTime timestamp(Instant instant) {
        return instant.atOffset(ZoneOffset.UTC);
    }
}

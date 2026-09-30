package dev.ali.rcp.pipeline;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.TreeMap;
import java.util.UUID;

@Repository
public class PipelineRepository {
    private final JdbcTemplate jdbcTemplate;

    public PipelineRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = Objects.requireNonNull(jdbcTemplate);
    }

    public Instant databaseNow() {
        return Objects.requireNonNull(jdbcTemplate.queryForObject(
                "SELECT clock_timestamp()", OffsetDateTime.class
        )).toInstant();
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

    public PipelineSnapshot snapshot(String ownerSubject, Instant now, int windowSeconds) {
        OffsetDateTime since = timestamp(now.minusSeconds(windowSeconds));
        // Rows scheduled well before the window cannot have been published or received inside it,
        // so this bound lets PostgreSQL use the (monitor_id, scheduled_at) indexes.
        OffsetDateTime scheduledSince = timestamp(now.minusSeconds(windowSeconds + 900L));

        Map<String, PipelineSnapshot.RegionFlow> regions = new TreeMap<>();
        jdbcTemplate.query(
                """
                SELECT outbox.destination_region AS region, COUNT(*) AS published
                FROM monitors
                JOIN probe_executions executions ON executions.monitor_id = monitors.monitor_id
                JOIN probe_jobs jobs ON jobs.execution_id = executions.execution_id
                JOIN outbox_events outbox
                  ON outbox.event_type = 'PROBE_JOB_REQUESTED' AND outbox.aggregate_id = jobs.job_id
                WHERE monitors.owner_subject = ?
                  AND executions.scheduled_at >= ?
                  AND outbox.published_at >= ?
                GROUP BY outbox.destination_region
                """,
                resultSet -> {
                    String region = resultSet.getString("region");
                    regions.put(region, new PipelineSnapshot.RegionFlow(region, resultSet.getLong("published"), 0, null));
                },
                ownerSubject, scheduledSince, since
        );
        jdbcTemplate.query(
                """
                SELECT results.probe_region AS region,
                       COUNT(*) AS received,
                       percentile_disc(0.5) WITHIN GROUP (ORDER BY results.latency_ms)
                           FILTER (WHERE results.outcome = 'HTTP_RESPONSE') AS p50_ms
                FROM monitors
                JOIN probe_results results ON results.monitor_id = monitors.monitor_id
                WHERE monitors.owner_subject = ?
                  AND results.scheduled_at >= ?
                  AND results.received_at >= ?
                GROUP BY results.probe_region
                """,
                resultSet -> {
                    String region = resultSet.getString("region");
                    PipelineSnapshot.RegionFlow published = regions.get(region);
                    regions.put(region, new PipelineSnapshot.RegionFlow(
                            region,
                            published == null ? 0 : published.jobsPublished(),
                            resultSet.getLong("received"),
                            resultSet.getObject("p50_ms", Long.class)
                    ));
                },
                ownerSubject, scheduledSince, since
        );

        List<PipelineSnapshot.Activity> activity = jdbcTemplate.query(
                """
                SELECT monitors.monitor_id, monitors.name, latest.execution_id, latest.scheduled_at,
                       latest.verdict, latest.finalized_at, evaluations.transition
                FROM monitors
                CROSS JOIN LATERAL (
                    SELECT execution_id, scheduled_at, verdict, finalized_at
                    FROM probe_executions executions
                    WHERE executions.monitor_id = monitors.monitor_id AND executions.status = 'FINALIZED'
                    ORDER BY executions.scheduled_at DESC
                    LIMIT 15
                ) latest
                LEFT JOIN incident_evaluations evaluations ON evaluations.execution_id = latest.execution_id
                WHERE monitors.owner_subject = ?
                ORDER BY latest.scheduled_at DESC, latest.execution_id
                LIMIT 15
                """,
                (resultSet, rowNumber) -> new PipelineSnapshot.Activity(
                        resultSet.getObject("monitor_id", UUID.class),
                        resultSet.getString("name"),
                        resultSet.getObject("execution_id", UUID.class),
                        instant(resultSet, "scheduled_at"),
                        resultSet.getString("verdict"),
                        instant(resultSet, "finalized_at"),
                        resultSet.getString("transition")
                ),
                ownerSubject
        );

        return jdbcTemplate.queryForObject(
                """
                WITH owned AS (
                    SELECT monitor_id, enabled, next_check_at FROM monitors WHERE owner_subject = ?
                ),
                owned_outbox AS (
                    SELECT outbox.published_at, outbox.failed_at, outbox.created_at
                    FROM owned
                    JOIN probe_executions executions ON executions.monitor_id = owned.monitor_id
                    JOIN probe_jobs jobs ON jobs.execution_id = executions.execution_id
                    JOIN outbox_events outbox
                      ON outbox.event_type = 'PROBE_JOB_REQUESTED' AND outbox.aggregate_id = jobs.job_id
                    WHERE outbox.published_at IS NULL
                )
                SELECT
                    (SELECT COUNT(*) FROM owned WHERE enabled) AS enabled_monitors,
                    (SELECT COUNT(*) FROM owned WHERE enabled AND next_check_at <= ?) AS due_monitors,
                    (SELECT COUNT(*) FROM owned_outbox WHERE failed_at IS NULL) AS pending_outbox,
                    (SELECT COUNT(*) FROM owned_outbox WHERE failed_at IS NOT NULL) AS failed_outbox,
                    (SELECT COALESCE(EXTRACT(EPOCH FROM (? - MIN(created_at))), 0)
                       FROM owned_outbox WHERE failed_at IS NULL) AS oldest_outbox_seconds,
                    (SELECT COUNT(*) FROM owned
                       JOIN probe_executions executions ON executions.monitor_id = owned.monitor_id
                      WHERE executions.status = 'PENDING') AS pending_executions,
                    (SELECT COUNT(*) FROM owned
                       JOIN probe_executions executions ON executions.monitor_id = owned.monitor_id
                      WHERE executions.status = 'FINALIZED'
                        AND NOT EXISTS (
                            SELECT 1 FROM incident_evaluations evaluations
                            WHERE evaluations.execution_id = executions.execution_id
                        )) AS awaiting_evaluation,
                    (SELECT COUNT(*) FROM owned
                       JOIN incidents ON incidents.monitor_id = owned.monitor_id
                      WHERE incidents.status = 'OPEN') AS open_incidents
                """,
                (resultSet, rowNumber) -> new PipelineSnapshot(
                        now,
                        windowSeconds,
                        resultSet.getLong("enabled_monitors"),
                        resultSet.getLong("due_monitors"),
                        resultSet.getLong("pending_outbox"),
                        resultSet.getLong("failed_outbox"),
                        Math.max(0, Math.round(resultSet.getDouble("oldest_outbox_seconds"))),
                        resultSet.getLong("pending_executions"),
                        resultSet.getLong("awaiting_evaluation"),
                        resultSet.getLong("open_incidents"),
                        List.copyOf(regions.values()),
                        activity
                ),
                ownerSubject, timestamp(now), timestamp(now)
        );
    }

    /**
     * The newest steps of the caller's recent checks, merged into one time-ordered stream. Only executions scheduled
     * since {@code since} are considered, so the union stays on the (monitor_id, scheduled_at) index.
     */
    public List<PipelineEvent> recentEvents(String ownerSubject, Instant since, int limit) {
        return jdbcTemplate.query(
                """
                WITH recent AS (
                    SELECT executions.execution_id, executions.monitor_id, monitors.name,
                           executions.finalized_at, executions.verdict
                    FROM monitors
                    JOIN probe_executions executions ON executions.monitor_id = monitors.monitor_id
                    WHERE monitors.owner_subject = ? AND executions.scheduled_at >= ?
                )
                SELECT * FROM (
                    SELECT outbox.published_at AS at, 'OutboxPublished' AS type, recent.monitor_id, recent.name,
                           recent.execution_id, outbox.destination_region AS region, NULL AS outcome,
                           NULL::int AS http_status, NULL::bigint AS latency_ms, NULL AS detail
                    FROM recent
                    JOIN probe_jobs jobs ON jobs.execution_id = recent.execution_id
                    JOIN outbox_events outbox
                      ON outbox.event_type = 'PROBE_JOB_REQUESTED' AND outbox.aggregate_id = jobs.job_id
                    WHERE outbox.published_at IS NOT NULL
                    UNION ALL
                    SELECT results.received_at, 'ResultIngested', recent.monitor_id, recent.name, recent.execution_id,
                           results.probe_region, results.outcome, results.http_status, results.latency_ms, NULL
                    FROM recent JOIN probe_results results ON results.execution_id = recent.execution_id
                    UNION ALL
                    SELECT recent.finalized_at, 'ExecutionFinalized', recent.monitor_id, recent.name, recent.execution_id,
                           NULL, NULL, NULL, NULL, recent.verdict
                    FROM recent WHERE recent.finalized_at IS NOT NULL
                    UNION ALL
                    SELECT evaluations.evaluated_at, 'Incident' || INITCAP(evaluations.transition), recent.monitor_id,
                           recent.name, recent.execution_id, NULL, NULL, NULL, NULL, evaluations.transition
                    FROM recent JOIN incident_evaluations evaluations ON evaluations.execution_id = recent.execution_id
                    WHERE evaluations.transition IN ('OPENED', 'RESOLVED')
                ) events
                ORDER BY at DESC, type
                LIMIT ?
                """,
                (resultSet, rowNumber) -> new PipelineEvent(
                        instant(resultSet, "at"),
                        resultSet.getString("type"),
                        resultSet.getObject("monitor_id", UUID.class),
                        resultSet.getString("name"),
                        resultSet.getObject("execution_id", UUID.class),
                        resultSet.getString("region"),
                        resultSet.getString("outcome"),
                        resultSet.getObject("http_status", Integer.class),
                        resultSet.getObject("latency_ms", Long.class),
                        resultSet.getString("detail")
                ),
                ownerSubject, timestamp(since), limit
        );
    }

    /** Finalized verdicts of the caller's monitors per bucket, keyed by bucket index; the caller zero-fills. */
    public Map<Integer, FleetOverview.Bucket> verdictBuckets(String ownerSubject, Instant from, Instant to, int bucketSeconds) {
        Map<Integer, FleetOverview.Bucket> buckets = new TreeMap<>();
        jdbcTemplate.query(
                """
                SELECT FLOOR(EXTRACT(EPOCH FROM (executions.scheduled_at - ?)) / ?)::int AS bucket,
                       COUNT(*) FILTER (WHERE executions.verdict = 'UP') AS up,
                       COUNT(*) FILTER (WHERE executions.verdict = 'DOWN') AS down,
                       COUNT(*) FILTER (WHERE executions.verdict = 'DISAGREEMENT') AS disagreement,
                       COUNT(*) FILTER (WHERE executions.verdict = 'NO_DATA') AS no_data
                FROM monitors
                JOIN probe_executions executions ON executions.monitor_id = monitors.monitor_id
                WHERE monitors.owner_subject = ?
                  AND executions.status = 'FINALIZED'
                  AND executions.scheduled_at >= ? AND executions.scheduled_at < ?
                GROUP BY 1
                """,
                resultSet -> {
                    buckets.put(resultSet.getInt("bucket"), new FleetOverview.Bucket(
                            resultSet.getLong("up"),
                            resultSet.getLong("down"),
                            resultSet.getLong("disagreement"),
                            resultSet.getLong("no_data")
                    ));
                },
                timestamp(from), bucketSeconds, ownerSubject, timestamp(from), timestamp(to)
        );
        return buckets;
    }

    /** Incidents of the caller's monitors that overlap [since, now]: still open, or resolved after {@code since}. */
    public List<FleetOverview.IncidentSpan> incidentSpans(String ownerSubject, Instant since, int limit) {
        return jdbcTemplate.query(
                """
                SELECT incidents.incident_id, incidents.monitor_id, monitors.name, incidents.opened_at, incidents.resolved_at
                FROM monitors
                JOIN incidents ON incidents.monitor_id = monitors.monitor_id
                WHERE monitors.owner_subject = ?
                  AND (incidents.status = 'OPEN' OR incidents.resolved_at >= ?)
                ORDER BY incidents.opened_at DESC
                LIMIT ?
                """,
                (resultSet, rowNumber) -> new FleetOverview.IncidentSpan(
                        resultSet.getObject("incident_id", UUID.class),
                        resultSet.getObject("monitor_id", UUID.class),
                        resultSet.getString("name"),
                        instant(resultSet, "opened_at"),
                        instant(resultSet, "resolved_at")
                ),
                ownerSubject, timestamp(since), limit
        );
    }

    private static Instant instant(ResultSet resultSet, String column) throws SQLException {
        OffsetDateTime value = resultSet.getObject(column, OffsetDateTime.class);
        return value == null ? null : value.toInstant();
    }

    private static OffsetDateTime timestamp(Instant instant) {
        return instant.atOffset(ZoneOffset.UTC);
    }
}

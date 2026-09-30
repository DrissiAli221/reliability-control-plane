package dev.ali.rcp.monitors;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

@Repository
public class MonitorHistoryRepository {
    private final JdbcTemplate jdbcTemplate;

    public MonitorHistoryRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = Objects.requireNonNull(jdbcTemplate);
    }

    public Instant databaseNow() {
        return Objects.requireNonNull(jdbcTemplate.queryForObject(
                "SELECT clock_timestamp()", OffsetDateTime.class
        )).toInstant();
    }

    /**
     * One zero-filled row per monitor and UTC day in [firstDay, lastDay], counting finalized verdicts
     * by scheduled time. A single query serves every monitor, so a status page costs one round trip.
     */
    public Map<UUID, List<DailyEvidence>> dailyEvidence(List<UUID> monitorIds, LocalDate firstDay, LocalDate lastDay) {
        if (monitorIds.isEmpty()) {
            return Map.of();
        }
        String placeholders = String.join(",", Collections.nCopies(monitorIds.size(), "?"));
        List<Object> parameters = new ArrayList<>(monitorIds);
        parameters.add(firstDay);
        parameters.add(lastDay);

        Map<UUID, List<DailyEvidence>> byMonitor = new HashMap<>();
        jdbcTemplate.query(
                """
                SELECT ids.monitor_id,
                       days.day::date AS day,
                       COUNT(*) FILTER (WHERE executions.verdict = 'UP') AS up,
                       COUNT(*) FILTER (WHERE executions.verdict = 'DOWN') AS down,
                       COUNT(*) FILTER (WHERE executions.verdict = 'DISAGREEMENT') AS disagreement,
                       COUNT(*) FILTER (WHERE executions.verdict = 'NO_DATA') AS no_data
                FROM unnest(ARRAY[%s]::uuid[]) AS ids(monitor_id)
                CROSS JOIN generate_series(?::date, ?::date, INTERVAL '1 day') AS days(day)
                LEFT JOIN probe_executions executions
                  ON executions.monitor_id = ids.monitor_id
                 AND executions.status = 'FINALIZED'
                 AND executions.scheduled_at >= days.day AT TIME ZONE 'UTC'
                 AND executions.scheduled_at < (days.day + INTERVAL '1 day') AT TIME ZONE 'UTC'
                GROUP BY ids.monitor_id, days.day
                ORDER BY ids.monitor_id, days.day
                """.formatted(placeholders),
                resultSet -> {
                    byMonitor.computeIfAbsent(resultSet.getObject("monitor_id", UUID.class), id -> new ArrayList<>())
                            .add(DailyEvidence.of(
                                    resultSet.getObject("day", LocalDate.class),
                                    resultSet.getLong("up"),
                                    resultSet.getLong("down"),
                                    resultSet.getLong("disagreement"),
                                    resultSet.getLong("no_data")
                            ));
                },
                parameters.toArray()
        );
        return byMonitor;
    }

    public List<MonitorHistory.RegionSummary> regionSummaries(UUID monitorId, Instant since) {
        Map<String, MonitorHistory.RegionSummary> latestByRegion = new LinkedHashMap<>();
        jdbcTemplate.query(
                """
                SELECT DISTINCT ON (probe_region)
                       probe_region, outcome, http_status, latency_ms, completed_at
                FROM probe_results
                WHERE monitor_id = ? AND scheduled_at >= ?
                ORDER BY probe_region, scheduled_at DESC
                """,
                resultSet -> {
                    String region = resultSet.getString("probe_region");
                    latestByRegion.put(region, new MonitorHistory.RegionSummary(
                            region, 0, null, null,
                            resultSet.getString("outcome"),
                            resultSet.getObject("http_status", Integer.class),
                            resultSet.getLong("latency_ms"),
                            resultSet.getObject("completed_at", OffsetDateTime.class).toInstant()
                    ));
                },
                monitorId, timestamp(since)
        );

        jdbcTemplate.query(
                """
                SELECT probe_region,
                       COUNT(*) AS http_samples,
                       percentile_disc(0.5) WITHIN GROUP (ORDER BY latency_ms) AS p50_ms,
                       percentile_disc(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95_ms
                FROM probe_results
                WHERE monitor_id = ? AND scheduled_at >= ? AND outcome = 'HTTP_RESPONSE'
                GROUP BY probe_region
                """,
                resultSet -> {
                    String region = resultSet.getString("probe_region");
                    MonitorHistory.RegionSummary latest = latestByRegion.get(region);
                    latestByRegion.put(region, new MonitorHistory.RegionSummary(
                            region,
                            resultSet.getLong("http_samples"),
                            resultSet.getObject("p50_ms", Long.class),
                            resultSet.getObject("p95_ms", Long.class),
                            latest.lastOutcome(),
                            latest.lastHttpStatus(),
                            latest.lastLatencyMs(),
                            latest.lastCompletedAt()
                    ));
                },
                monitorId, timestamp(since)
        );
        return List.copyOf(latestByRegion.values());
    }

    public List<MonitorHistory.RecentCheck> recentChecks(UUID monitorId, int limit) {
        Map<UUID, MonitorHistory.RecentCheck> checks = new LinkedHashMap<>();
        jdbcTemplate.query(
                """
                SELECT executions.execution_id, executions.scheduled_at, executions.verdict,
                       results.probe_region, results.outcome, results.http_status, results.latency_ms
                FROM (
                    SELECT execution_id, scheduled_at, verdict
                    FROM probe_executions
                    WHERE monitor_id = ? AND status = 'FINALIZED'
                    ORDER BY scheduled_at DESC
                    LIMIT ?
                ) executions
                LEFT JOIN probe_results results ON results.execution_id = executions.execution_id
                ORDER BY executions.scheduled_at DESC, results.probe_region
                """,
                resultSet -> {
                    UUID executionId = resultSet.getObject("execution_id", UUID.class);
                    Instant scheduledAt = resultSet.getObject("scheduled_at", OffsetDateTime.class).toInstant();
                    String verdict = resultSet.getString("verdict");
                    MonitorHistory.RecentCheck check = checks.computeIfAbsent(executionId,
                            id -> new MonitorHistory.RecentCheck(id, scheduledAt, verdict, new ArrayList<>()));
                    String region = resultSet.getString("probe_region");
                    if (region != null) {
                        check.results().add(new MonitorHistory.RegionResult(
                                region,
                                resultSet.getString("outcome"),
                                resultSet.getObject("http_status", Integer.class),
                                resultSet.getLong("latency_ms")
                        ));
                    }
                },
                monitorId, limit
        );
        return checks.values().stream()
                .map(check -> new MonitorHistory.RecentCheck(
                        check.executionId(), check.scheduledAt(), check.verdict(), List.copyOf(check.results())))
                .toList();
    }

    /**
     * Counts HTTP responses by region, time column and latency band in one grouped query; the caller zero-fills.
     * The band index comes from PostgreSQL's width_bucket over the bounds.
     */
    public List<LatencyCell> latencyCells(UUID monitorId, Instant from, Instant to, int bucketSeconds, List<Long> boundsMs) {
        String bounds = String.join(",", boundsMs.stream().map(String::valueOf).toList());
        return jdbcTemplate.query(
                """
                SELECT probe_region,
                       FLOOR(EXTRACT(EPOCH FROM (scheduled_at - ?)) / ?)::int AS column_index,
                       width_bucket(latency_ms, ARRAY[%s]::bigint[]) AS band,
                       COUNT(*) AS samples
                FROM probe_results
                WHERE monitor_id = ? AND scheduled_at >= ? AND scheduled_at < ? AND outcome = 'HTTP_RESPONSE'
                GROUP BY 1, 2, 3
                """.formatted(bounds),
                (resultSet, rowNumber) -> new LatencyCell(
                        resultSet.getString("probe_region"),
                        resultSet.getInt("column_index"),
                        resultSet.getInt("band"),
                        resultSet.getLong("samples")
                ),
                timestamp(from), bucketSeconds, monitorId, timestamp(from), timestamp(to)
        );
    }

    public record LatencyCell(String region, int column, int band, long samples) {
    }

    private OffsetDateTime timestamp(Instant instant) {
        return instant.atOffset(ZoneOffset.UTC);
    }
}

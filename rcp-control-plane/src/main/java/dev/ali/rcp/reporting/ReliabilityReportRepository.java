package dev.ali.rcp.reporting;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

@Repository
public class ReliabilityReportRepository {
    private final JdbcTemplate jdbcTemplate;

    public ReliabilityReportRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = Objects.requireNonNull(jdbcTemplate);
    }

    public MonitorLabel monitorLabel(UUID monitorId, String ownerSubject) {
        return jdbcTemplate.queryForObject(
                "SELECT name, target_url FROM monitors WHERE monitor_id = ? AND owner_subject = ? AND deleted_at IS NULL",
                (resultSet, rowNumber) -> new MonitorLabel(
                        resultSet.getString("name"),
                        resultSet.getString("target_url")
                ),
                monitorId,
                ownerSubject
        );
    }

    public Instant databaseNow() {
        return Objects.requireNonNull(jdbcTemplate.queryForObject(
                "SELECT CURRENT_TIMESTAMP",
                OffsetDateTime.class
        )).toInstant();
    }

    public Instant sourceDataWatermark(UUID monitorId, Instant from, Instant to) {
        OffsetDateTime watermark = jdbcTemplate.queryForObject(
                """
                SELECT GREATEST(
                    (SELECT MAX(finalized_at) FROM probe_executions
                     WHERE monitor_id = ? AND scheduled_at >= ? AND scheduled_at < ?),
                    (SELECT MAX(received_at) FROM probe_results
                     WHERE monitor_id = ? AND scheduled_at >= ? AND scheduled_at < ?),
                    (SELECT MAX(events.created_at)
                     FROM incident_events events
                     JOIN incidents incidents ON incidents.incident_id = events.incident_id
                     WHERE incidents.monitor_id = ?
                       AND events.occurred_at >= ? AND events.occurred_at < ?)
                )
                """,
                OffsetDateTime.class,
                monitorId, timestamp(from), timestamp(to),
                monitorId, timestamp(from), timestamp(to),
                monitorId, timestamp(from), timestamp(to)
        );
        return watermark == null ? null : watermark.toInstant();
    }

    public List<ReportIncidentEvent> incidentTimeline(UUID monitorId, Instant from, Instant to) {
        return jdbcTemplate.query(
                """
                SELECT events.incident_id, events.event_type, events.occurred_at
                FROM incident_events events
                JOIN incidents incidents ON incidents.incident_id = events.incident_id
                WHERE incidents.monitor_id = ?
                  AND events.occurred_at >= ? AND events.occurred_at < ?
                ORDER BY events.occurred_at, events.event_id
                """,
                (resultSet, rowNumber) -> new ReportIncidentEvent(
                        resultSet.getObject("incident_id", UUID.class),
                        resultSet.getString("event_type"),
                        resultSet.getObject("occurred_at", OffsetDateTime.class).toInstant()
                ),
                monitorId,
                timestamp(from),
                timestamp(to)
        );
    }

    public LatencySamples latencySamples(UUID monitorId, Instant from, Instant to) {
        return jdbcTemplate.queryForObject(
                """
                SELECT COUNT(*) AS sample_count,
                       percentile_disc(0.5) WITHIN GROUP (ORDER BY latency_ms) AS p50_ms,
                       percentile_disc(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95_ms
                FROM probe_results
                WHERE monitor_id = ?
                  AND scheduled_at >= ? AND scheduled_at < ?
                  AND outcome = 'HTTP_RESPONSE'
                  AND bot_protection IS NULL
                """,
                (resultSet, rowNumber) -> new LatencySamples(
                        resultSet.getLong("sample_count"),
                        resultSet.getObject("p50_ms", Long.class),
                        resultSet.getObject("p95_ms", Long.class)
                ),
                monitorId,
                timestamp(from),
                timestamp(to)
        );
    }

    private OffsetDateTime timestamp(Instant instant) {
        return instant.atOffset(ZoneOffset.UTC);
    }

    public record MonitorLabel(String name, String targetUrl) {
    }

    public record LatencySamples(long sampleCount, Long p50Ms, Long p95Ms) {
    }
}

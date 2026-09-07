package dev.ali.rcp.monitors;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

@Repository
public class MonitorReadRepository {
    private final JdbcTemplate jdbcTemplate;

    public MonitorReadRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = Objects.requireNonNull(jdbcTemplate);
    }

    public List<MonitorOverview> findAllForOwner(String ownerSubject) {
        return jdbcTemplate.query(
                """
                SELECT
                    monitors.monitor_id,
                    monitors.name,
                    monitors.target_url,
                    monitors.enabled,
                    monitors.next_check_at,
                    COALESCE(incident_state.status, 'HEALTHY') AS incident_status,
                    latest.verdict AS latest_verdict,
                    latest.scheduled_at AS latest_checked_at
                FROM monitors
                LEFT JOIN monitor_incident_state incident_state
                  ON incident_state.monitor_id = monitors.monitor_id
                LEFT JOIN LATERAL (
                    SELECT verdict, scheduled_at
                    FROM probe_executions executions
                    WHERE executions.monitor_id = monitors.monitor_id
                      AND executions.status = 'FINALIZED'
                    ORDER BY scheduled_at DESC, execution_id DESC
                    LIMIT 1
                ) latest ON TRUE
                WHERE monitors.owner_subject = ?
                ORDER BY monitors.name, monitors.monitor_id
                """,
                (resultSet, rowNumber) -> new MonitorOverview(
                        resultSet.getObject("monitor_id", UUID.class),
                        resultSet.getString("name"),
                        resultSet.getString("target_url"),
                        resultSet.getBoolean("enabled"),
                        instant(resultSet.getObject("next_check_at", OffsetDateTime.class)),
                        resultSet.getString("incident_status"),
                        resultSet.getString("latest_verdict"),
                        instant(resultSet.getObject("latest_checked_at", OffsetDateTime.class))
                ),
                ownerSubject
        );
    }

    private java.time.Instant instant(OffsetDateTime value) {
        return value == null ? null : value.toInstant();
    }
}

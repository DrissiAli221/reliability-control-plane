package dev.ali.rcp.statuspage;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

@Repository
public class StatusPageRepository {
    private final JdbcTemplate jdbcTemplate;

    public StatusPageRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = Objects.requireNonNull(jdbcTemplate);
    }

    public int countOwnedMonitors(String ownerSubject, List<UUID> monitorIds) {
        String placeholders = String.join(",", java.util.Collections.nCopies(monitorIds.size(), "?"));
        Object[] parameters = new Object[monitorIds.size() + 1];
        parameters[0] = ownerSubject;
        for (int index = 0; index < monitorIds.size(); index++) {
            parameters[index + 1] = monitorIds.get(index);
        }
        List<UUID> owned = jdbcTemplate.queryForList(
                "SELECT monitor_id FROM monitors WHERE owner_subject = ? AND deleted_at IS NULL AND monitor_id IN (" + placeholders + ") ORDER BY monitor_id FOR SHARE",
                UUID.class,
                parameters
        );
        return owned.size();
    }

    public void insertPage(UUID pageId, String ownerSubject, String name, String slug, boolean published) {
        jdbcTemplate.update(
                """
                INSERT INTO status_pages (page_id, owner_subject, name, slug, published)
                VALUES (?, ?, ?, ?, ?)
                """,
                pageId, ownerSubject, name, slug, published
        );
    }

    public void insertMonitor(UUID pageId, UUID monitorId, int sortOrder) {
        jdbcTemplate.update(
                """
                INSERT INTO status_page_monitors (page_id, monitor_id, sort_order)
                VALUES (?, ?, ?)
                """,
                pageId, monitorId, sortOrder
        );
    }

    public Optional<StoredStatusPage> findPublishedPage(String slug) {
        return jdbcTemplate.query(
                """
                SELECT page_id, name, slug
                FROM status_pages
                WHERE slug = ? AND published = TRUE
                """,
                (resultSet, rowNumber) -> new StoredStatusPage(
                        resultSet.getObject("page_id", UUID.class),
                        resultSet.getString("name"),
                        resultSet.getString("slug")
                ),
                slug
        ).stream().findFirst();
    }

    public Instant databaseNow() {
        return Objects.requireNonNull(jdbcTemplate.queryForObject(
                "SELECT clock_timestamp()", OffsetDateTime.class
        )).toInstant();
    }

    public List<StatusComponentSnapshot> findComponentSnapshots(UUID pageId, Instant asOf) {
        return jdbcTemplate.query(
                """
                SELECT
                    monitors.monitor_id,
                    monitors.name,
                    monitors.enabled,
                    monitors.check_interval_seconds,
                    monitors.timeout_ms,
                    monitors.behavior_version,
                    COALESCE(incident_state.status, 'HEALTHY') AS incident_status,
                    latest.verdict AS latest_verdict,
                    latest.scheduled_at AS latest_checked_at,
                    latest.monitor_behavior_version AS result_behavior_version
                FROM status_page_monitors membership
                JOIN monitors ON monitors.monitor_id = membership.monitor_id
                LEFT JOIN monitor_incident_state incident_state
                  ON incident_state.monitor_id = monitors.monitor_id
                LEFT JOIN LATERAL (
                    SELECT verdict, scheduled_at, monitor_behavior_version
                    FROM probe_executions executions
                    WHERE executions.monitor_id = monitors.monitor_id
                      AND executions.status = 'FINALIZED'
                    ORDER BY scheduled_at DESC, execution_id DESC
                    LIMIT 1
                ) latest ON TRUE
                WHERE membership.page_id = ? AND monitors.deleted_at IS NULL
                ORDER BY membership.sort_order
                """,
                (resultSet, rowNumber) -> {
                    String incidentStatus = resultSet.getString("incident_status");
                    String latestVerdict = resultSet.getString("latest_verdict");
                    OffsetDateTime checkedAt = resultSet.getObject("latest_checked_at", OffsetDateTime.class);
                    Instant latestScheduledAt = checkedAt == null ? null : checkedAt.toInstant();
                    return new StatusComponentSnapshot(
                            resultSet.getObject("monitor_id", UUID.class),
                            resultSet.getString("name"),
                            StatusPageHealthPolicy.componentStatus(
                                    resultSet.getBoolean("enabled"), incidentStatus, latestVerdict,
                                    latestScheduledAt,
                                    resultSet.getLong("behavior_version"),
                                    resultSet.getObject("result_behavior_version", Long.class),
                                    resultSet.getInt("check_interval_seconds"),
                                    resultSet.getInt("timeout_ms"), asOf
                            ),
                            latestVerdict,
                            latestScheduledAt
                    );
                },
                pageId
        );
    }

}

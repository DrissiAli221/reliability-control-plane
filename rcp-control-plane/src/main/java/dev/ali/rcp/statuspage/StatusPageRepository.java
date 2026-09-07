package dev.ali.rcp.statuspage;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

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
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM monitors WHERE owner_subject = ? AND monitor_id IN (" + placeholders + ")",
                Integer.class,
                parameters
        );
        return count == null ? 0 : count;
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

    public List<PublicStatusComponent> findPublicComponents(UUID pageId) {
        return jdbcTemplate.query(
                """
                SELECT
                    monitors.name,
                    COALESCE(incident_state.status, 'HEALTHY') AS incident_status,
                    latest.verdict AS latest_verdict,
                    latest.scheduled_at AS latest_checked_at
                FROM status_page_monitors membership
                JOIN monitors ON monitors.monitor_id = membership.monitor_id
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
                WHERE membership.page_id = ?
                ORDER BY membership.sort_order
                """,
                (resultSet, rowNumber) -> {
                    String incidentStatus = resultSet.getString("incident_status");
                    String latestVerdict = resultSet.getString("latest_verdict");
                    OffsetDateTime checkedAt = resultSet.getObject("latest_checked_at", OffsetDateTime.class);
                    return new PublicStatusComponent(
                            resultSet.getString("name"),
                            componentStatus(incidentStatus, latestVerdict),
                            latestVerdict,
                            checkedAt == null ? null : checkedAt.toInstant()
                    );
                },
                pageId
        );
    }

    private String componentStatus(String incidentStatus, String latestVerdict) {
        if ("OPEN".equals(incidentStatus)) {
            return "OUTAGE";
        }
        if (latestVerdict == null || "DISAGREEMENT".equals(latestVerdict) || "NO_DATA".equals(latestVerdict)) {
            return "UNKNOWN";
        }
        if ("DOWN".equals(latestVerdict)) {
            return "DEGRADED";
        }
        return "OPERATIONAL";
    }
}

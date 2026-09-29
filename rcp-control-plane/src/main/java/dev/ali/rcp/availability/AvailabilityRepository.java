package dev.ali.rcp.availability;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

@Repository
public class AvailabilityRepository {
    private final JdbcTemplate jdbcTemplate;

    public AvailabilityRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = Objects.requireNonNull(jdbcTemplate);
    }

    public boolean ownerHasMonitor(String ownerSubject, UUID monitorId) {
        Integer count = jdbcTemplate.queryForObject(
                """
                SELECT COUNT(*)
                FROM monitors
                WHERE monitor_id = ?
                  AND owner_subject = ?
                """,
                Integer.class,
                monitorId,
                ownerSubject
        );
        return count != null && count == 1;
    }

    public List<MonitorSchedule> schedules(UUID monitorId) {
        return jdbcTemplate.query(
                """
                SELECT first_check_at, stopped_at, interval_seconds
                FROM monitor_schedule_periods
                WHERE monitor_id = ?
                ORDER BY first_check_at, period_id
                """,
                (resultSet, rowNumber) -> {
                    OffsetDateTime stopped = resultSet.getObject("stopped_at", OffsetDateTime.class);
                    return new MonitorSchedule(
                            resultSet.getObject("first_check_at", OffsetDateTime.class).toInstant(),
                            stopped == null ? null : stopped.toInstant(),
                            resultSet.getInt("interval_seconds")
                    );
                },
                monitorId
        );
    }

    public Instant databaseNow() {
        return Objects.requireNonNull(jdbcTemplate.queryForObject(
                "SELECT CURRENT_TIMESTAMP", OffsetDateTime.class
        )).toInstant();
    }

    public VerdictCounts countExecutionVerdicts(UUID monitorId, Instant from, Instant to) {
        return jdbcTemplate.queryForObject(
                """
                SELECT
                    COUNT(*) FILTER (WHERE verdict = 'UP') AS up_count,
                    COUNT(*) FILTER (WHERE verdict = 'DOWN') AS down_count,
                    COUNT(*) FILTER (WHERE verdict = 'DISAGREEMENT') AS disagreement_count,
                    COUNT(*) FILTER (WHERE verdict = 'NO_DATA') AS no_data_count,
                    COUNT(*) FILTER (WHERE status = 'PENDING') AS pending_count
                FROM probe_executions
                WHERE monitor_id = ?
                  AND scheduled_at >= ?
                  AND scheduled_at < ?
                """,
                (resultSet, rowNumber) -> new VerdictCounts(
                        resultSet.getLong("up_count"),
                        resultSet.getLong("down_count"),
                        resultSet.getLong("disagreement_count"),
                        resultSet.getLong("no_data_count"),
                        resultSet.getLong("pending_count")
                ),
                monitorId,
                timestamp(from),
                timestamp(to)
        );
    }

    private OffsetDateTime timestamp(Instant instant) {
        return instant.atOffset(ZoneOffset.UTC);
    }
}

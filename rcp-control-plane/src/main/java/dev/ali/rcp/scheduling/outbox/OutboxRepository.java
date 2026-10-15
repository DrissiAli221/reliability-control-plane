package dev.ali.rcp.scheduling.outbox;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.time.Duration;
import java.util.List;
import java.util.UUID;

@Repository
public class OutboxRepository {

    private final JdbcTemplate jdbcTemplate;

    public OutboxRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public List<ClaimedOutboxEvent> claimReadyEvents(
            String publisherId,
            int batchSize,
            Duration leaseDuration
    ) {
        if (publisherId == null || publisherId.isBlank()) {
            throw new IllegalArgumentException(
                    "publisherId must not be blank"
            );
        }
        if (batchSize < 1) {
            throw new IllegalArgumentException(
                    "batchSize must be positive"
            );
        }
        if (leaseDuration.isZero() || leaseDuration.isNegative()) {
            throw new IllegalArgumentException(
                    "leaseDuration must be positive"
            );
        }

        return jdbcTemplate.query(
                """
                WITH candidates AS
                (
                    SELECT event_id
                    FROM outbox_events
                    WHERE published_at IS NULL
                      AND failed_at IS NULL
                      AND NOT EXISTS (SELECT 1 FROM monitors m WHERE m.deleted_at IS NOT NULL
                                      AND m.monitor_id::text = outbox_events.payload->>'monitorId')
                      AND next_attempt_at <= CURRENT_TIMESTAMP
                      AND
                      (
                          claimed_until IS NULL
                              OR claimed_until <= CURRENT_TIMESTAMP
                      )
                    ORDER BY next_attempt_at, created_at, event_id
                    LIMIT ?
                    FOR UPDATE SKIP LOCKED
                )
                UPDATE outbox_events AS events
                SET claimed_by = ?,
                    claimed_until = CURRENT_TIMESTAMP
                        + (? * INTERVAL '1 millisecond')
                FROM candidates
                WHERE events.event_id = candidates.event_id
                RETURNING
                    events.event_id,
                    events.event_type,
                    events.destination_region,
                    events.payload::TEXT,
                    events.attempt_count
                """,
                (resultSet, rowNumber) -> new ClaimedOutboxEvent(
                        resultSet.getObject("event_id", UUID.class),
                        resultSet.getString("event_type"),
                        resultSet.getString("destination_region"),
                        resultSet.getString("payload"),
                        resultSet.getInt("attempt_count")
                ),
                batchSize,
                publisherId,
                leaseDuration.toMillis()
        );
    }

    public boolean markPublished(
            UUID eventId,
            String publisherId
    ) {
        int changedRows = jdbcTemplate.update(
                """
                UPDATE outbox_events
                SET published_at = CURRENT_TIMESTAMP,
                    claimed_by = NULL,
                    claimed_until = NULL,
                    last_error = NULL
                WHERE event_id = ?
                  AND claimed_by = ?
                  AND claimed_until > CURRENT_TIMESTAMP
                  AND published_at IS NULL
                  AND failed_at IS NULL
                      AND NOT EXISTS (SELECT 1 FROM monitors m WHERE m.deleted_at IS NOT NULL
                                      AND m.monitor_id::text = outbox_events.payload->>'monitorId')
                """,
                eventId,
                publisherId
        );

        return changedRows == 1;
    }

    public boolean recordFailedAttempt(
            UUID eventId,
            String publisherId,
            int maxAttempts,
            Duration retryDelay,
            String error
    ) {
        int changedRows = jdbcTemplate.update(
                """
                UPDATE outbox_events
                SET attempt_count = attempt_count + 1,
                    next_attempt_at = CASE
                        WHEN attempt_count + 1 >= ?
                            THEN next_attempt_at
                        ELSE CURRENT_TIMESTAMP
                            + (? * INTERVAL '1 millisecond')
                    END,
                    failed_at = CASE
                        WHEN attempt_count + 1 >= ?
                            THEN CURRENT_TIMESTAMP
                        ELSE NULL
                    END,
                    claimed_by = NULL,
                    claimed_until = NULL,
                    last_error = ?
                WHERE event_id = ?
                  AND claimed_by = ?
                  AND claimed_until > CURRENT_TIMESTAMP
                  AND published_at IS NULL
                  AND failed_at IS NULL
                      AND NOT EXISTS (SELECT 1 FROM monitors m WHERE m.deleted_at IS NOT NULL
                                      AND m.monitor_id::text = outbox_events.payload->>'monitorId')
                """,
                maxAttempts,
                retryDelay.toMillis(),
                maxAttempts,
                error,
                eventId,
                publisherId
        );

        return changedRows == 1;
    }
}

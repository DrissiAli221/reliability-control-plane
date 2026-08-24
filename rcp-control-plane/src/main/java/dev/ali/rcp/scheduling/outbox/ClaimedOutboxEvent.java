package dev.ali.rcp.scheduling.outbox;

import java.util.UUID;

public record ClaimedOutboxEvent(
        UUID eventId,
        String eventType,
        String destinationRegion,
        String payload,
        int previousAttemptCount
) {
}

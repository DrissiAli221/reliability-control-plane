package dev.ali.rcp.incidents;

import java.time.Instant;
import java.util.Objects;

public record IncidentState(
        Status status,
        int consecutiveDown,
        int consecutiveUp,
        Instant lastEvaluatedAt,
        Instant openedAt
) {

    public IncidentState {
        Objects.requireNonNull(status, "status must not be null");

        if (consecutiveDown < 0 || consecutiveUp < 0) {
            throw new IllegalArgumentException(
                    "Consecutive counters cannot be negative"
            );
        }

        if (status == Status.HEALTHY && openedAt != null) {
            throw new IllegalArgumentException(
                    "A healthy state cannot have an open incident time"
            );
        }

        if (status == Status.OPEN && openedAt == null) {
            throw new IllegalArgumentException(
                    "An open incident must have an opening time"
            );
        }

        if (openedAt != null
                && lastEvaluatedAt != null
                && openedAt.isAfter(lastEvaluatedAt)) {
            throw new IllegalArgumentException(
                    "Incident cannot open after the latest evaluation"
            );
        }
    }

    public static IncidentState healthy() {
        return new IncidentState(
                Status.HEALTHY,
                0,
                0,
                null,
                null
        );
    }

    public boolean isOpen() {
        return status == Status.OPEN;
    }

    public enum Status {
        HEALTHY,
        OPEN
    }
}
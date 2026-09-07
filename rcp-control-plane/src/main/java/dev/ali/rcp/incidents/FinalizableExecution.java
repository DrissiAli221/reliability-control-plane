package dev.ali.rcp.incidents;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

public record FinalizableExecution(
        UUID executionId,
        UUID monitorId,
        Instant scheduledAt,
        Instant resultDeadlineAt,
        int expectedRegionCount
) {
    public FinalizableExecution {
        Objects.requireNonNull(executionId, "executionId must not be null");
        Objects.requireNonNull(monitorId, "monitorId must not be null");
        Objects.requireNonNull(scheduledAt, "scheduledAt must not be null");
        Objects.requireNonNull(resultDeadlineAt, "resultDeadlineAt must not be null");
        if (expectedRegionCount < 1) {
            throw new IllegalArgumentException("expectedRegionCount must be positive");
        }
    }
}

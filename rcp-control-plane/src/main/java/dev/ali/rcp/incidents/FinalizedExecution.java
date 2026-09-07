package dev.ali.rcp.incidents;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

public record FinalizedExecution(
        UUID executionId,
        UUID monitorId,
        Instant scheduledAt,
        ExecutionVerdict verdict
) {
    public FinalizedExecution {
        Objects.requireNonNull(executionId, "executionId must not be null");
        Objects.requireNonNull(monitorId, "monitorId must not be null");
        Objects.requireNonNull(scheduledAt, "scheduledAt must not be null");
        Objects.requireNonNull(verdict, "verdict must not be null");
    }
}

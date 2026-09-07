package dev.ali.rcp.probes;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

public record ProbeResult(
        UUID jobId,
        UUID executionId,
        UUID monitorId,
        String probeRegion,
        Instant scheduledAt,
        Instant startedAt,
        Instant completedAt,
        ProbeOutcome outcome,
        Integer httpStatus,
        long latencyMillis,
        long responseBytes,
        String errorType,
        int monitorBehaviorVersion
) {
    public ProbeResult {
        Objects.requireNonNull(jobId, "jobId must not be null");
        Objects.requireNonNull(executionId, "executionId must not be null");
        Objects.requireNonNull(monitorId, "monitorId must not be null");
        Objects.requireNonNull(probeRegion, "probeRegion must not be null");
        Objects.requireNonNull(scheduledAt, "scheduledAt must not be null");
        Objects.requireNonNull(startedAt, "startedAt must not be null");
        Objects.requireNonNull(completedAt, "completedAt must not be null");
        Objects.requireNonNull(outcome, "outcome must not be null");

        if (completedAt.isBefore(startedAt)) {
            throw new IllegalArgumentException("completedAt must not be before startedAt");
        }
        if (latencyMillis < 0 || responseBytes < 0) {
            throw new IllegalArgumentException("measurements must not be negative");
        }
        if (outcome == ProbeOutcome.HTTP_RESPONSE && httpStatus == null) {
            throw new IllegalArgumentException("an HTTP response requires a status code");
        }
        if (outcome != ProbeOutcome.HTTP_RESPONSE && httpStatus != null) {
            throw new IllegalArgumentException("only an HTTP response may have a status code");
        }
    }
}

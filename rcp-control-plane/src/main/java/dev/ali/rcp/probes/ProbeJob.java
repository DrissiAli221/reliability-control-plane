package dev.ali.rcp.probes;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

public record ProbeJob(
        UUID jobId,
        UUID executionId,
        UUID monitorId,
        Instant scheduledAt,
        Instant resultDeadlineAt,
        String targetUrl,
        int timeoutMillis,
        String probeRegion,
        int monitorBehaviorVersion
) {
    public ProbeJob {
        Objects.requireNonNull(jobId, "jobId must not be null");
        Objects.requireNonNull(executionId, "executionId must not be null");
        Objects.requireNonNull(monitorId, "monitorId must not be null");
        Objects.requireNonNull(scheduledAt, "scheduledAt must not be null");
        Objects.requireNonNull(resultDeadlineAt, "resultDeadlineAt must not be null");
        Objects.requireNonNull(targetUrl, "targetUrl must not be null");
        Objects.requireNonNull(probeRegion, "probeRegion must not be null");

        if (targetUrl.isBlank()) {
            throw new IllegalArgumentException("targetUrl must not be blank");
        }
        if (probeRegion.isBlank()) {
            throw new IllegalArgumentException("probeRegion must not be blank");
        }
        if (timeoutMillis <= 0) {
            throw new IllegalArgumentException("timeoutMillis must be positive");
        }
        if (!resultDeadlineAt.isAfter(scheduledAt)) {
            throw new IllegalArgumentException("resultDeadlineAt must be after scheduledAt");
        }
        if (monitorBehaviorVersion <= 0) {
            throw new IllegalArgumentException("monitorBehaviorVersion must be positive");
        }
    }
}

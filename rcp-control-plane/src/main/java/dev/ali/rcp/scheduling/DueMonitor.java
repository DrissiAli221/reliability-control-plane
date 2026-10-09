package dev.ali.rcp.scheduling;

import java.time.Instant;
import java.util.UUID;

public record DueMonitor(
        UUID monitorId,
        String targetUrl,
        int checkIntervalSeconds,
        int timeoutMs,
        long behaviorVersion,
        Instant scheduledAt,
        java.util.List<Integer> acceptedHttpStatuses
) {
    public DueMonitor(UUID monitorId, String targetUrl, int checkIntervalSeconds, int timeoutMs, long behaviorVersion, Instant scheduledAt) {
        this(monitorId, targetUrl, checkIntervalSeconds, timeoutMs, behaviorVersion, scheduledAt, null);
    }
}
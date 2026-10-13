package dev.ali.rcp.monitors;

import java.time.Instant;
import java.util.UUID;

public record MonitorResponse(
        UUID id,
        String name,
        String targetUrl,
        int checkIntervalSeconds,
        int timeoutMs,
        boolean enabled,
        Instant nextCheckAt,
        Instant createdAt,
        java.util.List<Integer> acceptedHttpStatuses
) {

    static MonitorResponse from(Monitor monitor) {
        return new MonitorResponse(
                monitor.getId(),
                monitor.getName(),
                monitor.getTargetUrl(),
                monitor.getCheckIntervalSeconds(),
                monitor.getTimeoutMs(),
                monitor.isEnabled(),
                monitor.getNextCheckAt(),
                monitor.getCreatedAt(),
                monitor.getAcceptedHttpStatuses()
        );
    }
}
package dev.ali.rcp.statuspage;

import java.time.Instant;
import java.util.List;

final class StatusPageHealthPolicy {
    private StatusPageHealthPolicy() {
    }

    static String componentStatus(
            boolean enabled,
            String incidentStatus,
            String latestVerdict,
            Instant latestScheduledAt,
            long currentBehaviorVersion,
            Long resultBehaviorVersion,
            int intervalSeconds,
            int timeoutMs,
            Instant asOf
    ) {
        // Pausing or losing probe evidence cannot hide a known unresolved outage.
        if ("OPEN".equals(incidentStatus)) {
            return "OUTAGE";
        }
        if (!enabled) {
            return "PAUSED";
        }
        if (latestScheduledAt == null || latestVerdict == null || resultBehaviorVersion == null
                || resultBehaviorVersion != currentBehaviorVersion) {
            return "UNKNOWN";
        }

        // The last finalized execution must still represent this monitor's current cadence.
        // Allow one missed interval and at least a minute for processing before marking it stale.
        long timeoutSeconds = (timeoutMs + 999L) / 1_000L;
        long maxAgeSeconds = Math.max(2L * intervalSeconds, intervalSeconds + timeoutSeconds + 60L);
        if (latestScheduledAt.isBefore(asOf.minusSeconds(maxAgeSeconds))) {
            return "STALE";
        }
        if ("DISAGREEMENT".equals(latestVerdict) || "NO_DATA".equals(latestVerdict)) {
            return "UNKNOWN";
        }
        if ("DOWN".equals(latestVerdict)) {
            return "DEGRADED";
        }
        return "UP".equals(latestVerdict) ? "OPERATIONAL" : "UNKNOWN";
    }

    static String overallStatus(List<PublicStatusComponent> components) {
        if (components.stream().anyMatch(component -> "OUTAGE".equals(component.status()))) {
            return "OUTAGE";
        }
        if (components.stream().anyMatch(component -> "DEGRADED".equals(component.status()))) {
            return "DEGRADED";
        }
        if (components.stream().anyMatch(component ->
                "UNKNOWN".equals(component.status())
                        || "PAUSED".equals(component.status())
                        || "STALE".equals(component.status()))) {
            return "UNKNOWN";
        }
        return "OPERATIONAL";
    }
}

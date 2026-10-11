package dev.ali.rcp.monitors;

import java.time.Instant;
import java.util.UUID;

public record MonitorOverview(
        UUID id,
        String name,
        String targetUrl,
        boolean enabled,
        Instant nextCheckAt,
        String incidentStatus,
        String latestVerdict,
        Instant latestCheckedAt,
        boolean latestBlocked
) {
}

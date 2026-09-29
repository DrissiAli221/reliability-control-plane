package dev.ali.rcp.statuspage;

import dev.ali.rcp.monitors.DailyEvidence;

import java.time.Instant;
import java.util.List;

public record PublicStatusComponent(
        String name,
        String status,
        String latestVerdict,
        Instant latestCheckedAt,
        Double measuredUptimePercent,
        List<DailyEvidence> history
) {
}

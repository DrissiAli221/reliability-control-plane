package dev.ali.rcp.statuspage;

import java.time.Instant;
import java.util.UUID;

record StatusComponentSnapshot(
        UUID monitorId,
        String name,
        String status,
        String latestVerdict,
        Instant latestCheckedAt
) {
}

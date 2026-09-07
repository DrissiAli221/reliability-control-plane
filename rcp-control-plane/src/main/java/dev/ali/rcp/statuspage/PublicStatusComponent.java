package dev.ali.rcp.statuspage;

import java.time.Instant;

public record PublicStatusComponent(
        String name,
        String status,
        String latestVerdict,
        Instant latestCheckedAt
) {
}

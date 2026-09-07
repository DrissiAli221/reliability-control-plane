package dev.ali.rcp.statuspage;

import java.time.Instant;
import java.util.List;

public record PublicStatusPage(
        String name,
        String slug,
        String overallStatus,
        Instant generatedAt,
        List<PublicStatusComponent> components
) {
}

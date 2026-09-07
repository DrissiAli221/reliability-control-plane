package dev.ali.rcp.statuspage;

import java.util.List;
import java.util.UUID;

public record StatusPageResponse(
        UUID id,
        String name,
        String slug,
        boolean published,
        List<UUID> monitorIds
) {
}

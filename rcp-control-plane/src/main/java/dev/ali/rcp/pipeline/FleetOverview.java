package dev.ali.rcp.pipeline;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * The caller's whole fleet at a glance: finalized verdicts in equal time buckets (oldest first, zero-filled),
 * and every incident that was open at any point in the incident window. Built for the console's home page,
 * so it answers "how has everything been?" in one round trip instead of one request per monitor.
 */
public record FleetOverview(
        Instant from,
        Instant to,
        int bucketSeconds,
        List<Bucket> buckets,
        Instant incidentsFrom,
        List<IncidentSpan> incidents
) {

    public record Bucket(long up, long down, long disagreement, long noData) {
        static final Bucket EMPTY = new Bucket(0, 0, 0, 0);
    }

    /** {@code resolvedAt} is null while the incident is still open. */
    public record IncidentSpan(UUID incidentId, UUID monitorId, String monitorName, Instant openedAt, Instant resolvedAt) {
    }
}

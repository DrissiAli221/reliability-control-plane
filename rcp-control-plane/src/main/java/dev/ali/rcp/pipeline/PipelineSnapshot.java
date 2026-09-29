package dev.ali.rcp.pipeline;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Current work at each pipeline stage, restricted to the caller's monitors so one tenant cannot observe
 * another tenant's volume. "Recent" means the last {@code windowSeconds} of PostgreSQL time.
 */
public record PipelineSnapshot(
        Instant generatedAt,
        int windowSeconds,
        long enabledMonitors,
        long dueMonitors,
        long pendingOutbox,
        long failedOutbox,
        long oldestPendingOutboxSeconds,
        long pendingExecutions,
        long awaitingIncidentEvaluation,
        long openIncidents,
        List<RegionFlow> regions,
        List<Activity> recentActivity
) {

    public record RegionFlow(
            String region,
            long jobsPublished,
            long resultsReceived,
            Long p50LatencyMs
    ) {
    }

    public record Activity(
            UUID monitorId,
            String monitorName,
            UUID executionId,
            Instant scheduledAt,
            String verdict,
            Instant finalizedAt,
            String transition
    ) {
    }
}

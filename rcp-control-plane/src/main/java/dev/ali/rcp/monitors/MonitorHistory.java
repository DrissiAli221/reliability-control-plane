package dev.ali.rcp.monitors;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record MonitorHistory(
        UUID monitorId,
        Instant generatedAt,
        List<DailyEvidence> days,
        List<RegionSummary> regions,
        List<RecentCheck> recentChecks
) {

    /** Latency percentiles cover HTTP responses in the last 24 hours; the last result may be any outcome. */
    public record RegionSummary(
            String region,
            long httpSamples,
            Long p50Ms,
            Long p95Ms,
            String lastOutcome,
            Integer lastHttpStatus,
            Long lastLatencyMs,
            Instant lastCompletedAt,
            List<Integer> lastAcceptedHttpStatuses
    ) {
        public RegionSummary(String region, long httpSamples, Long p50Ms, Long p95Ms, String lastOutcome,
                Integer lastHttpStatus, Long lastLatencyMs, Instant lastCompletedAt) {
            this(region,httpSamples,p50Ms,p95Ms,lastOutcome,lastHttpStatus,lastLatencyMs,lastCompletedAt,null);
        }
    }

    public record RecentCheck(
            UUID executionId,
            Instant scheduledAt,
            String verdict,
            List<RegionResult> results,
            List<Integer> acceptedHttpStatuses
    ) {
        public RecentCheck(UUID executionId, Instant scheduledAt, String verdict, List<RegionResult> results) {
            this(executionId, scheduledAt, verdict, results, null);
        }
    }

    public record RegionResult(
            String region,
            String outcome,
            Integer httpStatus,
            long latencyMs
    ) {
    }
}

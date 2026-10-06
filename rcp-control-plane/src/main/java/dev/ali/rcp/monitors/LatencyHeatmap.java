package dev.ali.rcp.monitors;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * HTTP-response latency counts per region, time column and latency band. Band i covers
 * [bounds[i-1], bounds[i]) milliseconds; band 0 is below the first bound and the last band is open-ended.
 */
public record LatencyHeatmap(
        UUID monitorId,
        Instant from,
        Instant to,
        int bucketSeconds,
        List<Long> latencyBoundsMs,
        List<RegionHeatmap> regions
) {

    /**
     * counts.get(column).get(band): column 0 is the oldest time slot. p50Ms and p95Ms hold each column's
     * nearest-rank percentiles (null where the column has no HTTP response), so every value was actually measured.
     */
    public record RegionHeatmap(String region, long samples, List<List<Long>> counts, List<Long> p50Ms, List<Long> p95Ms) {
    }
}

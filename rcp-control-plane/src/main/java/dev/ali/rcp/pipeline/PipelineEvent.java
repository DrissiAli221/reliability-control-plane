package dev.ali.rcp.pipeline;

import java.time.Instant;
import java.util.UUID;

/** One timestamped step of a check, flattened for a live log: outbox publish, result ingestion, verdict, incident change. */
public record PipelineEvent(
        Instant at,
        String type,
        UUID monitorId,
        String monitorName,
        UUID executionId,
        String region,
        String outcome,
        Integer httpStatus,
        Long latencyMs,
        String detail
) {
}

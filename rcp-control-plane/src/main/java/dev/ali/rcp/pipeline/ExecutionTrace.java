package dev.ali.rcp.pipeline;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Every recorded timestamp of one logical check, from the scheduler's due time to the incident decision.
 * Worker start/completion times come from the worker's clock; all other times come from PostgreSQL.
 */
public record ExecutionTrace(
        UUID executionId,
        UUID monitorId,
        Instant scheduledAt,
        Instant createdAt,
        Instant resultDeadlineAt,
        String status,
        String verdict,
        Instant finalizedAt,
        int expectedRegionCount,
        List<JobTrace> jobs,
        Evaluation evaluation
) {

    public record JobTrace(
            UUID jobId,
            String region,
            Instant createdAt,
            Instant publishedAt,
            int failedPublishAttempts,
            Instant publishFailedAt,
            String publishLastError,
            Instant startedAt,
            Instant completedAt,
            Instant receivedAt,
            String outcome,
            Integer httpStatus,
            Long latencyMs,
            Long responseBytes,
            String errorType
    ) {
    }

    public record Evaluation(String verdict, String transition, Instant evaluatedAt) {
    }
}

package dev.ali.rcp.pipeline;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** A monitor's position in the incident state machine, with the thresholds that move it. */
public record IncidentStateView(
        String status,
        int consecutiveDown,
        int consecutiveUp,
        int failuresToOpen,
        int successesToResolve,
        Instant openedAt,
        Instant lastEvaluatedAt,
        List<Evaluation> recentEvaluations
) {

    public record Evaluation(
            UUID executionId,
            Instant scheduledAt,
            String verdict,
            String transition,
            Instant evaluatedAt
    ) {
    }
}

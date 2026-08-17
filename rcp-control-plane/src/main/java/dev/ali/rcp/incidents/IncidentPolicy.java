package dev.ali.rcp.incidents;

import java.time.Instant;
import java.util.Objects;

public final class IncidentPolicy {

    private final int failuresToOpen;
    private final int successesToResolve;

    public IncidentPolicy(
            int failuresToOpen,
            int successesToResolve
    ) {
        if (failuresToOpen < 1 || successesToResolve < 1) {
            throw new IllegalArgumentException(
                    "Incident thresholds must be positive"
            );
        }

        this.failuresToOpen = failuresToOpen;
        this.successesToResolve = successesToResolve;
    }

    public static IncidentPolicy initialPolicy() {
        return new IncidentPolicy(2, 2);
    }

    public IncidentDecision evaluate(
            IncidentState current,
            ExecutionVerdict verdict,
            Instant scheduledAt
    ) {
        Objects.requireNonNull(current, "current state is required");
        Objects.requireNonNull(verdict, "verdict is required");
        Objects.requireNonNull(
                scheduledAt,
                "scheduled time is required"
        );

        if (isStaleOrDuplicate(current, scheduledAt)) {
            return new IncidentDecision(
                    current,
                    IncidentDecision.Transition.IGNORED_STALE
            );
        }

        return switch (verdict) {
            case DOWN -> evaluateDown(current, scheduledAt);
            case UP -> evaluateUp(current, scheduledAt);
            case DISAGREEMENT, NO_DATA ->
                    evaluateInconclusive(current, scheduledAt);
        };
    }

    private boolean isStaleOrDuplicate(
            IncidentState current,
            Instant scheduledAt
    ) {
        Instant lastEvaluatedAt = current.lastEvaluatedAt();

        return lastEvaluatedAt != null
                && !scheduledAt.isAfter(lastEvaluatedAt);
    }

    private IncidentDecision evaluateDown(
            IncidentState current,
            Instant scheduledAt
    ) {
        int consecutiveDown = current.consecutiveDown() + 1;

        if (!current.isOpen()
                && consecutiveDown >= failuresToOpen) {
            IncidentState opened = new IncidentState(
                    IncidentState.Status.OPEN,
                    consecutiveDown,
                    0,
                    scheduledAt,
                    scheduledAt
            );

            return new IncidentDecision(
                    opened,
                    IncidentDecision.Transition.OPENED
            );
        }

        IncidentState unchanged = new IncidentState(
                current.status(),
                consecutiveDown,
                0,
                scheduledAt,
                current.openedAt()
        );

        return new IncidentDecision(
                unchanged,
                IncidentDecision.Transition.NONE
        );
    }

    private IncidentDecision evaluateUp(
            IncidentState current,
            Instant scheduledAt
    ) {
        if (!current.isOpen()) {
            IncidentState healthy = new IncidentState(
                    IncidentState.Status.HEALTHY,
                    0,
                    0,
                    scheduledAt,
                    null
            );

            return new IncidentDecision(
                    healthy,
                    IncidentDecision.Transition.NONE
            );
        }

        int consecutiveUp = current.consecutiveUp() + 1;

        if (consecutiveUp >= successesToResolve) {
            IncidentState resolved = new IncidentState(
                    IncidentState.Status.HEALTHY,
                    0,
                    0,
                    scheduledAt,
                    null
            );

            return new IncidentDecision(
                    resolved,
                    IncidentDecision.Transition.RESOLVED
            );
        }

        IncidentState stillOpen = new IncidentState(
                IncidentState.Status.OPEN,
                0,
                consecutiveUp,
                scheduledAt,
                current.openedAt()
        );

        return new IncidentDecision(
                stillOpen,
                IncidentDecision.Transition.NONE
        );
    }

    private IncidentDecision evaluateInconclusive(
            IncidentState current,
            Instant scheduledAt
    ) {
        IncidentState resetStreaks = new IncidentState(
                current.status(),
                0,
                0,
                scheduledAt,
                current.openedAt()
        );

        return new IncidentDecision(
                resetStreaks,
                IncidentDecision.Transition.NONE
        );
    }
}
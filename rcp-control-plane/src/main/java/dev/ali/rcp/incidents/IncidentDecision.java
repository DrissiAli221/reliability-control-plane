package dev.ali.rcp.incidents;

import java.util.Objects;

public record IncidentDecision(
        IncidentState state,
        Transition transition
) {

    public IncidentDecision {
        Objects.requireNonNull(state, "state must not be null");
        Objects.requireNonNull(
                transition,
                "transition must not be null"
        );
    }

    public enum Transition {
        NONE,
        OPENED,
        RESOLVED,
        IGNORED_STALE
    }
}
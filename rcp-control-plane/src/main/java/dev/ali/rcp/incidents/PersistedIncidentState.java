package dev.ali.rcp.incidents;

import java.util.Objects;
import java.util.UUID;

public record PersistedIncidentState(
        IncidentState state,
        UUID openIncidentId
) {
    public PersistedIncidentState {
        Objects.requireNonNull(state, "state must not be null");
        if (state.isOpen() != (openIncidentId != null)) {
            throw new IllegalArgumentException("open state and incident id must agree");
        }
    }

    public static PersistedIncidentState healthy() {
        return new PersistedIncidentState(IncidentState.healthy(), null);
    }
}

package dev.ali.rcp.incidents;

import dev.ali.rcp.probes.ProbeOutcome;

import java.util.Objects;

public record RegionalProbeFact(
        String probeRegion,
        ProbeOutcome outcome,
        Integer httpStatus
) {
    public RegionalProbeFact {
        Objects.requireNonNull(probeRegion, "probeRegion must not be null");
        Objects.requireNonNull(outcome, "outcome must not be null");
        if (probeRegion.isBlank()) {
            throw new IllegalArgumentException("probeRegion must not be blank");
        }
    }

    public boolean isSuccessfulHttpResponse() {
        return outcome == ProbeOutcome.HTTP_RESPONSE
                && httpStatus != null
                && httpStatus >= 200
                && httpStatus < 400;
    }
}

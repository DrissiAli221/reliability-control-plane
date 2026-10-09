package dev.ali.rcp.incidents;

import dev.ali.rcp.probes.ProbeOutcome;

import java.util.Objects;

public record RegionalProbeFact(
        String probeRegion,
        ProbeOutcome outcome,
        Integer httpStatus,
        java.util.List<Integer> acceptedHttpStatuses
) {
    public RegionalProbeFact(String probeRegion, ProbeOutcome outcome, Integer httpStatus) {
        this(probeRegion, outcome, httpStatus, null);
    }

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
                && (acceptedHttpStatuses == null ? httpStatus >= 200 && httpStatus < 400 : acceptedHttpStatuses.contains(httpStatus));
    }

    public boolean isTargetEvidence() {
        return switch (outcome) {
            case HTTP_RESPONSE -> httpStatus != null;
            case CONNECT_TIMEOUT, REQUEST_TIMEOUT, TLS_FAILURE, CONNECTION_FAILURE -> true;
            case UNSAFE_TARGET, EXPIRED, RESPONSE_TOO_LARGE, INTERRUPTED, INTERNAL_ERROR -> false;
        };
    }
}

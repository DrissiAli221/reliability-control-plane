package dev.ali.rcp.incidents;

import java.util.HashSet;
import java.util.List;
import java.util.Optional;

public final class ExecutionVerdictPolicy {

    public Optional<ExecutionVerdict> evaluate(
            int expectedRegionCount,
            boolean deadlineElapsed,
            List<RegionalProbeFact> facts
    ) {
        if (expectedRegionCount < 1) {
            throw new IllegalArgumentException("expectedRegionCount must be positive");
        }
        if (facts.size() > expectedRegionCount) {
            throw new IllegalArgumentException("received more regional facts than expected");
        }
        if (new HashSet<>(facts.stream().map(RegionalProbeFact::probeRegion).toList()).size()
                != facts.size()) {
            throw new IllegalArgumentException("regional facts must be unique by region");
        }

        boolean complete = facts.size() == expectedRegionCount;
        if (!complete && !deadlineElapsed) {
            return Optional.empty();
        }
        if (facts.isEmpty()) {
            return Optional.of(ExecutionVerdict.NO_DATA);
        }
        if (!complete) {
            return Optional.of(ExecutionVerdict.DISAGREEMENT);
        }

        long successfulRegions = facts.stream()
                .filter(RegionalProbeFact::isSuccessfulHttpResponse)
                .count();
        if (successfulRegions == expectedRegionCount) {
            return Optional.of(ExecutionVerdict.UP);
        }
        if (successfulRegions == 0) {
            return Optional.of(ExecutionVerdict.DOWN);
        }
        return Optional.of(ExecutionVerdict.DISAGREEMENT);
    }
}

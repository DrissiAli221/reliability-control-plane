package dev.ali.rcp.availability;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Objects;

public final class AvailabilityCalculator {
    private static final BigDecimal ONE_HUNDRED = BigDecimal.valueOf(100);

    public AvailabilityMeasurement calculate(
            VerdictCounts counts,
            long expectedOpportunities,
            BigDecimal sloTargetPercent,
            BigDecimal minimumEvidenceCoveragePercent
    ) {
        Objects.requireNonNull(counts, "counts must not be null");
        if (expectedOpportunities < 0) {
            throw new IllegalArgumentException("expectedOpportunities must not be negative");
        }
        validatePercentage(sloTargetPercent, "sloTargetPercent");
        validatePercentage(minimumEvidenceCoveragePercent, "minimumEvidenceCoveragePercent");

        // An inconsistent history must never produce a green SLO or coverage above 100%.
        BigDecimal coverage = percentage(counts.conclusive(), Math.max(expectedOpportunities, counts.totalCreated()));
        if (counts.conclusive() == 0) {
            return new AvailabilityMeasurement(null, coverage, null);
        }

        BigDecimal availability = percentage(counts.up(), counts.conclusive());
        return new AvailabilityMeasurement(
                availability,
                coverage,
                counts.totalCreated() <= expectedOpportunities
                        && coverage.compareTo(minimumEvidenceCoveragePercent) >= 0
                        ? availability.compareTo(sloTargetPercent) >= 0
                        : null
        );
    }

    private BigDecimal percentage(long numerator, long denominator) {
        if (denominator == 0) {
            return BigDecimal.ZERO.setScale(5, RoundingMode.HALF_UP);
        }
        return BigDecimal.valueOf(numerator)
                .multiply(ONE_HUNDRED)
                .divide(BigDecimal.valueOf(denominator), 5, RoundingMode.HALF_UP);
    }

    private void validatePercentage(BigDecimal value, String name) {
        Objects.requireNonNull(value, name + " must not be null");
        if (value.signum() <= 0 || value.compareTo(ONE_HUNDRED) > 0) {
            throw new IllegalArgumentException(name + " must be greater than 0 and at most 100");
        }
    }
}

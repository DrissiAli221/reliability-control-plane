package dev.ali.rcp.availability;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Objects;

public final class AvailabilityCalculator {
    private static final BigDecimal ONE_HUNDRED = BigDecimal.valueOf(100);

    public AvailabilityMeasurement calculate(VerdictCounts counts, BigDecimal sloTargetPercent) {
        Objects.requireNonNull(counts, "counts must not be null");
        validateTarget(sloTargetPercent);

        BigDecimal coverage = percentage(counts.conclusive(), counts.total());
        if (counts.conclusive() == 0) {
            return new AvailabilityMeasurement(null, coverage, null);
        }

        BigDecimal availability = percentage(counts.up(), counts.conclusive());
        return new AvailabilityMeasurement(
                availability,
                coverage,
                availability.compareTo(sloTargetPercent) >= 0
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

    private void validateTarget(BigDecimal target) {
        Objects.requireNonNull(target, "sloTargetPercent must not be null");
        if (target.signum() <= 0 || target.compareTo(ONE_HUNDRED) > 0) {
            throw new IllegalArgumentException("sloTargetPercent must be greater than 0 and at most 100");
        }
    }
}

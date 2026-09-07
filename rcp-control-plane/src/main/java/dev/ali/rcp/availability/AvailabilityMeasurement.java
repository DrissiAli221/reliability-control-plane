package dev.ali.rcp.availability;

import java.math.BigDecimal;

public record AvailabilityMeasurement(
        BigDecimal measuredAvailabilityPercent,
        BigDecimal evidenceCoveragePercent,
        Boolean sloMet
) {
}

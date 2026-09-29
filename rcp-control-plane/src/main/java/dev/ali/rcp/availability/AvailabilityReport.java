package dev.ali.rcp.availability;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

public record AvailabilityReport(
        UUID monitorId,
        Instant from,
        Instant to,
        BigDecimal sloTargetPercent,
        BigDecimal measuredAvailabilityPercent,
        BigDecimal evidenceCoveragePercent,
        BigDecimal minimumEvidenceCoveragePercent,
        Boolean sloMet,
        long upExecutions,
        long downExecutions,
        long disagreementExecutions,
        long noDataExecutions,
        long conclusiveExecutions,
        long totalFinalizedExecutions,
        long pendingExecutions,
        long missingExecutions,
        long expectedOpportunities,
        String denominatorPolicy
) {
}

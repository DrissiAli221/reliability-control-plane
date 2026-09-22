package dev.ali.rcp.reporting;

import java.math.BigDecimal;

public record ReportErrorBudget(
        BigDecimal allowedBadExecutions,
        long observedBadExecutions,
        BigDecimal remainingExecutions
) {
}

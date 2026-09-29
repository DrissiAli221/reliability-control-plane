package dev.ali.rcp.monitors;

import java.time.LocalDate;
import java.util.List;

/**
 * Finalized execution verdicts for one UTC day, plus the day's display status.
 * A confirmed DOWN (every region agreed the target failed) marks the day as an outage;
 * regional disagreement marks it degraded; inconclusive NO_DATA verdicts alone never
 * count as target failure.
 */
public record DailyEvidence(
        LocalDate day,
        long up,
        long down,
        long disagreement,
        long noData,
        Status status
) {

    public enum Status {
        OPERATIONAL,
        DEGRADED,
        OUTAGE,
        NO_DATA
    }

    public static DailyEvidence of(LocalDate day, long up, long down, long disagreement, long noData) {
        return new DailyEvidence(day, up, down, disagreement, noData, status(up, down, disagreement));
    }

    private static Status status(long up, long down, long disagreement) {
        if (down > 0) {
            return Status.OUTAGE;
        }
        if (disagreement > 0) {
            return Status.DEGRADED;
        }
        return up > 0 ? Status.OPERATIONAL : Status.NO_DATA;
    }

    /** UP share of conclusive (UP or DOWN) verdicts, or null when there is no conclusive evidence. */
    public static Double measuredUptimePercent(List<DailyEvidence> days) {
        long up = days.stream().mapToLong(DailyEvidence::up).sum();
        long down = days.stream().mapToLong(DailyEvidence::down).sum();
        return up + down == 0 ? null : 100.0 * up / (up + down);
    }
}

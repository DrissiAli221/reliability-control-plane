package dev.ali.rcp.availability;

import java.time.Duration;
import java.time.Instant;

/** One active scheduling period; paused time contributes no expected checks. */
public record MonitorSchedule(Instant firstCheckAt, Instant stoppedAt, int intervalSeconds) {
    public MonitorSchedule(Instant firstCheckAt, int intervalSeconds) {
        this(firstCheckAt, null, intervalSeconds);
    }

    public MonitorSchedule {
        if (firstCheckAt == null || intervalSeconds < 1) {
            throw new IllegalArgumentException("schedule requires a first check and positive interval");
        }
        if (stoppedAt != null && stoppedAt.isBefore(firstCheckAt)) {
            throw new IllegalArgumentException("stoppedAt must not precede firstCheckAt");
        }
    }

    public long opportunities(Instant from, Instant to, Instant observedAt) {
        Instant end = to.isBefore(observedAt) ? to : observedAt;
        if (stoppedAt != null && stoppedAt.isBefore(end)) {
            end = stoppedAt;
        }
        if (!end.isAfter(firstCheckAt)) {
            return 0;
        }
        long intervalNanos = Duration.ofSeconds(intervalSeconds).toNanos();
        long first = from.isAfter(firstCheckAt)
                ? Math.ceilDiv(Duration.between(firstCheckAt, from).toNanos(), intervalNanos)
                : 0;
        long afterLast = Math.ceilDiv(Duration.between(firstCheckAt, end).toNanos(), intervalNanos);
        return Math.max(0, afterLast - first);
    }
}

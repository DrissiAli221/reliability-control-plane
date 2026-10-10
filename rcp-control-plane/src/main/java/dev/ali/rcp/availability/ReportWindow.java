package dev.ali.rcp.availability;

import java.time.Duration;
import java.time.Instant;
import java.util.List;

/**
 * The time window an availability figure or reliability report covers. Callers either name it with {@code days}
 * (one of a few fixed lengths ending now, which is what the console offers) or give an explicit {@code from}/{@code to}
 * pair. Giving neither means the last {@value #DEFAULT_DAYS} days. Checks are kept 90 days, so 90 is the longest preset.
 */
public record ReportWindow(Instant from, Instant to, Integer days) {
    public static final int DEFAULT_DAYS = 7;
    public static final List<Integer> ALLOWED_DAYS = List.of(1, 7, 30, 90);

    public static ReportWindow resolve(Instant from, Instant to, Integer days) {
        if (days != null) {
            if (from != null || to != null) {
                throw new IllegalArgumentException("days cannot be combined with from or to");
            }
            if (!ALLOWED_DAYS.contains(days)) {
                throw new IllegalArgumentException("days must be one of " + ALLOWED_DAYS);
            }
            return ending(Instant.now(), days);
        }
        if (from == null && to == null) {
            return ending(Instant.now(), DEFAULT_DAYS);
        }
        if (from == null || to == null) {
            throw new IllegalArgumentException("from and to must be given together");
        }
        return new ReportWindow(from, to, null);
    }

    private static ReportWindow ending(Instant to, int days) {
        return new ReportWindow(to.minus(Duration.ofDays(days)), to, days);
    }

    /** "30d" for a preset window, otherwise null; used to label downloads. */
    public String label() {
        return days == null ? null : days + "d";
    }
}

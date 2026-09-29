package dev.ali.rcp.availability;

import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

class MonitorScheduleTest {
    private static final Instant START = Instant.parse("2026-09-07T12:00:00Z");
    private final MonitorSchedule schedule = new MonitorSchedule(START, 60);

    @Test
    void countsEndExclusiveDueSlots() {
        assertThat(schedule.opportunities(START, START.plusSeconds(300), START.plusSeconds(360)))
                .isEqualTo(5);
        assertThat(schedule.opportunities(START.plusSeconds(60), START.plusSeconds(180), START.plusSeconds(360)))
                .isEqualTo(2);
    }

    @Test
    void excludesTimeBeforeCreationAndFutureSlots() {
        assertThat(schedule.opportunities(START.minusSeconds(3600), START.plusSeconds(180), START.plusSeconds(90)))
                .isEqualTo(2);
        assertThat(schedule.opportunities(START.minusSeconds(3600), START, START.plusSeconds(90)))
                .isZero();
    }

    @Test
    void pausedPeriodDoesNotCreateExpectedChecks() {
        MonitorSchedule first = new MonitorSchedule(START, START.plusSeconds(180), 60);
        MonitorSchedule resumed = new MonitorSchedule(START.plusSeconds(600), 60);

        long expected = first.opportunities(START, START.plusSeconds(900), START.plusSeconds(900))
                + resumed.opportunities(START, START.plusSeconds(900), START.plusSeconds(900));

        assertThat(expected).isEqualTo(8);
    }
}

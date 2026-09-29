package dev.ali.rcp.monitors;

import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class DailyEvidenceTest {
    private static final LocalDate DAY = LocalDate.parse("2026-09-29");

    @Test
    void confirmedDownOutranksDisagreementAndSuccess() {
        assertThat(DailyEvidence.of(DAY, 100, 1, 3, 0).status()).isEqualTo(DailyEvidence.Status.OUTAGE);
        assertThat(DailyEvidence.of(DAY, 100, 0, 3, 0).status()).isEqualTo(DailyEvidence.Status.DEGRADED);
        assertThat(DailyEvidence.of(DAY, 100, 0, 0, 0).status()).isEqualTo(DailyEvidence.Status.OPERATIONAL);
    }

    @Test
    void inconclusiveVerdictsAloneAreNotTargetFailure() {
        assertThat(DailyEvidence.of(DAY, 0, 0, 0, 12).status()).isEqualTo(DailyEvidence.Status.NO_DATA);
        assertThat(DailyEvidence.of(DAY, 5, 0, 0, 12).status()).isEqualTo(DailyEvidence.Status.OPERATIONAL);
    }

    @Test
    void uptimeUsesOnlyConclusiveVerdicts() {
        List<DailyEvidence> days = List.of(
                DailyEvidence.of(DAY.minusDays(1), 3, 1, 50, 50),
                DailyEvidence.of(DAY, 0, 0, 0, 0)
        );

        assertThat(DailyEvidence.measuredUptimePercent(days)).isEqualTo(75.0);
        assertThat(DailyEvidence.measuredUptimePercent(List.of(DailyEvidence.of(DAY, 0, 0, 4, 4)))).isNull();
    }
}

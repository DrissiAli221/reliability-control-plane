package dev.ali.rcp.availability;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;

class AvailabilityCalculatorTest {
    private final AvailabilityCalculator calculator = new AvailabilityCalculator();

    @Test
    void separatesAvailabilityFromEvidenceCoverage() {
        AvailabilityMeasurement result = calculator.calculate(
                new VerdictCounts(1, 0, 0, 1),
                new BigDecimal("99.9"),
                new BigDecimal("95")
        );

        assertThat(result.measuredAvailabilityPercent()).isEqualByComparingTo("100.00000");
        assertThat(result.evidenceCoveragePercent()).isEqualByComparingTo("50.00000");
        assertThat(result.sloMet()).isNull();
    }

    @Test
    void reportsUndefinedAvailabilityWhenThereIsNoConclusiveEvidence() {
        AvailabilityMeasurement result = calculator.calculate(
                new VerdictCounts(0, 0, 1, 1),
                new BigDecimal("99.9"),
                new BigDecimal("95")
        );

        assertThat(result.measuredAvailabilityPercent()).isNull();
        assertThat(result.evidenceCoveragePercent()).isEqualByComparingTo("0.00000");
        assertThat(result.sloMet()).isNull();
    }

    @Test
    void measuresOnlyUpAndDownExecutionsAgainstTheSlo() {
        AvailabilityMeasurement result = calculator.calculate(
                new VerdictCounts(2, 1, 7, 5),
                new BigDecimal("99.9"),
                new BigDecimal("95")
        );

        assertThat(result.measuredAvailabilityPercent()).isEqualByComparingTo("66.66667");
        assertThat(result.evidenceCoveragePercent()).isEqualByComparingTo("20.00000");
        assertThat(result.sloMet()).isNull();
    }

    @Test
    void evaluatesSloWhenEvidenceCoverageMeetsThreshold() {
        AvailabilityMeasurement result = calculator.calculate(
                new VerdictCounts(19, 1, 0, 0),
                new BigDecimal("99.9"),
                new BigDecimal("95")
        );

        assertThat(result.evidenceCoveragePercent()).isEqualByComparingTo("100.00000");
        assertThat(result.sloMet()).isFalse();
    }

    @Test
    void permitsPassingSloAtExactCoverageThreshold() {
        AvailabilityMeasurement result = calculator.calculate(
                new VerdictCounts(19, 0, 0, 1),
                new BigDecimal("99.9"),
                new BigDecimal("95")
        );

        assertThat(result.evidenceCoveragePercent()).isEqualByComparingTo("95.00000");
        assertThat(result.sloMet()).isTrue();
    }
}

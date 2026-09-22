package dev.ali.rcp.availability;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

@Service
public class AvailabilityService {
    private static final Duration MAXIMUM_WINDOW = Duration.ofDays(366);
    private static final String DENOMINATOR_POLICY =
            "UP_AND_DOWN_ONLY; DISAGREEMENT_AND_NO_DATA_EXCLUDED; MAINTENANCE_WINDOWS_NOT_YET_IMPLEMENTED";

    private final AvailabilityRepository repository;
    private final AvailabilityCalculator calculator = new AvailabilityCalculator();
    private final BigDecimal minimumEvidenceCoveragePercent;

    public AvailabilityService(
            AvailabilityRepository repository,
            @Value("${rcp.availability.minimum-evidence-coverage-percent:95}")
            BigDecimal minimumEvidenceCoveragePercent
    ) {
        this.repository = Objects.requireNonNull(repository);
        this.minimumEvidenceCoveragePercent = Objects.requireNonNull(minimumEvidenceCoveragePercent);
    }

    @Transactional(readOnly = true)
    public AvailabilityReport report(
            String ownerSubject,
            UUID monitorId,
            Instant from,
            Instant to,
            BigDecimal sloTargetPercent
    ) {
        requireText(ownerSubject, "ownerSubject");
        Objects.requireNonNull(monitorId, "monitorId must not be null");
        validateWindow(from, to);

        if (!repository.ownerHasMonitor(ownerSubject, monitorId)) {
            throw new AvailabilityMonitorNotFoundException();
        }

        VerdictCounts counts = repository.countFinalizedVerdicts(monitorId, from, to);
        AvailabilityMeasurement measurement = calculator.calculate(
                counts,
                sloTargetPercent,
                minimumEvidenceCoveragePercent
        );
        return new AvailabilityReport(
                monitorId,
                from,
                to,
                sloTargetPercent,
                measurement.measuredAvailabilityPercent(),
                measurement.evidenceCoveragePercent(),
                minimumEvidenceCoveragePercent,
                measurement.sloMet(),
                counts.up(),
                counts.down(),
                counts.disagreement(),
                counts.noData(),
                counts.conclusive(),
                counts.total(),
                DENOMINATOR_POLICY
        );
    }

    private void validateWindow(Instant from, Instant to) {
        Objects.requireNonNull(from, "from must not be null");
        Objects.requireNonNull(to, "to must not be null");
        if (!from.isBefore(to)) {
            throw new IllegalArgumentException("from must be before to");
        }
        if (Duration.between(from, to).compareTo(MAXIMUM_WINDOW) > 0) {
            throw new IllegalArgumentException("availability window must not exceed 366 days");
        }
    }

    private void requireText(String value, String name) {
        Objects.requireNonNull(value, name + " must not be null");
        if (value.isBlank()) {
            throw new IllegalArgumentException(name + " must not be blank");
        }
    }
}

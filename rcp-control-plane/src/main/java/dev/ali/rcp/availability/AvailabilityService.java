package dev.ali.rcp.availability;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.annotation.Isolation;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

@Service
public class AvailabilityService {
    private static final Duration MAXIMUM_WINDOW = Duration.ofDays(366);
    private static final String DENOMINATOR_POLICY =
            "UP_AND_DOWN_ONLY; COVERAGE_INCLUDES_MISSING_AND_PENDING_SCHEDULE_SLOTS; MAINTENANCE_WINDOWS_NOT_YET_IMPLEMENTED";

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

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
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

        Instant observedAt = repository.databaseNow();
        if (!repository.ownerHasMonitor(ownerSubject, monitorId)) {
            throw new AvailabilityMonitorNotFoundException();
        }

        var schedules = repository.schedules(monitorId);
        if (schedules.isEmpty()) {
            throw new IllegalStateException("monitor has no schedule history");
        }
        VerdictCounts counts = repository.countExecutionVerdicts(monitorId, from, to);
        long expected = schedules.stream()
                .mapToLong(schedule -> schedule.opportunities(from, to, observedAt))
                .sum();
        AvailabilityMeasurement measurement = calculator.calculate(
                counts,
                expected,
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
                counts.pending(),
                Math.max(0, expected - counts.totalCreated()),
                expected,
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

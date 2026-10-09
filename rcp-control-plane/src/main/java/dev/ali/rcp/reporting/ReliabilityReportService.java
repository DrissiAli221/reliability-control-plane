package dev.ali.rcp.reporting;

import dev.ali.rcp.availability.AvailabilityReport;
import dev.ali.rcp.availability.AvailabilityService;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

@Service
public class ReliabilityReportService {
    private static final int MAX_INCIDENT_EVENTS = 100;
    private static final int MINIMUM_LATENCY_SAMPLES = 20;
    private static final BigDecimal ONE_HUNDRED = BigDecimal.valueOf(100);
    /** The one place the report's stated limits live; `limitations` in the JSON is derived from these texts. */
    static final List<ReportCaveat> CAVEATS = List.of(
            new ReportCaveat("Coverage", "Counts checks that never ran and skips paused periods; maintenance and late corrections are not modelled yet."),
            new ReportCaveat("Scope", "One availability number for the whole monitor; there are no per-region SLIs yet."),
            new ReportCaveat("Incidents", "Shows transitions inside this window only; an incident opened earlier may still be active."),
            new ReportCaveat("Latency", "HTTP responses only, at least 20 of them; timeouts and refused connections are not in the percentiles."),
            new ReportCaveat("Regions", "Labels come from the probe configuration; locally they do not prove where a check ran.")
    );
    private static final List<String> LIMITATIONS = CAVEATS.stream().map(ReportCaveat::text).toList();

    private final AvailabilityService availabilityService;
    private final ReliabilityReportRepository repository;

    public ReliabilityReportService(
            AvailabilityService availabilityService,
            ReliabilityReportRepository repository
    ) {
        this.availabilityService = Objects.requireNonNull(availabilityService);
        this.repository = Objects.requireNonNull(repository);
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public ReliabilityReport generate(
            String ownerSubject,
            UUID monitorId,
            Instant from,
            Instant to,
            BigDecimal sloTargetPercent
    ) {
        AvailabilityReport availability = availabilityService.report(
                ownerSubject, monitorId, from, to, sloTargetPercent
        );

        ReliabilityReportRepository.MonitorLabel monitor;
        try {
            monitor = repository.monitorLabel(monitorId, ownerSubject);
        } catch (EmptyResultDataAccessException exception) {
            throw new dev.ali.rcp.availability.AvailabilityMonitorNotFoundException();
        }

        List<ReportIncidentEvent> events = repository.incidentTimeline(
                monitorId, from, to, MAX_INCIDENT_EVENTS + 1
        );
        boolean truncated = events.size() > MAX_INCIDENT_EVENTS;
        List<ReportIncidentEvent> timeline = truncated
                ? List.copyOf(events.subList(0, MAX_INCIDENT_EVENTS))
                : List.copyOf(events);

        ReliabilityReportRepository.LatencySamples samples = repository.latencySamples(monitorId, from, to);
        ReportLatency latency = new ReportLatency(
                samples.sampleCount(),
                samples.sampleCount() >= MINIMUM_LATENCY_SAMPLES ? samples.p50Ms() : null,
                samples.sampleCount() >= MINIMUM_LATENCY_SAMPLES ? samples.p95Ms() : null,
                MINIMUM_LATENCY_SAMPLES
        );

        BigDecimal allowedBad = BigDecimal.valueOf(availability.conclusiveExecutions())
                .multiply(ONE_HUNDRED.subtract(sloTargetPercent))
                .divide(ONE_HUNDRED, 5, RoundingMode.HALF_UP);
        ReportErrorBudget budget = new ReportErrorBudget(
                allowedBad,
                availability.downExecutions(),
                allowedBad.subtract(BigDecimal.valueOf(availability.downExecutions()))
        );

        return new ReliabilityReport(
                "rcp-report-v1",
                repository.databaseNow(),
                repository.sourceDataWatermark(monitorId, from, to),
                monitor.name(),
                monitor.targetUrl(),
                availability,
                budget,
                latency,
                timeline,
                truncated,
                LIMITATIONS,
                CAVEATS
        );
    }
}

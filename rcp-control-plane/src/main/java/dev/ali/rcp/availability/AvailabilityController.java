package dev.ali.rcp.availability;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

@RestController
@RequestMapping("/api/monitors/{monitorId}/availability")
public class AvailabilityController {
    private final AvailabilityService service;

    public AvailabilityController(AvailabilityService service) {
        this.service = service;
    }

    @GetMapping
    public AvailabilityReport report(
            @PathVariable UUID monitorId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant to,
            @RequestParam(required = false) Integer days,
            @RequestParam(defaultValue = "99.9") BigDecimal sloTargetPercent,
            Authentication authentication
    ) {
        ReportWindow window = ReportWindow.resolve(from, to, days);
        return service.report(
                authentication.getName(),
                monitorId,
                window.from(),
                window.to(),
                sloTargetPercent
        );
    }
}

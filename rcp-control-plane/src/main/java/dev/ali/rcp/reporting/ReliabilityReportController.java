package dev.ali.rcp.reporting;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import dev.ali.rcp.availability.ReportWindow;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

@RestController
@RequestMapping("/api/monitors/{monitorId}/reliability-report")
public class ReliabilityReportController {
    private final ReliabilityReportService service;
    private final ReliabilityReportHtmlRenderer htmlRenderer;
    private final ReliabilityReportCsvWriter csvWriter;

    public ReliabilityReportController(
            ReliabilityReportService service,
            ReliabilityReportHtmlRenderer htmlRenderer,
            ReliabilityReportCsvWriter csvWriter
    ) {
        this.service = service;
        this.htmlRenderer = htmlRenderer;
        this.csvWriter = csvWriter;
    }

    @GetMapping
    public ReliabilityReport json(
            @PathVariable UUID monitorId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant to,
            @RequestParam(required = false) Integer days,
            @RequestParam(defaultValue = "99.9") BigDecimal sloTargetPercent,
            Authentication authentication
    ) {
        ReportWindow window = ReportWindow.resolve(from, to, days);
        return service.generate(authentication.getName(), monitorId, window.from(), window.to(), sloTargetPercent);
    }

    @GetMapping(value = "/html", produces = MediaType.TEXT_HTML_VALUE)
    public ResponseEntity<String> html(
            @PathVariable UUID monitorId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant to,
            @RequestParam(required = false) Integer days,
            @RequestParam(defaultValue = "99.9") BigDecimal sloTargetPercent,
            Authentication authentication
    ) {
        ReportWindow window = ReportWindow.resolve(from, to, days);
        ReliabilityReport report = service.generate(
                authentication.getName(), monitorId, window.from(), window.to(), sloTargetPercent
        );
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType("text/html; charset=UTF-8"))
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=rcp-reliability-report" + suffix(window) + ".html")
                .header("Content-Security-Policy", "sandbox; default-src 'none'; style-src 'unsafe-inline'")
                .body(htmlRenderer.render(report));
    }

    @GetMapping(value = "/csv", produces = "text/csv; charset=utf-8")
    public ResponseEntity<String> csv(
            @PathVariable UUID monitorId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant to,
            @RequestParam(required = false) Integer days,
            @RequestParam(defaultValue = "99.9") BigDecimal sloTargetPercent,
            Authentication authentication
    ) {
        ReportWindow window = ReportWindow.resolve(from, to, days);
        ReliabilityReport report = service.generate(
                authentication.getName(), monitorId, window.from(), window.to(), sloTargetPercent
        );
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType("text/csv; charset=utf-8"))
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=rcp-reliability-incidents" + suffix(window) + ".csv")
                .header("X-Content-Type-Options", "nosniff")
                .body(csvWriter.write(report));
    }

    /** Preset windows are named in the file so a 30-day export is not mistaken for a 7-day one. */
    private static String suffix(ReportWindow window) {
        return window.label() == null ? "" : "-" + window.label();
    }
}

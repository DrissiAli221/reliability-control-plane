package dev.ali.rcp.reporting;

import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;

/** The report's incident list as RFC 4180 CSV, one row per incident, safe to open in a spreadsheet. */
@Component
public class ReliabilityReportCsvWriter {
    static final String HEADER = "incident_id,state,opened_at,resolved_at,duration_seconds";

    private final ReliabilityReportHtmlRenderer renderer;

    public ReliabilityReportCsvWriter(ReliabilityReportHtmlRenderer renderer) {
        this.renderer = renderer;
    }

    public String write(ReliabilityReport report) {
        StringBuilder csv = new StringBuilder(HEADER).append("\r\n");
        for (ReliabilityReportHtmlRenderer.Incident incident : renderer.incidents(report.incidentTimeline())) {
            csv.append(field(incident.id().toString())).append(',')
                    .append(incident.resolved() == null ? "OPEN" : "RESOLVED").append(',')
                    .append(instant(incident.opened())).append(',')
                    .append(instant(incident.resolved())).append(',')
                    .append(duration(incident.opened(), incident.resolved())).append("\r\n");
        }
        return csv.toString();
    }

    private static String instant(Instant value) {
        return value == null ? "" : value.toString();
    }

    /** Only known when both ends fall inside the window; an unknown end leaves the cell empty. */
    private static String duration(Instant opened, Instant resolved) {
        return opened == null || resolved == null ? "" : Long.toString(Duration.between(opened, resolved).toSeconds());
    }

    /** Quotes per RFC 4180 and defuses formula triggers by prefixing a single quote. */
    static String field(String value) {
        String safe = !value.isEmpty() && "=+-@".indexOf(value.charAt(0)) >= 0 ? "'" + value : value;
        boolean quote = safe.indexOf(',') >= 0 || safe.indexOf('"') >= 0 || safe.indexOf('\n') >= 0 || safe.indexOf('\r') >= 0;
        return quote ? '"' + safe.replace("\"", "\"\"") + '"' : safe;
    }
}

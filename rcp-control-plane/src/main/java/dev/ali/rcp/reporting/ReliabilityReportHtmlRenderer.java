package dev.ali.rcp.reporting;

import dev.ali.rcp.availability.AvailabilityReport;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;

@Component
public class ReliabilityReportHtmlRenderer {
    public String render(ReliabilityReport report) {
        StringBuilder html = new StringBuilder(4096);
        AvailabilityReport availability = report.availability();
        html.append("<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\">")
                .append("<title>RCP reliability report</title></head><body>")
                .append("<h1>Reliability report</h1>")
                .append("<p>Schema: ").append(escape(report.schemaVersion()))
                .append(" · Generated: ").append(escape(report.generatedAt().toString()))
                .append(" · Source watermark: ").append(escape(value(report.sourceDataWatermark())))
                .append("</p><h2>Monitor</h2><p>").append(escape(report.monitorName()))
                .append(" — ").append(escape(report.targetUrl())).append("</p>")
                .append("<p>Window: ").append(escape(availability.from().toString()))
                .append(" to ").append(escape(availability.to().toString())).append(" (UTC, end exclusive)</p>")
                .append("<h2>Availability and SLO</h2><dl>");

        item(html, "Measured availability", percent(availability.measuredAvailabilityPercent()));
        item(html, "Evidence coverage", percent(availability.evidenceCoveragePercent()));
        item(html, "Minimum coverage for an SLO decision", percent(availability.minimumEvidenceCoveragePercent()));
        item(html, "SLO target", percent(availability.sloTargetPercent()));
        item(html, "SLO result", availability.sloMet() == null
                ? "INSUFFICIENT_DATA" : availability.sloMet() ? "MET" : "MISSED");
        item(html, "UP / DOWN", availability.upExecutions() + " / " + availability.downExecutions());
        item(html, "DISAGREEMENT / NO_DATA",
                availability.disagreementExecutions() + " / " + availability.noDataExecutions());
        item(html, "Denominator policy", availability.denominatorPolicy());
        html.append("</dl><h2>Observed error budget</h2><dl>");
        item(html, "Allowed bad executions", report.errorBudget().allowedBadExecutions().toPlainString());
        item(html, "Observed bad executions", Long.toString(report.errorBudget().observedBadExecutions()));
        item(html, "Remaining executions", report.errorBudget().remainingExecutions().toPlainString());
        html.append("</dl><h2>HTTP response latency</h2><dl>");
        item(html, "Samples", Long.toString(report.latency().sampleCount()));
        item(html, "p50 / p95 (ms)", report.latency().p50Ms() == null
                ? "INSUFFICIENT_SAMPLES (minimum " + report.latency().minimumSamples() + ")"
                : report.latency().p50Ms() + " / " + report.latency().p95Ms());
        html.append("</dl><h2>Incident transitions</h2><ol>");
        for (ReportIncidentEvent event : report.incidentTimeline()) {
            html.append("<li>").append(escape(event.occurredAt().toString()))
                    .append(" — ").append(escape(event.eventType()))
                    .append(" (incident ").append(escape(event.incidentId().toString()))
                    .append(")</li>");
        }
        html.append("</ol>");
        if (report.incidentTimelineTruncated()) {
            html.append("<p>Incident timeline truncated at 100 transitions.</p>");
        }
        html.append("<h2>Limitations</h2><ul>");
        for (String limitation : report.limitations()) {
            html.append("<li>").append(escape(limitation)).append("</li>");
        }
        return html.append("</ul></body></html>").toString();
    }

    private void item(StringBuilder html, String label, String value) {
        html.append("<dt>").append(escape(label)).append("</dt><dd>")
                .append(escape(value)).append("</dd>");
    }

    private String percent(BigDecimal value) {
        return value == null ? "UNDEFINED" : value.toPlainString() + "%";
    }

    private String value(Object value) {
        return value == null ? "NO_SOURCE_DATA" : value.toString();
    }

    private String escape(String input) {
        return input.replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;")
                .replace("'", "&#39;");
    }
}

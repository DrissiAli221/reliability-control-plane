package dev.ali.rcp.reporting;

import dev.ali.rcp.availability.AvailabilityReport;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;

@Component
public class ReliabilityReportHtmlRenderer {
    private static final BigDecimal HUNDRED = BigDecimal.valueOf(100);
    private static final String LIGHT_TOKENS = """
            --bg: #ededf0; --surface: #ffffff; --surface-2: #f0f0f3; --border: #dcdce1;
            --text: #09090b; --text-2: #3f3f46; --text-3: #6b6b74;
            --green: #1a7f4b; --green-text: #157040; --amber: #b86e00; --amber-text: #9a5c00;
            --red: #d1342f; --red-text: #b42a25; --track: #e4e4e8; --light-fall: 8%;
            """;
    // Geist, Geist Mono and Doto are embedded (Latin subsets, OFL) so a downloaded file looks the same offline.
    private static final String FONT_FACES = fontFace("Geist", "geist-latin.woff2", "100 900")
            + fontFace("Geist Mono", "geist-mono-latin.woff2", "100 900")
            + fontFace("Doto", "doto-latin-800.woff2", "800");
    private static final String STYLES = FONT_FACES + """
            :root { color-scheme: dark; --bg: #0a0a0a; --surface: #111111; --surface-2: #171717; --border: #242424;
              --text: #ededed; --text-2: #a1a1a1; --text-3: #6b6b6b;
              --green: #30a46c; --green-text: #4cc38a; --amber: #f5a524; --amber-text: #ffb54d;
              --red: #e5484d; --red-text: #ff6369; --track: #2a2a2a; --light-fall: 7%;
              --font-sans: "Geist", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
              --font-mono: "Geist Mono", ui-monospace, "SFMono-Regular", Consolas, monospace;
              --font-dots: "Doto", var(--font-mono); }
            @media (prefers-color-scheme: light) { :root { color-scheme: light; """ + LIGHT_TOKENS + """
            } }
            * { box-sizing: border-box; }
            body { margin: 0; background: var(--bg); color: var(--text); font-family: var(--font-sans);
              font-size: 13px; font-weight: 400; line-height: 1.5; letter-spacing: 0;
              -webkit-font-smoothing: antialiased; font-synthesis: none; }
            h1, h2, h3, p, dl, dd { margin: 0; }
            .report { max-width: 1120px; margin: 0 auto; padding: 40px 40px 28px; }
            .mono, .eyebrow, dt, th, .tag, .section-index, .unit, .legend, .chart-label, .edition, footer { font-family: var(--font-mono); }
            h1 { font-size: 40px; font-weight: 600; line-height: 1.1; letter-spacing: -.02em; }
            .figure, .empty-value { font-family: var(--font-dots); font-size: 28px; font-weight: 800; line-height: 1;
              letter-spacing: 0; color: var(--text); font-variant-numeric: tabular-nums; }
            h2, h3, .brand { font-size: 15px; font-weight: 500; line-height: 1.3; letter-spacing: -.01em; }
            .eyebrow, dt, th, .section-index, .section-note, .unit, .legend, .chart-label, .edition, footer {
              font-size: 11px; font-weight: 400; letter-spacing: .04em; color: var(--text-3); }
            .eyebrow { margin: 0 0 10px; }
            .masthead { display: flex; align-items: center; justify-content: space-between; gap: 16px;
              padding-bottom: 22px; border-bottom: 1px solid var(--border); }
            .brand { display: flex; align-items: center; gap: 10px; }
            .brand svg { width: 26px; height: 26px; flex: none; }
            .intro { margin: 28px 0 22px; }
            h1 { margin-bottom: 20px; }
            .monitor { overflow-wrap: anywhere; }
            .target { color: var(--text-2); margin: 5px 0 18px; overflow-wrap: anywhere; }
            .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
            dt { margin-bottom: 4px; } dd { overflow-wrap: anywhere; }
            .decision { display: flex; align-items: flex-start; gap: 14px; padding: 14px 16px;
              border: 1px solid var(--border); background: var(--surface); margin-bottom: 18px; }
            .decision p { color: var(--text-2); }
            .tag { display: inline-flex; align-items: center; gap: 7px; white-space: nowrap; color: var(--text); }
            .tag::before { content: ""; width: 6px; height: 6px; background: currentColor; border-radius: 50%; }
            .good { color: var(--green-text); } .bad { color: var(--red-text); } .warn { color: var(--amber-text); }
            .figure.good, .figure.bad, .figure.warn { color: var(--text); }
            .metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); border: 1px solid var(--border); }
            .metric { padding: 18px; min-width: 0; background: var(--surface); }
            .metric + .metric { border-left: 1px solid var(--border); }
            .readout { display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px 18px; margin: 12px 0 10px; }
            .readout span.pair { display: inline-flex; align-items: baseline; gap: 7px; }
            .metric p { color: var(--text-3); }
            .section-heading { display: flex; align-items: baseline; gap: 12px; margin: 28px 0 12px; }
            .section-note { margin-left: auto; }
            .visuals { display: grid; grid-template-columns: 1fr 1fr; border: 1px solid var(--border); }
            .visual { min-width: 0; padding: 18px; } .visual + .visual { border-left: 1px solid var(--border); }
            .visual h3 { margin-bottom: 4px; }
            .visual p { color: var(--text-2); }
            .chart { display: block; width: 100%; height: 14px; margin: 12px 0 6px; overflow: visible; }
            .track { fill: var(--track); } .fill-good { fill: var(--green); } .fill-bad { fill: var(--red); }
            .fill-warn { fill: var(--amber); } .fill-neutral { fill: var(--text-2); }
            .marker { stroke: var(--text); stroke-width: 2; vector-effect: non-scaling-stroke; }
            .legend { display: flex; justify-content: space-between; gap: 10px; }
            .legend b { font-weight: 400; color: var(--text); }
            .coverage { margin: 16px 0 0; } .coverage .chart { margin: 9px 0 6px; }
            .bar-head { margin-top: 18px; } .bar-head + .chart { margin-top: 6px; }
            .facts { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px;
              padding: 18px 0; border-bottom: 1px solid var(--border); margin: 0; }
            code { font-family: var(--font-mono); color: var(--text); }
            .policy { margin: 10px 0 0; color: var(--text-2); overflow-wrap: anywhere; }
            table { border-collapse: collapse; width: 100%; }
            th { text-align: left; background: var(--surface-2); }
            th, td { border-bottom: 1px solid var(--border); padding: 10px 12px; vertical-align: top; }
            th:first-child, td:first-child { padding-left: 12px; } td.mono { overflow-wrap: anywhere; }
            .table-wrap { overflow-x: auto; }
            .empty { padding: 18px 0; color: var(--text-2); border-bottom: 1px solid var(--border); }
            .notice { color: var(--amber-text); margin-top: 10px; }
            .limitations { color: var(--text-2); padding-left: 16px; margin: 0; }
            .limitations li { padding-left: 3px; margin: 4px 0; }
            footer { border-top: 1px solid var(--border); margin-top: 24px; padding-top: 12px;
              display: flex; justify-content: space-between; gap: 12px; overflow-wrap: anywhere; }
            @media (max-width: 700px) {
              .report { padding: 24px 20px; } .metrics { grid-template-columns: 1fr 1fr; }
              .metric:nth-child(3) { border-left: 0; } .metric:nth-child(n+3) { border-top: 1px solid var(--border); }
              .visuals { grid-template-columns: 1fr; } .visual + .visual { border-left: 0; border-top: 1px solid var(--border); }
              .facts { grid-template-columns: 1fr 1fr; } .meta { grid-template-columns: 1fr; }
              .section-note { display: none; } .decision, footer { flex-wrap: wrap; } .edition { text-align: right; }
            }
            @page { size: A4; margin: 12mm; }
            @media print {
              :root { color-scheme: light; """ + LIGHT_TOKENS + """
                --bg: #ffffff; }
              body { font-size: 9pt; } .report { max-width: none; padding: 0; }
              .masthead { padding-bottom: 3mm; } .brand svg { width: 20px; height: 20px; }
              .intro { margin: 4mm 0 3mm; } h1 { font-size: 26pt; margin-bottom: 3mm; }
              .figure, .empty-value { font-size: 18pt; }
              h2, h3, .brand { font-size: 10.5pt; }
              .eyebrow, dt, th, .section-index, .section-note, .unit, .legend, .chart-label, .edition, footer { font-size: 7.5pt; }
              .target { margin-bottom: 3mm; } .meta { gap: 3mm; }
              .decision { padding: 3mm; margin-bottom: 3mm; flex-wrap: nowrap; }
              .metric { padding: 3mm; } .readout { margin: 3mm 0 2mm; }
              .visual { padding: 3mm; }
              .chart { margin: 3mm 0 2mm; } .coverage { margin-top: 3mm; }
              .coverage .chart { margin: 2mm 0 1mm; }
              .section-heading { margin: 3mm 0 2mm; break-after: avoid; }
              .facts { padding: 2mm 0; gap: 3mm; }
              .table-wrap { overflow: visible; }
              th, td { padding: 1.5mm; } thead { display: table-header-group; } tr { break-inside: avoid; }
              .masthead, .intro, .decision, .metric, .metrics, .visual, .visuals, .facts { break-inside: avoid; }
              .limitations li { margin: 1mm 0; } footer { margin-top: 3mm; padding-top: 2mm; }
              p, li { orphans: 3; widows: 3; }
            }
            """;

    public String render(ReliabilityReport report) {
        AvailabilityReport a = report.availability();
        String tone = a.sloMet() == null ? "warn" : a.sloMet() ? "good" : "bad";
        String decision = a.sloMet() == null ? "INSUFFICIENT_DATA" : a.sloMet() ? "MET" : "MISSED";
        StringBuilder html = new StringBuilder(96000);
        html.append("<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\">")
                .append("<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">")
                .append("<title>").append(escape(report.monitorName())).append(" · RCP reliability report</title>")
                .append("<style>").append(STYLES).append("</style></head><body><div class=\"report\">")
                .append("<header class=\"masthead\"><div class=\"brand\">")
                .append("<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><rect x=\".5\" y=\".5\" width=\"23\" height=\"23\" fill=\"#7c6cff\"/>")
                .append("<path d=\"M4.5 13h3.2l2-5.5 3.6 10 2.2-4.5h4\" fill=\"none\" stroke=\"#0a0a0a\" stroke-width=\"1.9\"/></svg>")
                .append("Reliability Control Plane</div><div class=\"edition\">SLO evidence report</div></header>")
                .append("<main><section class=\"intro\" aria-labelledby=\"report-title\"><p class=\"eyebrow\">Monitor reliability · UTC</p>")
                .append("<h1 id=\"report-title\">Reliability report</h1><h2 class=\"monitor\">").append(escape(report.monitorName()))
                .append("</h2><p class=\"target mono\">").append(escape(report.targetUrl())).append("</p><dl class=\"meta\">");
        item(html, "Observation window · end exclusive", a.from() + " → " + a.to());
        item(html, "Generated", report.generatedAt().toString());
        html.append("</dl></section><div class=\"decision\"><span class=\"tag ").append(tone).append("\">")
                .append(decision).append("</span><p>");
        if (a.sloMet() == null) {
            html.append("Insufficient evidence to judge this SLO. Observed availability is not an SLO pass.");
        } else {
            html.append(a.sloMet() ? "The observed SLO target was met." : "The observed SLO target was missed.");
        }
        html.append(" Coverage: ").append(percent(a.evidenceCoveragePercent())).append("; minimum: ")
                .append(percent(a.minimumEvidenceCoveragePercent())).append(".</p></div><section class=\"metrics\" aria-label=\"Headline metrics\">");
        metric(html, "Measured availability", number(a.measuredAvailabilityPercent()), "%",
                "Target " + percent(a.sloTargetPercent()) + " · conclusive checks only", tone);
        ReportErrorBudget budget = report.errorBudget();
        metric(html, "Error budget remaining", number(budget.remainingExecutions()), "executions",
                budget.remainingExecutions().signum() < 0 ? "Budget exceeded · observed checks" : "Observed checks · fractional allowance",
                a.sloMet() == null ? "warn" : budget.remainingExecutions().signum() < 0 ? "bad" : "good");
        html.append("<div class=\"metric latency\"><div class=\"eyebrow\">HTTP response latency</div><div class=\"readout\">");
        pair(html, report.latency().p50Ms() == null ? null : report.latency().p50Ms().toString(), "p50 ms");
        pair(html, report.latency().p95Ms() == null ? null : report.latency().p95Ms().toString(), "p95 ms");
        html.append("</div><p>").append(report.latency().sampleCount()).append(" HTTP samples");
        if (report.latency().p50Ms() == null) {
            html.append(" · INSUFFICIENT_SAMPLES (minimum ").append(report.latency().minimumSamples()).append(")");
        }
        html.append("</p></div>");
        long incidents = report.incidentTimeline().stream().map(ReportIncidentEvent::incidentId).distinct().count();
        metric(html, "Incidents in timeline", incidents + (report.incidentTimelineTruncated() ? "+" : ""), "",
                report.incidentTimelineTruncated() ? "Lower bound · timeline truncated" : "Distinct IDs in shown transitions", "");
        html.append("</section>");
        section(html, "01", "Availability & error budget", "Aggregates for this window");
        String availabilityFill = a.sloMet() == null ? "neutral" : tone;
        html.append("<div class=\"visuals\"><div class=\"visual\"><h3>Measured availability</h3>")
                .append("<p>UP ÷ (UP + DOWN). Inconclusive checks are excluded.</p>");
        meter(html, "availability-chart", "Measured availability " + percent(a.measuredAvailabilityPercent())
                + "; SLO target " + percent(a.sloTargetPercent()), a.measuredAvailabilityPercent(), a.sloTargetPercent(), availabilityFill);
        html.append("<div class=\"legend\"><span>Observed ").append(percent(a.measuredAvailabilityPercent()))
                .append("</span><span>Target ").append(percent(a.sloTargetPercent())).append("</span></div>")
                .append("<div class=\"coverage\"><h3>Evidence coverage</h3>");
        meter(html, "coverage-chart", "Evidence coverage " + percent(a.evidenceCoveragePercent())
                + "; minimum " + percent(a.minimumEvidenceCoveragePercent()), a.evidenceCoveragePercent(),
                a.minimumEvidenceCoveragePercent(), a.sloMet() == null ? "warn" : "neutral");
        html.append("<div class=\"legend\"><span>").append(percent(a.evidenceCoveragePercent()))
                .append(" coverage</span><span>").append(percent(a.minimumEvidenceCoveragePercent()))
                .append(" required</span></div></div></div><div class=\"visual\"><h3>Observed error budget</h3>")
                .append("<p>Allowance is based on conclusive executions, not elapsed downtime.</p>");
        budgetChart(html, budget);
        html.append("<div class=\"legend\"><span>Remaining ").append(budget.remainingExecutions().toPlainString())
                .append("</span><span>executions</span></div>");
        if (budget.allowedBadExecutions().signum() == 0) {
            html.append("<p class=\"coverage\">No failed executions allowed in the observed budget.</p>");
        }
        html.append("</div></div><dl class=\"facts\">");
        item(html, "UP / DOWN", a.upExecutions() + " / " + a.downExecutions());
        item(html, "Disagreement / no data", a.disagreementExecutions() + " / " + a.noDataExecutions());
        item(html, "Expected / pending / missing", a.expectedOpportunities() + " / " + a.pendingExecutions() + " / " + a.missingExecutions());
        item(html, "Conclusive / finalized", a.conclusiveExecutions() + " / " + a.totalFinalizedExecutions());
        html.append("</dl><p class=\"policy\">Denominator policy: <code>").append(escape(a.denominatorPolicy())).append("</code></p>");
        section(html, "02", "Incident timeline", report.incidentTimeline().size() + " transitions · UTC");
        if (report.incidentTimeline().isEmpty()) {
            html.append("<p class=\"empty\">No incident transitions recorded in this window. This does not rule out an incident opened earlier.</p>");
        } else {
            html.append("<div class=\"table-wrap\"><table><thead><tr><th scope=\"col\">Occurred at · UTC</th>")
                    .append("<th scope=\"col\">Transition</th><th scope=\"col\">Incident ID</th></tr></thead><tbody>");
            for (ReportIncidentEvent event : report.incidentTimeline()) {
                String eventTone = "OPENED".equals(event.eventType()) ? "bad" : "RESOLVED".equals(event.eventType()) ? "good" : "";
                html.append("<tr><td class=\"mono\">").append(escape(event.occurredAt().toString()))
                        .append("</td><td><span class=\"tag ").append(eventTone).append("\">").append(escape(event.eventType()))
                        .append("</span></td><td class=\"mono\">").append(escape(event.incidentId().toString())).append("</td></tr>");
            }
            html.append("</tbody></table></div>");
        }
        if (report.incidentTimelineTruncated()) {
            html.append("<p class=\"notice\">Incident timeline truncated at 100 transitions. The incident count is a lower bound.</p>");
        }
        section(html, "03", "Scope & limitations", "Read alongside the evidence");
        html.append("<ul class=\"limitations\">");
        for (String limitation : report.limitations()) {
            html.append("<li>").append(escape(limitation)).append("</li>");
        }
        html.append("</ul></main><footer><span class=\"mono\">Schema: ").append(escape(report.schemaVersion()))
                .append("</span><span>Source watermark: ").append(report.sourceDataWatermark() == null
                        ? "NO_SOURCE_DATA" : escape(report.sourceDataWatermark().toString()))
                .append("</span></footer></div></body></html>");
        return html.toString();
    }

    private static String fontFace(String family, String resource, String weight) {
        try (var in = ReliabilityReportHtmlRenderer.class.getResourceAsStream("/reporting/fonts/" + resource)) {
            if (in == null) {
                throw new IllegalStateException("Missing report font " + resource);
            }
            return "@font-face { font-family: \"" + family + "\"; font-weight: " + weight + "; font-style: normal; "
                    + "font-display: swap; src: url(data:font/woff2;base64,"
                    + java.util.Base64.getEncoder().encodeToString(in.readAllBytes()) + ") format(\"woff2\"); }\n";
        } catch (java.io.IOException e) {
            throw new java.io.UncheckedIOException(e);
        }
    }

    private void section(StringBuilder html, String index, String title, String note) {
        html.append("<div class=\"section-heading\"><span class=\"section-index\">").append(index)
                .append(" /</span><h2>").append(escape(title)).append("</h2><span class=\"section-note\">")
                .append(escape(note)).append("</span></div>");
    }

    private void metric(StringBuilder html, String label, String value, String unit, String note, String tone) {
        html.append("<div class=\"metric\"><div class=\"eyebrow\">").append(escape(label)).append("</div><div class=\"readout\">");
        pair(html, value, unit);
        html.append("</div><p>").append(escape(note)).append("</p></div>");
    }

    /** One headline figure in the dot font, with its unit beside it in small mono. */
    private void pair(StringBuilder html, String value, String unit) {
        html.append("<span class=\"pair\">");
        if (value == null) {
            html.append("<span class=\"empty-value\">—</span>");
        } else {
            html.append("<span class=\"figure\">").append(escape(value)).append("</span>");
        }
        if (!unit.isEmpty()) {
            html.append("<span class=\"unit\">").append(escape(unit)).append("</span>");
        }
        html.append("</span>");
    }

    private void meter(StringBuilder html, String id, String label, BigDecimal value,
                       BigDecimal marker, String fill) {
        html.append("<svg class=\"chart\" viewBox=\"0 0 440 14\" preserveAspectRatio=\"none\" role=\"img\" aria-labelledby=\"")
                .append(id).append("\"><title id=\"").append(id).append("\">").append(escape(label)).append("</title>")
                .append("<rect class=\"track\" x=\"0\" y=\"2\" width=\"440\" height=\"10\"/>")
                .append("<rect class=\"fill-").append(fill).append("\" x=\"0\" y=\"2\" width=\"")
                .append(width(value, HUNDRED)).append("\" height=\"10\"/>")
                .append("<path class=\"marker\" d=\"M").append(width(marker, HUNDRED)).append(" 0v14\"/></svg>");
    }

    private void budgetChart(StringBuilder html, ReportErrorBudget budget) {
        BigDecimal observed = BigDecimal.valueOf(budget.observedBadExecutions());
        BigDecimal allowed = budget.allowedBadExecutions();
        BigDecimal scale = allowed.max(observed);
        boolean exceeded = budget.remainingExecutions().signum() < 0;
        boolean nearly = !exceeded && allowed.signum() > 0 && observed.multiply(BigDecimal.valueOf(4)).compareTo(allowed.multiply(BigDecimal.valueOf(3))) >= 0;
        html.append("<div class=\"legend bar-head\"><span>Allowed</span><b>").append(allowed.toPlainString()).append("</b></div>");
        bar(html, "budget-allowed", "Allowed bad executions " + allowed.toPlainString(), allowed, scale, "neutral");
        html.append("<div class=\"legend bar-head\"><span>Observed down</span><b>").append(budget.observedBadExecutions()).append("</b></div>");
        bar(html, "budget-observed", "Observed bad executions " + budget.observedBadExecutions(), observed, scale,
                exceeded ? "bad" : nearly ? "warn" : "neutral");
    }

    private void bar(StringBuilder html, String id, String label, BigDecimal value, BigDecimal scale, String fill) {
        html.append("<svg class=\"chart\" viewBox=\"0 0 440 14\" preserveAspectRatio=\"none\" role=\"img\" aria-labelledby=\"")
                .append(id).append("\"><title id=\"").append(id).append("\">").append(escape(label)).append("</title>")
                .append("<rect class=\"track\" x=\"0\" y=\"2\" width=\"440\" height=\"10\"/>")
                .append("<rect class=\"fill-").append(fill).append("\" x=\"0\" y=\"2\" width=\"")
                .append(width(value, scale)).append("\" height=\"10\"/></svg>");
    }

    private String width(BigDecimal value, BigDecimal scale) {
        if (value == null || scale.signum() <= 0) {
            return "0";
        }
        return value.max(BigDecimal.ZERO).min(scale).multiply(BigDecimal.valueOf(440))
                .divide(scale, 3, RoundingMode.HALF_UP).stripTrailingZeros().toPlainString();
    }

    private void item(StringBuilder html, String label, String value) {
        html.append("<div><dt>").append(escape(label)).append("</dt><dd>")
                .append(escape(value)).append("</dd></div>");
    }

    private String number(BigDecimal value) {
        return value == null ? null : value.stripTrailingZeros().toPlainString();
    }

    private String percent(BigDecimal value) {
        return value == null ? "UNDEFINED" : value.toPlainString() + "%";
    }

    private String escape(String input) {
        return input.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
                .replace("\"", "&quot;").replace("'", "&#39;");
    }
}

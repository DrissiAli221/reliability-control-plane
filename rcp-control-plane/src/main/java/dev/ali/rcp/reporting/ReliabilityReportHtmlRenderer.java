package dev.ali.rcp.reporting;

import dev.ali.rcp.availability.AvailabilityReport;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;

@Component
public class ReliabilityReportHtmlRenderer {
    private static final BigDecimal HUNDRED = BigDecimal.valueOf(100);
    // Five columns by seven rows: offline readouts share the dashboard's dot-matrix identity.
    private static final String[] DIGITS = {
            "01110/10001/10011/10101/11001/10001/01110",
            "00100/01100/00100/00100/00100/00100/01110",
            "01110/10001/00001/00010/00100/01000/11111",
            "11110/00001/00001/01110/00001/00001/11110",
            "00010/00110/01010/10010/11111/00010/00010",
            "11111/10000/10000/11110/00001/00001/11110",
            "01110/10000/10000/11110/10001/10001/01110",
            "11111/00001/00010/00100/01000/01000/01000",
            "01110/10001/10001/01110/10001/10001/01110",
            "01110/10001/10001/01111/00001/00001/01110"
    };
    private static final String STYLES = """
            :root { color-scheme: dark; --bg: #0a0a0a; --surface: #111111; --text: #ededed;
              --muted: #a1a1a1; --border: #292929; --track: #292929; --accent: #b4abff;
              --good: #4cc38a; --bad: #ff6369; --warn: #ffb54d; --neutral: #858585; }
            * { box-sizing: border-box; }
            body { margin: 0; background: var(--bg); color: var(--text);
              font: 14px/1.5 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
            .report { max-width: 1120px; margin: 0 auto; padding: 40px 40px 28px; }
            .mono, .eyebrow, dt, th, .tag, .section-index { font-family: ui-monospace, "SFMono-Regular", Consolas, monospace; }
            .eyebrow, dt, th, .section-index { font-size: 10px; letter-spacing: .09em; text-transform: uppercase; }
            .eyebrow { color: var(--muted); margin: 0 0 10px; }
            .masthead { display: flex; align-items: center; justify-content: space-between; gap: 16px;
              padding-bottom: 22px; border-bottom: 1px solid var(--border); }
            .brand { display: flex; align-items: center; gap: 10px; font-weight: 600; font-size: 13px; }
            .brand svg { width: 26px; height: 26px; flex: none; }
            .edition { color: var(--muted); font-size: 11px; }
            .intro { margin: 28px 0 22px; }
            h1 { margin: 0 0 20px; font-size: clamp(30px, 5vw, 48px); font-weight: 600; line-height: 1.08; letter-spacing: -.04em; }
            h2 { font-size: 16px; font-weight: 600; margin: 0; letter-spacing: -.02em; }
            .monitor { font-size: 20px; overflow-wrap: anywhere; }
            .target { color: var(--muted); font-size: 12px; margin: 5px 0 18px; overflow-wrap: anywhere; }
            .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 0; }
            dt { color: var(--muted); margin-bottom: 4px; } dd { margin: 0; overflow-wrap: anywhere; }
            .meta dd { font-size: 11px; }
            .decision { display: flex; align-items: flex-start; gap: 14px; padding: 14px 16px;
              border: 1px solid var(--border); background: var(--surface); margin-bottom: 18px; }
            .decision p { margin: 0; color: var(--muted); font-size: 12px; }
            .tag { display: inline-flex; align-items: center; gap: 7px; font-size: 10px;
              letter-spacing: .04em; white-space: nowrap; color: var(--text); }
            .tag::before { content: ""; width: 6px; height: 6px; background: currentColor; border-radius: 50%; }
            .good { color: var(--good); } .bad { color: var(--bad); } .warn { color: var(--warn); }
            .metrics { display: grid; grid-template-columns: 1.4fr 1.1fr 1fr .85fr; border: 1px solid var(--border); }
            .metric { padding: 18px; min-width: 0; background: var(--surface); }
            .metric + .metric { border-left: 1px solid var(--border); }
            .readout { display: flex; align-items: center; gap: 7px; min-height: 44px; margin: 10px 0 8px; }
            .digits { display: block; height: 34px; max-width: 100%; min-width: 0; width: auto; fill: currentColor; }
            .unit { font-size: 11px; color: var(--muted); flex-shrink: 0; }
            .metric p { margin: 0; font-size: 11px; color: var(--muted); }
            .latency .readout { min-height: 25px; margin: 7px 0; } .latency .digits { height: 23px; max-width: 70%; }
            .empty-value { font: 26px/1.2 ui-monospace, monospace; color: var(--muted); }
            .section-heading { display: flex; align-items: baseline; gap: 12px; margin: 28px 0 12px; }
            .section-index { color: var(--accent); }
            .section-note { margin-left: auto; color: var(--muted); font-size: 11px; }
            .visuals { display: grid; grid-template-columns: 1fr 1fr; border: 1px solid var(--border); }
            .visual { min-width: 0; padding: 18px; } .visual + .visual { border-left: 1px solid var(--border); }
            .visual h3 { margin: 0 0 4px; font-size: 13px; font-weight: 500; }
            .visual p { color: var(--muted); font-size: 11px; margin: 0; }
            .chart { display: block; width: 100%; height: auto; margin: 18px 0 10px; overflow: visible; }
            .track { fill: var(--track); } .fill-good { fill: var(--good); } .fill-bad { fill: var(--bad); }
            .fill-warn { fill: var(--warn); } .fill-neutral { fill: var(--neutral); }
            .marker { stroke: var(--text); stroke-width: 2; } .chart-label { fill: var(--muted); font: 10px ui-monospace, monospace; }
            .legend { display: flex; justify-content: space-between; gap: 10px; font-size: 11px; }
            .coverage { margin: 16px 0 0; } .coverage .chart { margin: 9px 0 6px; }
            .facts { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px;
              padding: 18px 0; border-bottom: 1px solid var(--border); margin: 0; }
            .facts dd { font-family: ui-monospace, monospace; font-size: 14px; }
            .policy { margin: 10px 0 0; color: var(--muted); font-size: 11px; overflow-wrap: anywhere; }
            .policy code { color: var(--text); }
            table { border-collapse: collapse; width: 100%; font-size: 12px; }
            th { color: var(--muted); text-align: left; font-weight: 400; }
            th, td { border-bottom: 1px solid var(--border); padding: 10px 12px; vertical-align: top; }
            th:first-child, td:first-child { padding-left: 0; } td.mono { font-size: 10px; overflow-wrap: anywhere; }
            .table-wrap { overflow-x: auto; }
            .empty { margin: 0; padding: 18px 0; color: var(--muted); border-bottom: 1px solid var(--border); font-size: 12px; }
            .notice { color: var(--warn); font-size: 12px; }
            .limitations { font-size: 11px; color: var(--muted); padding-left: 16px; margin: 0; }
            .limitations li { padding-left: 3px; margin: 4px 0; }
            footer { border-top: 1px solid var(--border); margin-top: 24px; padding-top: 12px;
              display: flex; justify-content: space-between; gap: 12px; color: var(--muted); font-size: 10px; overflow-wrap: anywhere; }
            @media (max-width: 700px) {
              .report { padding: 24px 20px; } .metrics { grid-template-columns: 1fr 1fr; }
              .metric:nth-child(3) { border-left: 0; } .metric:nth-child(n+3) { border-top: 1px solid var(--border); }
              .visuals { grid-template-columns: 1fr; } .visual + .visual { border-left: 0; border-top: 1px solid var(--border); }
              .facts { grid-template-columns: 1fr 1fr; } .meta { grid-template-columns: 1fr; }
              .section-note { display: none; } .decision, footer { flex-wrap: wrap; } .edition { text-align: right; }
            }
            @page { size: A4; margin: 12mm; }
            @media print {
              :root { color-scheme: light; --bg: #fff; --surface: #fff; --text: #151515;
                --muted: #555; --border: #ccc; --track: #e4e4e7; --accent: #5142a8;
                --good: #17643e; --bad: #b0202a; --warn: #87520a; --neutral: #777; }
              body { font-size: 9pt; } .report { max-width: none; padding: 0; }
              .masthead { padding-bottom: 3mm; } .brand { font-size: 9pt; } .brand svg { width: 20px; height: 20px; }
              .intro { margin: 4mm 0 3mm; } h1 { font-size: 26pt; margin-bottom: 3mm; }
              .monitor { font-size: 13pt; } .target { margin-bottom: 3mm; font-size: 8pt; }
              .meta { grid-template-columns: 1fr 1fr; gap: 3mm; } .meta dd { font-size: 7pt; }
              .decision { padding: 3mm; margin-bottom: 3mm; flex-wrap: nowrap; }
              .decision p, .metric p, .visual p, .legend, .policy { font-size: 7pt; }
              .metrics { grid-template-columns: 1.4fr 1.1fr 1fr .85fr; }
              .metric { padding: 3mm; } .metric:nth-child(3) { border-left: 1px solid var(--border); }
              .metric:nth-child(n+3) { border-top: 0; } .readout { min-height: 28px; margin: 6px 0; }
              .digits { height: 26px; } .latency .readout { min-height: 18px; margin: 3px 0; } .latency .digits { height: 17px; }
              .visuals { grid-template-columns: 1fr 1fr; } .visual { padding: 3mm; }
              .visual + .visual { border-left: 1px solid var(--border); border-top: 0; }
              .chart { margin: 3mm 0 2mm; } .coverage { margin-top: 3mm; }
              .coverage .chart { margin: 2mm 0 1mm; }
              .section-heading { margin: 3mm 0 2mm; break-after: avoid; } h2 { font-size: 10pt; }
              .section-note { display: block; font-size: 7pt; } dt, th, .eyebrow, .section-index { font-size: 6pt; }
              .facts { grid-template-columns: repeat(4, 1fr); padding: 2mm 0; gap: 3mm; } .facts dd { font-size: 8pt; }
              .table-wrap { overflow: visible; } table { font-size: 8pt; } td.mono { font-size: 6.5pt; }
              th, td { padding: 1.5mm; } thead { display: table-header-group; } tr { break-inside: avoid; }
              .masthead, .intro, .decision, .metrics, .visuals, .facts { break-inside: avoid; }
              .empty, .notice { font-size: 8pt; } .limitations { font-size: 7pt; }
              .limitations li { margin: 1mm 0; } footer { margin-top: 3mm; padding-top: 2mm; font-size: 6pt; }
              p, li { orphans: 3; widows: 3; }
            }
            """;

    public String render(ReliabilityReport report) {
        AvailabilityReport a = report.availability();
        String tone = a.sloMet() == null ? "warn" : a.sloMet() ? "good" : "bad";
        String decision = a.sloMet() == null ? "INSUFFICIENT_DATA" : a.sloMet() ? "MET" : "MISSED";
        StringBuilder html = new StringBuilder(24000);
        html.append("<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\">")
                .append("<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">")
                .append("<title>").append(escape(report.monitorName())).append(" · RCP reliability report</title>")
                .append("<style>").append(STYLES).append("</style></head><body><div class=\"report\">")
                .append("<header class=\"masthead\"><div class=\"brand\">")
                .append("<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><rect x=\".5\" y=\".5\" width=\"23\" height=\"23\" fill=\"#7c6cff\"/>")
                .append("<path d=\"M4.5 13h3.2l2-5.5 3.6 10 2.2-4.5h4\" fill=\"none\" stroke=\"#0a0a0a\" stroke-width=\"1.9\"/></svg>")
                .append("Reliability Control Plane</div><div class=\"edition mono\">SLO / EVIDENCE REPORT</div></header>")
                .append("<main><section class=\"intro\" aria-labelledby=\"report-title\"><p class=\"eyebrow\">Monitor reliability / UTC</p>")
                .append("<h1 id=\"report-title\">Reliability report.</h1><h2 class=\"monitor\">").append(escape(report.monitorName()))
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
        html.append("<div class=\"metric latency\"><div class=\"eyebrow\">HTTP response latency</div>");
        readout(html, report.latency().p50Ms() == null ? null : report.latency().p50Ms().toString(), "p50 ms", "");
        readout(html, report.latency().p95Ms() == null ? null : report.latency().p95Ms().toString(), "p95 ms", "");
        html.append("<p>").append(report.latency().sampleCount()).append(" HTTP samples");
        if (report.latency().p50Ms() == null) {
            html.append(" · INSUFFICIENT_SAMPLES (minimum ").append(report.latency().minimumSamples()).append(")");
        }
        html.append("</p></div>");
        long incidents = report.incidentTimeline().stream().map(ReportIncidentEvent::incidentId).distinct().count();
        metric(html, "Incidents in timeline", incidents + (report.incidentTimelineTruncated() ? "+" : ""), "",
                report.incidentTimelineTruncated() ? "Lower bound · timeline truncated" : "Distinct IDs in shown transitions", "");
        html.append("</section>");
        section(html, "01", "Availability & error budget", "Aggregates for this window");
        html.append("<div class=\"visuals\"><div class=\"visual\"><h3>Measured availability</h3>")
                .append("<p>UP ÷ (UP + DOWN). Inconclusive checks are excluded.</p>");
        meter(html, "availability-chart", "Measured availability " + percent(a.measuredAvailabilityPercent())
                + "; SLO target " + percent(a.sloTargetPercent()), a.measuredAvailabilityPercent(), a.sloTargetPercent(), tone, true);
        html.append("<div class=\"legend mono\"><span>Observed ").append(percent(a.measuredAvailabilityPercent()))
                .append("</span><span>Target ").append(percent(a.sloTargetPercent())).append("</span></div>")
                .append("<div class=\"coverage\"><h3>Evidence coverage</h3>");
        meter(html, "coverage-chart", "Evidence coverage " + percent(a.evidenceCoveragePercent())
                + "; minimum " + percent(a.minimumEvidenceCoveragePercent()), a.evidenceCoveragePercent(),
                a.minimumEvidenceCoveragePercent(), a.sloMet() == null ? "warn" : "good", false);
        html.append("<div class=\"legend mono\"><span>").append(percent(a.evidenceCoveragePercent()))
                .append(" coverage</span><span>").append(percent(a.minimumEvidenceCoveragePercent()))
                .append(" required</span></div></div></div><div class=\"visual\"><h3>Observed error budget</h3>")
                .append("<p>Allowance is based on conclusive executions, not elapsed downtime.</p>");
        budgetChart(html, budget);
        html.append("<div class=\"legend mono\"><span>Remaining ").append(budget.remainingExecutions().toPlainString())
                .append("</span><span>executions</span></div>");
        if (budget.allowedBadExecutions().signum() == 0) {
            html.append("<p class=\"coverage\">No failed executions allowed in the observed budget.</p>");
        }
        html.append("</div></div><dl class=\"facts\">");
        item(html, "UP / DOWN", a.upExecutions() + " / " + a.downExecutions());
        item(html, "DISAGREEMENT / NO_DATA", a.disagreementExecutions() + " / " + a.noDataExecutions());
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

    private void section(StringBuilder html, String index, String title, String note) {
        html.append("<div class=\"section-heading\"><span class=\"section-index\">").append(index)
                .append(" /</span><h2>").append(escape(title)).append("</h2><span class=\"section-note\">")
                .append(escape(note)).append("</span></div>");
    }

    private void metric(StringBuilder html, String label, String value, String unit, String note, String tone) {
        html.append("<div class=\"metric\"><div class=\"eyebrow\">").append(escape(label)).append("</div>");
        readout(html, value, unit, tone);
        html.append("<p>").append(escape(note)).append("</p></div>");
    }

    private void readout(StringBuilder html, String value, String unit, String tone) {
        html.append("<div class=\"readout ").append(tone).append("\">");
        if (value == null) {
            html.append("<span class=\"empty-value\">—</span>");
        } else {
            String label = value + (unit.isEmpty() || "%".equals(unit) ? unit : " " + unit);
            html.append("<svg class=\"digits\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 ")
                    .append(value.length() * 24 - 4).append(" 28\" role=\"img\" aria-label=\"").append(escape(label))
                    .append("\"><title>").append(escape(label)).append("</title>");
            for (int i = 0; i < value.length(); i++) {
                char digit = value.charAt(i);
                String pattern = switch (digit) {
                    case '.' -> "00000/00000/00000/00000/00000/00100/00100";
                    case '-' -> "00000/00000/00000/11111/00000/00000/00000";
                    case '+' -> "00000/00100/00100/11111/00100/00100/00000";
                    default -> DIGITS[digit - '0'];
                };
                String cells = pattern.replace("/", "");
                for (int cell = 0; cell < cells.length(); cell++) {
                    if (cells.charAt(cell) == '1') {
                        html.append("<circle cx=\"").append(i * 24 + cell % 5 * 4 + 2)
                                .append("\" cy=\"").append(cell / 5 * 4 + 2).append("\" r=\"1.35\"/>");
                    }
                }
            }
            html.append("</svg>");
        }
        html.append("<span class=\"unit mono\">").append(escape(unit)).append("</span></div>");
    }

    private void meter(StringBuilder html, String id, String label, BigDecimal value,
                       BigDecimal marker, String tone, boolean axis) {
        html.append("<svg class=\"chart\" viewBox=\"0 0 440 ").append(axis ? "42" : "18")
                .append("\" role=\"img\" aria-labelledby=\"").append(id).append("\"><title id=\"")
                .append(id).append("\">").append(escape(label)).append("</title>")
                .append("<rect class=\"track\" x=\"0\" y=\"4\" width=\"440\" height=\"10\"/>")
                .append("<rect class=\"fill-").append(tone.isEmpty() ? "neutral" : tone)
                .append("\" x=\"0\" y=\"4\" width=\"").append(width(value, HUNDRED)).append("\" height=\"10\"/>")
                .append("<path class=\"marker\" d=\"M").append(width(marker, HUNDRED)).append(" 0v18\"/>");
        if (axis) {
            html.append("<text class=\"chart-label\" x=\"0\" y=\"34\">0%</text>")
                    .append("<text class=\"chart-label\" x=\"440\" y=\"34\" text-anchor=\"end\">100%</text>");
        }
        html.append("</svg>");
    }

    private void budgetChart(StringBuilder html, ReportErrorBudget budget) {
        BigDecimal observed = BigDecimal.valueOf(budget.observedBadExecutions());
        BigDecimal scale = budget.allowedBadExecutions().max(observed);
        html.append("<svg class=\"chart\" viewBox=\"0 0 440 108\" role=\"img\" aria-labelledby=\"budget-chart\">")
                .append("<title id=\"budget-chart\">Allowed bad executions ").append(budget.allowedBadExecutions().toPlainString())
                .append("; observed bad executions ").append(budget.observedBadExecutions()).append("</title>")
                .append("<text class=\"chart-label\" x=\"0\" y=\"10\">ALLOWED · ").append(budget.allowedBadExecutions().toPlainString())
                .append("</text><rect class=\"track\" y=\"22\" width=\"440\" height=\"12\"/>")
                .append("<rect class=\"fill-neutral\" y=\"22\" width=\"").append(width(budget.allowedBadExecutions(), scale))
                .append("\" height=\"12\"/><text class=\"chart-label\" x=\"0\" y=\"62\">OBSERVED DOWN · ")
                .append(budget.observedBadExecutions()).append("</text><rect class=\"track\" y=\"74\" width=\"440\" height=\"12\"/>")
                .append("<rect class=\"fill-").append(budget.remainingExecutions().signum() < 0 ? "bad" : "good")
                .append("\" y=\"74\" width=\"").append(width(observed, scale)).append("\" height=\"12\"/></svg>");
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

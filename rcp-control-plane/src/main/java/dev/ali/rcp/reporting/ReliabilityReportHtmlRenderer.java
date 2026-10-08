package dev.ali.rcp.reporting;

import dev.ali.rcp.availability.AvailabilityReport;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.Locale;
import java.util.UUID;

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
            body { margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; background: var(--bg); color: var(--text); font-family: var(--font-sans);
              font-size: 13px; font-weight: 400; line-height: 1.5; letter-spacing: 0;
              -webkit-font-smoothing: antialiased; font-synthesis: none; }
            h1, h2, h3, p, dl, dd { margin: 0; }
            .report { max-width: 880px; margin: 0 auto; padding: 48px 40px 32px; }
            .mono, .eyebrow, dt, th, .tag, .chip, .unit, .readout-row, .summary, .meta-line, .edition, footer { font-family: var(--font-mono); }
            h1 { font-size: 32px; font-weight: 600; line-height: 1.15; letter-spacing: -.02em; overflow-wrap: anywhere; }
            .figure, .empty-value { font-family: var(--font-dots); font-size: 28px; font-weight: 800; line-height: 1;
              letter-spacing: 0; color: var(--text); font-variant-numeric: tabular-nums; }
            h2, h3, .brand { font-size: 15px; font-weight: 500; line-height: 1.3; letter-spacing: -.01em; }
            .eyebrow, dt, th, .section-note, .unit, .readout-row, .summary, .chip, .edition, footer {
              font-size: 11px; font-weight: 400; letter-spacing: .04em; color: var(--text-3); }
            .masthead { display: flex; align-items: center; justify-content: space-between; gap: 16px;
              padding-bottom: 22px; border-bottom: 1px solid var(--border); }
            .brand { display: flex; align-items: center; gap: 10px; }
            .brand svg { width: 26px; height: 26px; flex: none; }
            /* The subject is the title, as on the monitor page: name and verdict chip, then target and one meta line. */
            .intro { margin: 40px 0 24px; }
            .title-row { display: flex; align-items: center; flex-wrap: wrap; gap: 10px 14px; }
            .chip { display: inline-flex; align-items: center; gap: 7px; height: 24px; padding: 0 9px; white-space: nowrap;
              border: 1px solid var(--border); background: var(--surface); color: var(--text); }
            .chip.good { color: var(--green-text); border-color: color-mix(in srgb, var(--green) 35%, var(--border)); }
            .chip.bad { color: var(--red-text); border-color: color-mix(in srgb, var(--red) 35%, var(--border)); }
            .chip.warn { color: var(--amber-text); border-color: color-mix(in srgb, var(--amber) 35%, var(--border)); }
            .target { color: var(--text-2); margin: 8px 0 6px; overflow-wrap: anywhere; }
            .meta-line { display: flex; flex-wrap: wrap; gap: 4px 10px; color: var(--text-2); }
            .meta-line .sep { color: var(--text-3); }
            dt { margin-bottom: 4px; } dd { overflow-wrap: anywhere; }
            /* Every module below the intro touches the next and shares its hairline, like the dashboard's stack. */
            .stack > * + * { margin-top: -1px; }
            .decision { padding: 14px 16px; border: 1px solid var(--border); background: var(--surface); }
            .decision p { color: var(--text-2); }
            .tag { display: inline-flex; align-items: center; gap: 7px; white-space: nowrap; color: var(--text); }
            /* Status marker: a 3x3 dot-matrix block, the same shape as the dashboard's StatusDot (9px). */
            .status-dot { --dot-size: 2px; --dot-gap: 1.5px; --dot-color: var(--text-3); display: inline-grid;
              grid-template-columns: repeat(3, var(--dot-size)); gap: var(--dot-gap); flex: none; }
            .status-dot i { width: var(--dot-size); height: var(--dot-size); border-radius: 50%; background: var(--dot-color); }
            .status-dot.good { --dot-color: var(--green); } .status-dot.bad { --dot-color: var(--red); }
            .status-dot.warn { --dot-color: var(--amber); }
            /* A faint status light falling from the top edge; neutral modules get none. */
            .lit[data-tone="good"] { --hue: var(--green); } .lit[data-tone="bad"] { --hue: var(--red); }
            .lit[data-tone="warn"] { --hue: var(--amber); }
            .lit[data-tone] { background: linear-gradient(180deg, color-mix(in srgb, var(--hue) var(--light-fall), transparent) 0%,
              transparent 55%), var(--surface); }
            .good { color: var(--green-text); } .bad { color: var(--red-text); } .warn { color: var(--amber-text); }
            .figure.good, .figure.bad, .figure.warn { color: var(--text); }
            /* Modules touch: the 1px grid gap shows the container's hairline colour, so dividers survive any wrap. */
            .metrics, .visuals, .facts { display: grid; gap: 1px; border: 1px solid var(--border); background: var(--border); }
            .metrics { grid-template-columns: repeat(4, minmax(0, 1fr)); }
            .metric { padding: 18px; min-width: 0; background: var(--surface); }
            .readout { display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px 18px; margin: 12px 0 10px; }
            .readout span.pair { display: inline-flex; align-items: baseline; gap: 7px; }
            .metric p { color: var(--text-3); }
            .panel { border: 1px solid var(--border); background: var(--surface); }
            .panel-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 49px;
              padding: 10px 16px; border-bottom: 1px solid var(--border); }
            .panel .visuals, .panel .facts { border: 0; margin: 0; }
            .visuals { grid-template-columns: 1fr 1fr; border-bottom: 1px solid var(--border) !important; }
            .visual { min-width: 0; padding: 18px 16px; background: var(--surface); }
            .visual h3 { margin-bottom: 4px; }
            .visual p { color: var(--text-2); }
            /* Readouts: quiet label, bright value, the reference on the right; then a segmented meter. */
            .readout-row { display: flex; justify-content: space-between; gap: 10px; margin-top: 18px; }
            .readout-row b { font-weight: 400; color: var(--text); }
            .cells { position: relative; display: grid; grid-template-columns: repeat(20, minmax(0, 1fr)); gap: 1px;
              height: 12px; margin-top: 8px; }
            .cells i { position: relative; overflow: hidden; background: var(--track); }
            .cells i b { position: absolute; top: 0; bottom: 0; left: 0; background: var(--fill); }
            .cells i.full { background: var(--fill); }
            .cells.fill-good { --fill: var(--green); } .cells.fill-bad { --fill: var(--red); }
            .cells.fill-warn { --fill: var(--amber); } .cells.fill-neutral { --fill: var(--text-2); }
            .cells-mark { position: absolute; top: -4px; bottom: -4px; width: 2px; margin-left: -1px; background: var(--text); }
            .summary { margin-top: 16px; } .summary + .summary { margin-top: 4px; }
            .facts { grid-template-columns: repeat(4, minmax(0, 1fr)); margin: -1px 0 0; }
            .facts > div { padding: 12px 16px; background: var(--surface); }
            .facts dd { font-family: var(--font-mono); }
            table { border-collapse: collapse; width: 100%; }
            th { text-align: left; background: var(--surface-2); }
            th, td { border-bottom: 1px solid var(--border); padding: 10px 16px; vertical-align: middle; }
            tbody tr:last-child td { border-bottom: 0; } td.mono { overflow-wrap: anywhere; }
            .table-wrap { overflow-x: auto; }
            .empty { padding: 18px 16px; color: var(--text-2); }
            .notice { color: var(--amber-text); padding: 10px 16px; border-top: 1px solid var(--border); }
            .limitations { color: var(--text-2); padding: 14px 16px 14px 32px; margin: 0; }
            .limitations li { padding-left: 3px; margin: 4px 0; }
            footer { border-top: 1px solid var(--border); margin-top: 24px; padding-top: 12px;
              display: flex; justify-content: space-between; gap: 12px; overflow-wrap: anywhere; }
            @media (max-width: 700px) {
              .report { padding: 24px 20px; } .metrics { grid-template-columns: 1fr 1fr; }
              .visuals { grid-template-columns: 1fr; }
              .facts { grid-template-columns: 1fr 1fr; }
              .section-note { display: none; } footer { flex-wrap: wrap; } .edition { text-align: right; }
            }
            @page { size: A4; margin: 12mm; }
            @media print {
              :root { color-scheme: light; """ + LIGHT_TOKENS + """
                --bg: #ffffff; }
              body { font-size: 9pt; } .report { max-width: none; padding: 0; }
              .masthead { padding-bottom: 3mm; } .brand svg { width: 20px; height: 20px; }
              .intro { margin: 6mm 0 4mm; } h1 { font-size: 22pt; }
              .figure, .empty-value { font-size: 18pt; }
              h2, h3, .brand { font-size: 10.5pt; }
              .eyebrow, dt, th, .section-note, .unit, .readout-row, .summary, .chip, .edition, footer { font-size: 7.5pt; }
              .target { margin: 2mm 0 1mm; }
              .decision { padding: 3mm; } .panel-header { min-height: 0; padding: 2mm 3mm; } .stack { margin-top: 4mm; }
              .metric { padding: 3mm; } .readout { margin: 3mm 0 2mm; }
              .visual { padding: 3mm; }
              .readout-row { margin-top: 3mm; } .cells { height: 2.5mm; margin-top: 1.5mm; } .summary { margin-top: 3mm; }
              .panel-header { break-after: avoid; } .limitations { padding: 3mm 3mm 3mm 7mm; }
              .facts > div { padding: 2mm 3mm; }
              .table-wrap { overflow: visible; }
              th, td { padding: 1.5mm; } thead { display: table-header-group; } tr { break-inside: avoid; }
              .masthead, .intro, .decision, .metric, .metrics, .visual, .visuals, .facts, .facts > div, .cells { break-inside: avoid; }
              .limitations li { margin: 1mm 0; } footer { margin-top: 3mm; padding-top: 2mm; }
              p, li { orphans: 3; widows: 3; }
            }
            """;

    public String render(ReliabilityReport report) {
        AvailabilityReport a = report.availability();
        String tone = a.sloMet() == null ? "warn" : a.sloMet() ? "good" : "bad";
        String decision = a.sloMet() == null ? "NO VERDICT" : a.sloMet() ? "MET" : "MISSED";
        StringBuilder html = new StringBuilder(96000);
        html.append("<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\">")
                .append("<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">")
                .append("<title>").append(escape(report.monitorName())).append(" · RCP reliability report</title>")
                .append("<style>").append(STYLES).append("</style></head><body><div class=\"report\">")
                .append("<header class=\"masthead\"><div class=\"brand\">")
                .append("<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><rect x=\".5\" y=\".5\" width=\"23\" height=\"23\" fill=\"#7c6cff\"/>")
                .append("<path d=\"M4.5 13h3.2l2-5.5 3.6 10 2.2-4.5h4\" fill=\"none\" stroke=\"#0a0a0a\" stroke-width=\"1.9\"/></svg>")
                .append("Reliability Control Plane</div><div class=\"edition\">Reliability report</div></header>")
                // Like the monitor page: name and verdict chip on one row, then the target and one quiet meta line.
                .append("<main><section class=\"intro\" aria-labelledby=\"report-title\"><div class=\"title-row\">")
                .append("<h1 id=\"report-title\">").append(escape(report.monitorName())).append("</h1><span class=\"chip ")
                .append(tone).append("\">");
        dot(html, tone);
        html.append(decision).append("</span></div><p class=\"target mono\">").append(escape(report.targetUrl()))
                .append("</p><p class=\"meta-line\"><span data-from=\"").append(a.from()).append("\" data-to=\"").append(a.to())
                .append("\" title=\"").append(a.from()).append(" → ").append(a.to()).append("\">").append(window(a.from(), a.to()))
                .append("</span><span class=\"sep\">·</span><span>").append(span(a.from(), a.to()))
                .append("</span><span class=\"sep\">·</span><span data-value=\"").append(report.generatedAt()).append("\" title=\"")
                .append(report.generatedAt()).append("\">Generated ").append(dateTime(report.generatedAt())).append("</span></p></section>")
                .append("<div class=\"stack\"><div class=\"decision lit\" data-tone=\"").append(tone).append("\"><p>");
        if (a.sloMet() == null) {
            html.append("Insufficient evidence to judge this SLO. Observed availability is not an SLO pass.");
        } else {
            html.append(a.sloMet() ? "The observed SLO target was met." : "The observed SLO target was missed.");
        }
        html.append(" Coverage: ").append(percent(a.evidenceCoveragePercent())).append("; minimum: ")
                .append(given(a.minimumEvidenceCoveragePercent())).append(".</p></div><section class=\"metrics\" aria-label=\"Headline metrics\">");
        metric(html, "Measured availability", fixed(a.measuredAvailabilityPercent(), 2), "%",
                "Target " + given(a.sloTargetPercent()) + " · conclusive checks only", tone,
                a.measuredAvailabilityPercent() == null ? null : a.measuredAvailabilityPercent().toPlainString());
        ReportErrorBudget budget = report.errorBudget();
        boolean overspent = budget.remainingExecutions().signum() < 0;
        // An overspent budget reads as how far over it is, never as a negative count of checks left.
        metric(html, "Error budget",
                oneDecimal(overspent ? budget.remainingExecutions().negate() : budget.remainingExecutions()),
                overspent ? checks(budget.remainingExecutions().negate()) + " over budget"
                        : "of " + oneDecimal(budget.allowedBadExecutions()) + " checks left",
                overspent ? "Budget exceeded · " + oneDecimal(budget.allowedBadExecutions()) + " allowed"
                        : "Observed checks · fractional allowance",
                a.sloMet() == null ? "warn" : overspent ? "bad" : "good",
                budget.remainingExecutions().toPlainString() + " of " + budget.allowedBadExecutions().toPlainString());
        html.append("<div class=\"metric latency\"><div class=\"eyebrow\">HTTP response latency</div><div class=\"readout\">");
        pair(html, report.latency().p50Ms() == null ? null : report.latency().p50Ms().toString(), "p50 ms", null);
        pair(html, report.latency().p95Ms() == null ? null : report.latency().p95Ms().toString(), "p95 ms", null);
        html.append("</div><p>").append(report.latency().sampleCount()).append(" HTTP samples");
        if (report.latency().p50Ms() == null) {
            html.append(" · not enough to compute (minimum ").append(report.latency().minimumSamples()).append(")");
        }
        html.append("</p></div>");
        long incidents = report.incidentTimeline().stream().map(ReportIncidentEvent::incidentId).distinct().count();
        metric(html, "Incidents in timeline", incidents + (report.incidentTimelineTruncated() ? "+" : ""), "",
                report.incidentTimelineTruncated() ? "Lower bound · timeline truncated" : "Distinct IDs in shown transitions", "", null);
        html.append("</section>");

        panel(html, "Availability and error budget", "Aggregates for this window");
        String availabilityFill = a.sloMet() == null ? "neutral" : tone;
        html.append("<div class=\"visuals\"><div class=\"visual\"><h3>Measured availability</h3>")
                .append("<p title=\"").append(escape(a.denominatorPolicy())).append("\">Counted as ")
                .append(escape(denominator(a.denominatorPolicy()))).append(". Inconclusive checks are excluded.</p>");
        readout(html, "Observed", percent(a.measuredAvailabilityPercent()), "Target", given(a.sloTargetPercent()));
        cells(html, "availability", "Measured availability " + percent(a.measuredAvailabilityPercent())
                + "; SLO target " + given(a.sloTargetPercent()), a.measuredAvailabilityPercent(), HUNDRED, availabilityFill,
                a.sloTargetPercent());
        readout(html, "Coverage", percent(a.evidenceCoveragePercent()), "Required", given(a.minimumEvidenceCoveragePercent()));
        cells(html, "coverage", "Evidence coverage " + percent(a.evidenceCoveragePercent())
                + "; minimum " + given(a.minimumEvidenceCoveragePercent()), a.evidenceCoveragePercent(), HUNDRED,
                a.sloMet() == null ? "warn" : "neutral", a.minimumEvidenceCoveragePercent());
        html.append("</div><div class=\"visual\"><h3>Observed error budget</h3>")
                .append("<p>Allowance is based on conclusive executions, not elapsed downtime.</p>");
        budgetMeters(html, budget);
        html.append("<p class=\"summary\" title=\"").append(budget.remainingExecutions().toPlainString())
                .append("\">").append(budgetSentence(budget)).append(" · conclusive checks</p>");
        if (budget.allowedBadExecutions().signum() == 0) {
            html.append("<p class=\"summary\">No failed executions allowed in the observed budget.</p>");
        }
        html.append("</div></div><dl class=\"facts\">");
        item(html, "UP / DOWN", a.upExecutions() + " / " + a.downExecutions());
        item(html, "Disagreement / no data", a.disagreementExecutions() + " / " + a.noDataExecutions());
        item(html, "Expected / pending / missing", a.expectedOpportunities() + " / " + a.pendingExecutions() + " / " + a.missingExecutions());
        item(html, "Conclusive / finalized", a.conclusiveExecutions() + " / " + a.totalFinalizedExecutions());
        html.append("</dl></section>");

        panel(html, "Incident timeline", report.incidentTimeline().size() + " transitions · UTC");
        if (report.incidentTimeline().isEmpty()) {
            html.append("<p class=\"empty\">No incident transitions recorded in this window. This does not rule out an incident opened earlier.</p>");
        } else {
            html.append("<div class=\"table-wrap\"><table><thead><tr><th scope=\"col\">Occurred at · UTC</th>")
                    .append("<th scope=\"col\">Transition</th><th scope=\"col\">Incident ID</th></tr></thead><tbody>");
            for (ReportIncidentEvent event : report.incidentTimeline()) {
                String eventTone = "OPENED".equals(event.eventType()) ? "bad" : "RESOLVED".equals(event.eventType()) ? "good" : "";
                html.append("<tr><td class=\"mono\"><time datetime=\"").append(event.occurredAt()).append("\" title=\"")
                        .append(event.occurredAt()).append("\">").append(timelineTime(event.occurredAt()))
                        .append("</time>")
                        .append("</td><td><span class=\"tag ").append(eventTone).append("\">");
                dot(html, eventTone);
                html.append(escape(event.eventType()))
                        .append("</span></td><td class=\"mono\"><span title=\"").append(event.incidentId()).append("\">")
                        .append(shortId(event.incidentId())).append("</span></td></tr>");
            }
            html.append("</tbody></table></div>");
        }
        if (report.incidentTimelineTruncated()) {
            html.append("<p class=\"notice\">Incident timeline truncated at 100 transitions. The incident count is a lower bound.</p>");
        }
        html.append("</section>");

        panel(html, "What this report does not prove", "Read alongside the evidence");
        html.append("<ul class=\"limitations\">");
        for (String limitation : report.limitations()) {
            html.append("<li>").append(escape(limitation)).append("</li>");
        }
        html.append("</ul></section></div></main><footer><span>Schema ").append(escape(report.schemaVersion())).append(" · ")
                .append(report.sourceDataWatermark() == null ? "No source data"
                        : "<time datetime=\"" + report.sourceDataWatermark() + "\" title=\"" + report.sourceDataWatermark()
                                + "\">Data up to " + dateTime(report.sourceDataWatermark()) + "</time>")
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

    /** The 3x3 dot-matrix status block; the tone is good, bad, warn or empty for neutral. */
    private void dot(StringBuilder html, String tone) {
        html.append("<span class=\"status-dot ").append(tone).append("\" aria-hidden=\"true\">").append("<i></i>".repeat(9)).append("</span>");
    }

    /** A module with a header row, like the dashboard's panels; the caller closes the section. */
    private void panel(StringBuilder html, String title, String note) {
        html.append("<section class=\"panel\"><header class=\"panel-header\"><h2>").append(escape(title))
                .append("</h2><span class=\"section-note\">").append(escape(note)).append("</span></header>");
    }

    /** A label and value on the left, and a reference label and value on the right, above a meter. */
    private void readout(StringBuilder html, String label, String value, String refLabel, String refValue) {
        html.append("<div class=\"readout-row\"><span>").append(escape(label)).append(" <b>").append(escape(value))
                .append("</b></span><span>").append(escape(refLabel)).append(" <b>").append(escape(refValue)).append("</b></span></div>");
    }

    private void metric(StringBuilder html, String label, String value, String unit, String note, String tone, String raw) {
        html.append(tone.isEmpty() ? "<div class=\"metric\">" : "<div class=\"metric lit\" data-tone=\"" + tone + "\">")
                .append("<div class=\"eyebrow\">").append(escape(label)).append("</div><div class=\"readout\">");
        pair(html, value, unit, raw);
        html.append("</div><p>").append(escape(note)).append("</p></div>");
    }

    /** One headline figure in the dot font, with its unit beside it in small mono. */
    private void pair(StringBuilder html, String value, String unit, String raw) {
        html.append("<span class=\"pair\">");
        if (value == null) {
            html.append("<span class=\"empty-value\">—</span>");
        } else {
            html.append("<span class=\"figure\"").append(raw == null ? "" : " title=\"" + escape(raw) + "\" data-value=\"" + escape(raw) + "\"")
                    .append(">").append(escape(value)).append("</span>");
        }
        if (!unit.isEmpty()) {
            html.append("<span class=\"unit\">").append(escape(unit)).append("</span>");
        }
        html.append("</span>");
    }

    private static final int CELLS = 20;

    /**
     * A segmented meter: twenty touching cells filled to the value's share of the scale, the last one partly,
     * with an optional marker line, the same instrument as the dashboard's drill track and latency meter.
     */
    private void cells(StringBuilder html, String id, String label, BigDecimal value, BigDecimal scale, String fill,
                       BigDecimal markerPercent) {
        BigDecimal share = share(value, scale);
        html.append("<div class=\"cells fill-").append(fill).append("\" role=\"img\" aria-label=\"").append(escape(label))
                .append("\" data-meter=\"").append(id).append("\" data-share=\"").append(share.toPlainString()).append("\">");
        BigDecimal filled = share.multiply(BigDecimal.valueOf(CELLS));
        for (int i = 0; i < CELLS; i++) {
            BigDecimal cell = filled.subtract(BigDecimal.valueOf(i)).max(BigDecimal.ZERO).min(BigDecimal.ONE);
            if (cell.signum() == 0) {
                html.append("<i></i>");
            } else if (cell.compareTo(BigDecimal.ONE) == 0) {
                html.append("<i class=\"full\"></i>");
            } else {
                html.append("<i><b style=\"width:").append(cell.multiply(HUNDRED).setScale(1, RoundingMode.HALF_UP).stripTrailingZeros().toPlainString())
                        .append("%\"></b></i>");
            }
        }
        if (markerPercent != null) {
            html.append("<span class=\"cells-mark\" style=\"left:").append(share(markerPercent, HUNDRED).multiply(HUNDRED)
                    .setScale(1, RoundingMode.HALF_UP).stripTrailingZeros().toPlainString()).append("%\"></span>");
        }
        html.append("</div>");
    }

    private void budgetMeters(StringBuilder html, ReportErrorBudget budget) {
        BigDecimal observed = BigDecimal.valueOf(budget.observedBadExecutions());
        BigDecimal allowed = budget.allowedBadExecutions();
        BigDecimal scale = allowed.max(observed);
        boolean exceeded = budget.remainingExecutions().signum() < 0;
        boolean nearly = !exceeded && allowed.signum() > 0 && observed.multiply(BigDecimal.valueOf(4)).compareTo(allowed.multiply(BigDecimal.valueOf(3))) >= 0;
        html.append("<div class=\"readout-row\"><span>Allowed</span><b title=\"").append(allowed.toPlainString()).append("\">")
                .append(oneDecimal(allowed)).append("</b></div>");
        cells(html, "budget-allowed", "Allowed bad executions " + oneDecimal(allowed), allowed, scale, "neutral", null);
        html.append("<div class=\"readout-row\"><span>Observed down</span><b>").append(budget.observedBadExecutions()).append("</b></div>");
        cells(html, "budget-observed", "Observed bad executions " + budget.observedBadExecutions(), observed, scale,
                exceeded ? "bad" : nearly ? "warn" : "neutral", null);
    }

    /** The value's share of the scale, clamped to 0..1 with three decimals; 0 when either is missing. */
    private BigDecimal share(BigDecimal value, BigDecimal scale) {
        if (value == null || scale == null || scale.signum() <= 0) {
            return BigDecimal.ZERO;
        }
        return value.max(BigDecimal.ZERO).min(scale).divide(scale, 3, RoundingMode.HALF_UP);
    }

    private void item(StringBuilder html, String label, String value) {
        item(html, label, value, "");
    }

    private void item(StringBuilder html, String label, String value, String attributes) {
        html.append("<div><dt>").append(escape(label)).append("</dt><dd").append(attributes).append(">")
                .append(escape(value)).append("</dd></div>");
    }

    private static final DateTimeFormatter DATE_TIME = DateTimeFormatter.ofPattern("d MMM yyyy, HH:mm", Locale.ENGLISH)
            .withZone(ZoneOffset.UTC);
    private static final DateTimeFormatter TIMELINE = DateTimeFormatter.ofPattern("d MMM, HH:mm:ss", Locale.ENGLISH)
            .withZone(ZoneOffset.UTC);

    /** A fixed number of decimals, or null when there is no value. */
    String fixed(BigDecimal value, int scale) {
        return value == null ? null : value.setScale(scale, RoundingMode.HALF_UP).toPlainString();
    }

    /** At most one decimal, without a trailing ".0". */
    String oneDecimal(BigDecimal value) {
        return value.setScale(1, RoundingMode.HALF_UP).stripTrailingZeros().toPlainString();
    }

    /** A measured percentage, always two decimals (99.72%). */
    String percent(BigDecimal value) {
        return value == null ? "not available" : fixed(value, 2) + "%";
    }

    /** A configured target or threshold, shown as given (99.5%, 95%). */
    String given(BigDecimal value) {
        return value == null ? "not set" : value.stripTrailingZeros().toPlainString() + "%";
    }

    String budgetSentence(ReportErrorBudget budget) {
        if (budget.remainingExecutions().signum() < 0) {
            BigDecimal over = budget.remainingExecutions().negate();
            return oneDecimal(over) + " " + checks(over) + " over a budget of " + oneDecimal(budget.allowedBadExecutions());
        }
        return oneDecimal(budget.remainingExecutions()) + " of " + oneDecimal(budget.allowedBadExecutions()) + " checks left";
    }

    private String checks(BigDecimal count) {
        return count.compareTo(BigDecimal.ONE) == 0 ? "check" : "checks";
    }

    String dateTime(Instant instant) {
        return DATE_TIME.format(instant) + " UTC";
    }

    String window(Instant from, Instant to) {
        return DATE_TIME.format(from) + " → " + dateTime(to);
    }

    /** The window's length in plain words: "7 days", "1 day", or hours for shorter windows. */
    String span(Instant from, Instant to) {
        long hours = java.time.Duration.between(from, to).toHours();
        if (hours >= 24 && hours % 24 == 0) {
            long days = hours / 24;
            return days + (days == 1 ? " day" : " days");
        }
        return hours + (hours == 1 ? " hour" : " hours");
    }

    String timelineTime(Instant instant) {
        return TIMELINE.format(instant);
    }

    String shortId(UUID id) {
        return id.toString().substring(0, 8);
    }

    String denominator(String policy) {
        if ("UP_PLUS_DOWN".equals(policy)) {
            return "UP ÷ (UP + DOWN)";
        }
        String words = policy.replace('_', ' ').toLowerCase(Locale.ROOT);
        return words.isEmpty() ? words : Character.toUpperCase(words.charAt(0)) + words.substring(1);
    }

    private String escape(String input) {
        return input.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
                .replace("\"", "&quot;").replace("'", "&#39;");
    }
}

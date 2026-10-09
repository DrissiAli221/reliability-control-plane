package dev.ali.rcp.reporting;

import dev.ali.rcp.availability.AvailabilityReport;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
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
            .mono, .label, dt, th, .tag, .chip, .ticks, .meta-line, .edition, footer { font-family: var(--font-mono); }
            h1 { font-size: 32px; font-weight: 600; line-height: 1.15; letter-spacing: -.02em; overflow-wrap: anywhere; }
            .figure { font-family: var(--font-dots); font-size: 30px; font-weight: 800; line-height: 1;
              letter-spacing: 0; color: var(--text); font-variant-numeric: tabular-nums; }
            h2, h3, .brand { font-size: 15px; font-weight: 500; line-height: 1.3; letter-spacing: -.01em; }
            /* The label role: mono, quiet, sentence case. Abbreviations (SLO, UTC, HTTP) keep their capitals. */
            .label, dt, th, .section-note, .ticks, .chip, .edition, footer {
              font-size: 11px; font-weight: 400; letter-spacing: .04em; color: var(--text-3); }
            /* The hint role: one step under body, quieter, in the reading face so it never competes with a label. */
            .hint, .unit, .note { font-size: 12px; color: var(--text-3); }
            .masthead { display: flex; align-items: center; justify-content: space-between; gap: 16px;
              padding-bottom: 22px; border-bottom: 1px solid var(--border); }
            .brand { display: flex; align-items: center; gap: 10px; }
            .brand svg { width: 27px; height: 21px; flex: none; color: var(--text); }
            /* The subject is the title, as on the monitor page: name and verdict chip, then target and one meta line. */
            .intro { margin: 40px 0 24px; }
            .title-row { display: flex; align-items: center; flex-wrap: wrap; gap: 10px 14px; }
            .chip { display: inline-flex; align-items: center; gap: 7px; height: 24px; padding: 0 9px; white-space: nowrap;
              border: 1px solid var(--border); background: var(--surface); color: var(--text); }
            .chip.good { color: var(--green-text); border-color: color-mix(in srgb, var(--green) 35%, var(--border)); }
            .chip.bad { color: var(--red-text); border-color: color-mix(in srgb, var(--red) 35%, var(--border)); }
            .chip.warn { color: var(--amber-text); border-color: color-mix(in srgb, var(--amber) 35%, var(--border)); }
            .target { color: var(--text-2); margin: 8px 0 6px; overflow-wrap: anywhere; }
            .meta-line { display: flex; flex-wrap: wrap; gap: 4px 10px; font-size: 11px; letter-spacing: .04em; color: var(--text-3); }
            dd { overflow-wrap: anywhere; }
            /* Every module below the intro touches the next and shares its hairline, like the dashboard's stack. */
            .stack > * + * { margin-top: -1px; }
            .decision { padding: 14px 16px; border: 1px solid var(--border); background: var(--surface); }
            .decision p { color: var(--text-2); }
            .decision b { font-weight: 500; color: var(--text); }
            .tag { display: inline-flex; align-items: center; gap: 7px; vertical-align: middle; line-height: 1; white-space: nowrap; font-size: 11px; letter-spacing: .04em; color: var(--text); }
            /* Status marker: a 3x3 dot-matrix block, the same shape as the dashboard's StatusDot (9px). */
            .status-dot { --dot-size: 2px; --dot-gap: 1.5px; --dot-color: var(--text-3); display: inline-grid;
              grid-template-columns: repeat(3, var(--dot-size)); gap: var(--dot-gap); flex: none; }
            .status-dot i { width: var(--dot-size); height: var(--dot-size); border-radius: 50%; background: var(--dot-color); }
            .status-dot.good { --dot-color: var(--green); } .status-dot.bad { --dot-color: var(--red); }
            .status-dot.warn { --dot-color: var(--amber); }
            /* A faint status light falling from the top edge. Only the verdict strip carries it; tiles stay neutral
               and let their meters carry the colour, so the row reads as one instrument. */
            .lit[data-tone="good"] { --hue: var(--green); } .lit[data-tone="bad"] { --hue: var(--red); }
            .lit[data-tone="warn"] { --hue: var(--amber); }
            .lit[data-tone] { background: linear-gradient(180deg, color-mix(in srgb, var(--hue) var(--light-fall), transparent) 0%,
              transparent 55%), var(--surface); }
            .good { color: var(--green-text); } .bad { color: var(--red-text); } .warn { color: var(--amber-text); }
            /* Modules touch: the 1px grid gap shows the container's hairline colour, so dividers survive any wrap. */
            .metrics, .visuals, .facts { display: grid; gap: 1px; border: 1px solid var(--border); background: var(--border); }
            .metrics { grid-template-columns: repeat(4, minmax(0, 1fr)); }
            /* A tile, as on the dashboard: label, one figure with a short unit, a 22px visual row, then a hint. */
            .metric { display: flex; flex-direction: column; gap: 8px; min-width: 0; padding: 14px 16px; background: var(--surface); }
            .metric > .label { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
            .metric-value { display: flex; align-items: baseline; gap: 6px; margin-top: 4px; white-space: nowrap; }
            .metric-value .unit { font-size: 13px; }
            .metric-visual { display: flex; align-items: center; height: 22px; }
            .metric-visual > * { flex: 1; }
            .panel { border: 1px solid var(--border); background: var(--surface); }
            .panel-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 49px;
              padding: 10px 16px; border-bottom: 1px solid var(--border); }
            .panel .visuals, .panel .facts { border: 0; margin: 0; }
            .visuals { grid-template-columns: 1fr 1fr; border-bottom: 1px solid var(--border) !important; }
            .visual { min-width: 0; padding: 18px 16px 20px; background: var(--surface); }
            .visual > p { color: var(--text-2); margin-top: 4px; }
            /* Readouts: quiet label, bright value, the reference on the right, above a slim meter. */
            .readout-row { display: flex; justify-content: space-between; gap: 10px; margin: 22px 0 10px; font-family: var(--font-mono);
              font-size: 11px; letter-spacing: .04em; color: var(--text-3); }
            .readout-row b { font-weight: 400; color: var(--text); }
            /* The dashboard's meter: a 6px track and a fill; a target is a 2px notch cut through the track, not a line over it. */
            .meter { position: relative; height: 6px; background: var(--track); }
            .meter-fill { position: absolute; inset: 0 auto 0 0; min-width: 3px; background: var(--text-3); }
            .meter-fill.good { background: var(--green); } .meter-fill.bad { background: var(--red); }
            .meter-fill.warn { background: var(--amber); }
            .meter-mark { position: absolute; top: 0; bottom: 0; width: 2px; margin-left: -1px; background: var(--surface); }
            /* Latency: the p50..p95 spread on a scale from zero, a dot at p50 and a tick at p95. */
            .range-span { position: absolute; top: 0; bottom: 0; background: color-mix(in srgb, var(--text-3) 55%, transparent); }
            .range-dot { position: absolute; top: 50%; width: 10px; height: 10px; margin: -5px 0 0 -5px; border-radius: 50%;
              background: var(--text-2); outline: 2px solid var(--surface); }
            .range-tick { position: absolute; top: 0; bottom: 0; width: 2px; margin-left: -1px; background: var(--text); }
            /* Incidents: each one drawn where it happened in the window, from opened to resolved. */
            .meter-span { position: absolute; top: -3px; bottom: -3px; min-width: 2px; background: var(--red); }
            .meter-span.resolved { background: color-mix(in srgb, var(--red) 55%, var(--track)); }
            .ticks { position: relative; height: 14px; margin-top: 8px; }
            .ticks span { position: absolute; top: 0; transform: translateX(-50%); white-space: nowrap; }
            .ticks span:first-child { transform: none; } .ticks span:last-child { transform: translateX(-100%); }
            .ticks span.on { color: var(--text-2); }
            /* Explain lines, as in the dashboard's explain card: label, value, and the result in bright text. */
            .lines { margin-top: 18px; border-top: 1px solid var(--border); }
            .lines > div { display: grid; grid-template-columns: 76px minmax(0, 1fr); gap: 12px; padding: 9px 0; border-bottom: 1px solid var(--border); }
            .lines dd { color: var(--text-2); font-family: var(--font-mono); font-size: 12px; }
            .lines .result dd { color: var(--text); }
            .note { margin-top: 12px; }
            .facts { grid-template-columns: repeat(4, minmax(0, 1fr)); margin: -1px 0 0; }
            .facts > div { padding: 12px 16px; background: var(--surface); }
            .facts dt { margin-bottom: 4px; }
            .facts dd { font-family: var(--font-mono); }
            table { border-collapse: collapse; width: 100%; }
            th { text-align: left; background: var(--surface-2); }
            th, td { border-bottom: 1px solid var(--border); padding: 10px 16px; vertical-align: middle; }
            th.num, td.num { text-align: right; }
            tbody tr:last-child td { border-bottom: 0; } td.mono { overflow-wrap: anywhere; }
            td.num .hint { margin-left: 6px; }
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
              .section-note, .edition { display: none; } footer { flex-wrap: wrap; }
            }
            @page { size: A4; margin: 12mm; }
            @media print {
              :root { color-scheme: light; """ + LIGHT_TOKENS + """
                --bg: #ffffff; }
              body { font-size: 9pt; } .report { max-width: none; padding: 0 1px; } /* keeps right-hand hairlines inside the printable area */
              .masthead { padding-bottom: 3mm; } .brand svg { width: 20px; height: 16px; }
              .intro { margin: 4mm 0 3mm; } h1 { font-size: 22pt; }
              .figure { font-size: 19pt; }
              h2, h3, .brand { font-size: 10.5pt; }
              .label, dt, th, .section-note, .ticks, .chip, .tag, .edition, .meta-line, .readout-row, footer { font-size: 7.5pt; }
              .hint, .unit, .note, .metric-value .unit, .lines dd { font-size: 8pt; }
              .target { margin: 2mm 0 1mm; }
              .decision { padding: 3mm; } .panel-header { min-height: 0; padding: 1.8mm 3mm; } .stack { margin-top: 4mm; }
              .metric { gap: 1.5mm; padding: 3mm; } .metric-visual { height: 4mm; }
              .visual { padding: 3mm; } .readout-row { margin: 3mm 0 2mm; } .lines { margin-top: 3mm; }
              .lines > div { padding: 1mm 0; }
              .panel-header { break-after: avoid; } .limitations { padding: 2mm 3mm 2mm 7mm; }
              .facts > div { padding: 2mm 3mm; }
              .table-wrap { overflow: visible; }
              th, td { padding: 1mm 3mm; } thead { display: table-header-group; } tr { break-inside: avoid; }
              .limits, .masthead, .intro, .decision, .metric, .metrics, .visual, .visuals, .facts, .facts > div { break-inside: avoid; }
              .limitations li { margin: .5mm 0; } footer { margin-top: 2mm; padding-top: 1.5mm; }
              p, li { orphans: 3; widows: 3; }
            }
            """;

    // The aperture mark: stepped violet and lavender brackets around a square; the square takes the text colour so it
    // stays visible on a light page and in print.
    private static final String LOGO = """
            <svg viewBox="0 0 18 14" aria-hidden="true" shape-rendering="crispEdges"><defs>\
            <linearGradient id="rcp-violet" x1="2" y1="2" x2="8" y2="12" gradientUnits="userSpaceOnUse">\
            <stop stop-color="#9482ff"/><stop offset=".48" stop-color="#7c63ff"/><stop offset="1" stop-color="#8a73ff"/></linearGradient>\
            <linearGradient id="rcp-lavender" x1="10" y1="1" x2="16" y2="12" gradientUnits="userSpaceOnUse">\
            <stop stop-color="#c1b0ff"/><stop offset=".5" stop-color="#ad94f8"/><stop offset="1" stop-color="#b5a1ff"/></linearGradient></defs>\
            <path fill="url(#rcp-violet)" d="M6 1h2v2H7v1H6v1H5v1H4v1h1v1h1v1h1v1h1v2H6v-1H5v-1H4V9H3V8H2V7H1V6h1V5h1V4h1V3h1V2h1Z"/>\
            <path fill="url(#rcp-lavender)" d="M12 1h-2v2h1v1h1v1h1v1h1v1h-1v1h-1v1h-1v1h-1v2h2v-1h1v-1h1V9h1V8h1V7h1V6h-1V5h-1V4h-1V3h-1V2h-1Z"/>\
            <path fill="currentColor" d="M7.75 5.25h2.5v2.5h-2.5Z"/></svg>""";

    public String render(ReliabilityReport report) {
        AvailabilityReport a = report.availability();
        String tone = a.sloMet() == null ? "warn" : a.sloMet() ? "good" : "bad";
        String decision = a.sloMet() == null ? "NO VERDICT" : a.sloMet() ? "MET" : "MISSED";
        List<Incident> incidents = incidents(report.incidentTimeline());
        StringBuilder html = new StringBuilder(96000);
        html.append("<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\">")
                .append("<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">")
                .append("<title>").append(escape(report.monitorName())).append(" · RCP reliability report</title>")
                .append("<style>").append(STYLES).append("</style></head><body><div class=\"report\">")
                .append("<header class=\"masthead\"><div class=\"brand\">")
                .append(LOGO)
                .append("Reliability Control Plane</div><div class=\"edition\">Reliability report</div></header>")
                // Like the monitor page: name and verdict chip on one row, then the target and one quiet meta line.
                .append("<main><section class=\"intro\" aria-labelledby=\"report-title\"><div class=\"title-row\">")
                .append("<h1 id=\"report-title\">").append(escape(report.monitorName())).append("</h1><span class=\"chip ")
                .append(tone).append("\">");
        dot(html, tone);
        html.append(decision).append("</span></div><p class=\"target mono\">").append(escape(report.targetUrl()))
                .append("</p><p class=\"meta-line\"><span data-from=\"").append(a.from()).append("\" data-to=\"").append(a.to())
                .append("\" title=\"").append(a.from()).append(" → ").append(a.to()).append("\">").append(window(a.from(), a.to()))
                .append("</span><span>·</span><span>").append(span(a.from(), a.to()))
                .append("</span><span>·</span><span data-value=\"").append(report.generatedAt()).append("\" title=\"")
                .append(report.generatedAt()).append("\">Generated ").append(dateTime(report.generatedAt())).append("</span></p></section>")
                .append("<div class=\"stack\"><div class=\"decision lit\" data-tone=\"").append(tone).append("\"><p>");
        if (a.sloMet() == null) {
            html.append("<b>Not enough evidence to judge this SLO.</b> Observed availability is not an SLO pass.");
        } else {
            html.append(a.sloMet() ? "<b>The SLO target was met.</b>" : "<b>The SLO target was missed.</b>");
        }
        html.append(" Coverage ").append(percent(a.evidenceCoveragePercent())).append(" of a required ")
                .append(given(a.minimumEvidenceCoveragePercent())).append(".</p></div><section class=\"metrics\" aria-label=\"Headline metrics\">");

        String availabilityTone = a.sloMet() == null ? "" : tone;
        StringBuilder visual = new StringBuilder();
        meter(visual, "availability", "Measured availability " + percent(a.measuredAvailabilityPercent()) + " against a target of "
                + given(a.sloTargetPercent()) + ", on a nines scale", nines(a.measuredAvailabilityPercent()), availabilityTone,
                nines(a.sloTargetPercent()));
        metric(html, "Availability", fixed(a.measuredAvailabilityPercent(), 2), "%",
                a.measuredAvailabilityPercent() == null ? null : a.measuredAvailabilityPercent().toPlainString(),
                visual.toString(), "Target " + given(a.sloTargetPercent()));

        ReportErrorBudget budget = report.errorBudget();
        boolean overspent = budget.remainingExecutions().signum() < 0;
        visual.setLength(0);
        budgetMeter(visual, budget);
        // An overspent budget reads as how far over it is, never as a negative count of checks left.
        metric(html, "Error budget",
                oneDecimal(overspent ? budget.remainingExecutions().negate() : budget.remainingExecutions()),
                overspent ? "over" : "left",
                budget.remainingExecutions().toPlainString() + " of " + budget.allowedBadExecutions().toPlainString(),
                visual.toString(),
                (overspent ? "Allowed " : "Of ") + oneDecimal(budget.allowedBadExecutions()) + " "
                        + checks(budget.allowedBadExecutions()) + " · " + budget.observedBadExecutions() + " down");

        ReportLatency latency = report.latency();
        visual.setLength(0);
        latencyRange(visual, latency);
        metric(html, "HTTP latency", latency.p50Ms() == null ? null : latency.p50Ms().toString(), "ms p50",
                null, visual.toString(), latency.p95Ms() == null
                        ? latency.sampleCount() + " of " + latency.minimumSamples() + " samples needed"
                        : "p95 " + latency.p95Ms() + " ms · " + latency.sampleCount() + " samples");

        visual.setLength(0);
        incidentStrip(visual, incidents, a.from(), a.to());
        long ongoing = incidents.stream().filter(incident -> incident.resolved() == null).count();
        metric(html, "Incidents", incidents.size() + (report.incidentTimelineTruncated() ? "+" : ""), "", null, visual.toString(),
                report.incidentTimelineTruncated() ? "Lower bound · timeline truncated"
                        : incidents.isEmpty() ? "None in this window"
                        : (incidents.size() - ongoing) + " resolved · " + ongoing + " ongoing");
        html.append("</section>");

        panel(html, "How the numbers were reached", "Aggregates for this window");
        html.append("<div class=\"visuals\"><div class=\"visual\"><h3>Availability</h3>")
                .append("<p title=\"").append(escape(a.denominatorPolicy())).append("\">Counted as ")
                .append(escape(denominator(a.denominatorPolicy()))).append(". Inconclusive checks are excluded.</p>");
        readout(html, "Observed", percent(a.measuredAvailabilityPercent()), "Target", given(a.sloTargetPercent()));
        meter(html, "availability-scale", "Measured availability " + percent(a.measuredAvailabilityPercent())
                + " on a nines scale, target " + given(a.sloTargetPercent()), nines(a.measuredAvailabilityPercent()),
                availabilityTone, nines(a.sloTargetPercent()));
        // Each step is ten times less downtime, so the last few tenths of a percent get the room they matter for.
        html.append("<div class=\"ticks\" aria-hidden=\"true\">");
        List<String> ticks = List.of("0%", "90%", "99%", "99.9%", "99.99%");
        for (int i = 0; i < ticks.size(); i++) {
            html.append("<span").append(ticks.get(i).equals(given(a.sloTargetPercent())) ? " class=\"on\"" : "")
                    .append(" style=\"left:").append(i * 25).append("%\">").append(ticks.get(i)).append("</span>");
        }
        html.append("</div><p class=\"note\">Scaled in nines: each step is ten times less downtime.</p>");
        readout(html, "Coverage", percent(a.evidenceCoveragePercent()), "Required", given(a.minimumEvidenceCoveragePercent()));
        BigDecimal coverage = a.evidenceCoveragePercent();
        boolean sufficient = coverage != null && a.minimumEvidenceCoveragePercent() != null
                && coverage.compareTo(a.minimumEvidenceCoveragePercent()) >= 0;
        meter(html, "coverage", "Evidence coverage " + percent(coverage) + "; minimum " + given(a.minimumEvidenceCoveragePercent()),
                share(coverage, HUNDRED), sufficient ? "good" : "warn", share(a.minimumEvidenceCoveragePercent(), HUNDRED));

        html.append("</div><div class=\"visual\"><h3>Error budget</h3>")
                .append("<p>Allowance comes from conclusive checks, not from elapsed downtime.</p><dl class=\"lines\">");
        BigDecimal unreliability = a.sloTargetPercent() == null ? null : HUNDRED.subtract(a.sloTargetPercent());
        line(html, "Allowed", a.conclusiveExecutions() + " conclusive × " + given(unreliability) + " = "
                + oneDecimal(budget.allowedBadExecutions()), "");
        line(html, "Spent", budget.observedBadExecutions() + " confirmed DOWN " + checks(BigDecimal.valueOf(budget.observedBadExecutions())), "");
        line(html, "Result", budgetSentence(budget), " class=\"result\" title=\"" + budget.remainingExecutions().toPlainString() + "\"");
        html.append("</dl><p class=\"note\">Only DOWN counts against the budget. Disagreement and no-data checks are inconclusive, not failures.</p>");
        if (budget.allowedBadExecutions().signum() == 0) {
            html.append("<p class=\"note\">No failed checks are allowed at this target.</p>");
        }
        html.append("</div></div><dl class=\"facts\">");
        item(html, "UP / DOWN", a.upExecutions() + " / " + a.downExecutions());
        item(html, "Disagreement / no data", a.disagreementExecutions() + " / " + a.noDataExecutions());
        item(html, "Due / pending / missing", a.expectedOpportunities() + " / " + a.pendingExecutions() + " / " + a.missingExecutions());
        item(html, "Conclusive / finalized", a.conclusiveExecutions() + " / " + a.totalFinalizedExecutions());
        html.append("</dl></section>");

        panel(html, "Incidents", incidentNote(incidents));
        if (incidents.isEmpty()) {
            html.append("<p class=\"empty\">No incident transitions recorded in this window. This does not rule out an incident opened earlier.</p>");
        } else {
            html.append("<div class=\"table-wrap\"><table><thead><tr><th scope=\"col\">Incident</th>")
                    .append("<th scope=\"col\">State</th><th scope=\"col\">Opened · UTC</th><th scope=\"col\">Resolved · UTC</th>")
                    .append("<th scope=\"col\" class=\"num\">Duration</th></tr></thead><tbody>");
            for (Incident incident : incidents) {
                boolean resolved = incident.resolved() != null;
                html.append("<tr><td class=\"mono\"><span title=\"").append(incident.id()).append("\">").append(shortId(incident.id()))
                        .append("</span></td><td><span class=\"tag\">");
                dot(html, resolved ? "good" : "bad");
                html.append(resolved ? "RESOLVED" : "OPEN").append("</span></td><td class=\"mono\">");
                time(html, incident.opened(), "Before window");
                html.append("</td><td class=\"mono\">");
                time(html, incident.resolved(), "Still open");
                html.append("</td><td class=\"mono num\">");
                if (incident.opened() == null) {
                    html.append("<span class=\"hint\">unknown</span>");
                } else {
                    html.append(duration(Duration.between(incident.opened(), resolved ? incident.resolved() : a.to())));
                    if (!resolved) {
                        html.append("<span class=\"hint\">so far</span>");
                    }
                }
                html.append("</td></tr>");
            }
            html.append("</tbody></table></div>");
        }
        if (report.incidentTimelineTruncated()) {
            html.append("<p class=\"notice\">Incident timeline truncated at 100 transitions. The incident count is a lower bound.</p>");
        }
        html.append("</section>");

        panel(html, "What this report does not prove", "Read alongside the evidence", "limits");
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
        panel(html, title, note, "");
    }

    private void panel(StringBuilder html, String title, String note, String extraClass) {
        html.append("<section class=\"panel").append(extraClass.isEmpty() ? "" : " " + extraClass).append("\"><header class=\"panel-header\"><h2>").append(escape(title))
                .append("</h2><span class=\"section-note\">").append(escape(note)).append("</span></header>");
    }

    /** A label and value on the left, and a reference label and value on the right, above a meter. */
    private void readout(StringBuilder html, String label, String value, String refLabel, String refValue) {
        html.append("<div class=\"readout-row\"><span>").append(escape(label)).append(" <b>").append(escape(value))
                .append("</b></span><span>").append(escape(refLabel)).append(" <b>").append(escape(refValue)).append("</b></span></div>");
    }

    /** A headline tile: label, one dot-matrix figure with a short unit, a visual row, then a quiet hint. */
    private void metric(StringBuilder html, String label, String value, String unit, String raw, String visual, String hint) {
        html.append("<div class=\"metric\"><div class=\"label\">").append(escape(label)).append("</div><div class=\"metric-value\">");
        if (value == null) {
            html.append("<span class=\"figure\">—</span>");
        } else {
            html.append("<span class=\"figure\"").append(raw == null ? "" : " title=\"" + escape(raw) + "\" data-value=\"" + escape(raw) + "\"")
                    .append(">").append(escape(value)).append("</span>");
            if (!unit.isEmpty()) {
                html.append("<span class=\"unit\">").append(escape(unit)).append("</span>");
            }
        }
        html.append("</div><div class=\"metric-visual\">").append(visual).append("</div><p class=\"hint\">").append(escape(hint))
                .append("</p></div>");
    }

    /** The dashboard's slim meter: a fill to the share (0..1) and an optional marker line; no fill when the share is zero. */
    private void meter(StringBuilder html, String id, String label, BigDecimal share, String tone, BigDecimal mark) {
        html.append("<div class=\"meter\" role=\"img\" aria-label=\"").append(escape(label)).append("\" data-meter=\"").append(id)
                .append("\" data-share=\"").append(share.toPlainString()).append("\">");
        if (share.signum() > 0) {
            html.append("<span class=\"meter-fill").append(tone.isEmpty() ? "" : " " + tone).append("\" style=\"width:")
                    .append(cssPercent(share)).append("\"></span>");
        }
        if (mark != null) {
            html.append("<span class=\"meter-mark\" style=\"left:").append(cssPercent(mark)).append("\"></span>");
        }
        html.append("</div>");
    }

    /** Down checks against the allowance, like the dashboard's budget meter: amber past 75%, red and full once spent. */
    private void budgetMeter(StringBuilder html, ReportErrorBudget budget) {
        BigDecimal observed = BigDecimal.valueOf(budget.observedBadExecutions());
        BigDecimal allowed = budget.allowedBadExecutions();
        boolean exceeded = budget.remainingExecutions().signum() < 0;
        BigDecimal used = allowed.signum() > 0 ? share(observed, allowed) : observed.signum() > 0 ? BigDecimal.ONE : BigDecimal.ZERO;
        String tone = exceeded ? "bad" : used.compareTo(new BigDecimal("0.75")) > 0 ? "warn" : "good";
        meter(html, "budget", exceeded ? "Error budget exceeded: " + budget.observedBadExecutions() + " down against "
                + oneDecimal(allowed) + " allowed" : budget.observedBadExecutions() + " of " + oneDecimal(allowed)
                + " allowed down checks used", used, tone, null);
    }

    /** The p50..p95 spread on a scale from zero; an empty track when there are too few samples. */
    private void latencyRange(StringBuilder html, ReportLatency latency) {
        if (latency.p50Ms() == null || latency.p95Ms() == null) {
            html.append("<div class=\"meter\" role=\"img\" aria-label=\"Not enough samples for latency percentiles\"></div>");
            return;
        }
        double scale = Math.max(latency.p95Ms() * 1.1, 1);
        double p50 = latency.p50Ms() / scale;
        double p95 = latency.p95Ms() / scale;
        html.append("<div class=\"meter\" role=\"img\" aria-label=\"p50 ").append(latency.p50Ms()).append(" ms, p95 ")
                .append(latency.p95Ms()).append(" ms\"><span class=\"range-span\" style=\"left:").append(cssPercent(p50))
                .append(";width:").append(cssPercent(p95 - p50)).append("\"></span><span class=\"range-dot\" style=\"left:")
                .append(cssPercent(p50)).append("\"></span><span class=\"range-tick\" style=\"left:").append(cssPercent(p95))
                .append("\"></span></div>");
    }

    /** The window as a track with each incident drawn where it happened, from opened (or the window start) to resolved. */
    private void incidentStrip(StringBuilder html, List<Incident> incidents, Instant from, Instant to) {
        double window = Math.max(Duration.between(from, to).toMillis(), 1);
        html.append("<div class=\"meter\" role=\"img\" aria-label=\"").append(incidents.size())
                .append(incidents.size() == 1 ? " incident" : " incidents").append(" across the window\">");
        for (Incident incident : incidents) {
            double start = incident.opened() == null ? 0 : Duration.between(from, incident.opened()).toMillis() / window;
            double end = incident.resolved() == null ? 1 : Duration.between(from, incident.resolved()).toMillis() / window;
            html.append("<span class=\"meter-span").append(incident.resolved() == null ? "" : " resolved").append("\" style=\"left:")
                    .append(cssPercent(start)).append(";width:").append(cssPercent(Math.max(end - start, 0))).append("\"></span>");
        }
        html.append("</div>");
    }

    /**
     * Availability on a nines scale, as a share of four nines: 90% sits at a quarter, 99% at half, 99.9% at three
     * quarters and 99.99% or better at the end. Linear, a 92% and a 99.9% bar look almost the same.
     */
    BigDecimal nines(BigDecimal percent) {
        if (percent == null) {
            return BigDecimal.ZERO;
        }
        double downtime = 1 - percent.doubleValue() / 100;
        double nines = downtime <= 0.0001 ? 4 : Math.max(-Math.log10(downtime), 0);
        return BigDecimal.valueOf(Math.min(nines, 4) / 4).setScale(3, RoundingMode.HALF_UP);
    }

    private void line(StringBuilder html, String label, String value, String attributes) {
        html.append("<div").append(attributes).append("><dt>").append(escape(label)).append("</dt><dd>").append(escape(value))
                .append("</dd></div>");
    }

    private void time(StringBuilder html, Instant instant, String missing) {
        if (instant == null) {
            html.append("<span class=\"hint\">").append(escape(missing)).append("</span>");
        } else {
            html.append("<time datetime=\"").append(instant).append("\" title=\"").append(instant).append("\">")
                    .append(timelineTime(instant)).append("</time>");
        }
    }

    /** One incident from its transitions in the window; either end can be outside it and is then null. */
    record Incident(UUID id, Instant opened, Instant resolved) {
    }

    /** Pairs the timeline's transitions into incidents, in the order they first appear. */
    List<Incident> incidents(List<ReportIncidentEvent> timeline) {
        Map<UUID, Instant[]> byId = new LinkedHashMap<>();
        for (ReportIncidentEvent event : timeline) {
            Instant[] ends = byId.computeIfAbsent(event.incidentId(), id -> new Instant[2]);
            if ("OPENED".equals(event.eventType())) {
                ends[0] = event.occurredAt();
            } else if ("RESOLVED".equals(event.eventType())) {
                ends[1] = event.occurredAt();
            }
        }
        List<Incident> incidents = new ArrayList<>();
        byId.forEach((id, ends) -> incidents.add(new Incident(id, ends[0], ends[1])));
        return incidents;
    }

    private String incidentNote(List<Incident> incidents) {
        Duration longest = incidents.stream().filter(i -> i.opened() != null && i.resolved() != null)
                .map(i -> Duration.between(i.opened(), i.resolved())).max(Duration::compareTo).orElse(null);
        return incidents.size() + (incidents.size() == 1 ? " incident" : " incidents")
                + (longest == null ? "" : " · longest resolved " + duration(longest)) + " · UTC";
    }

    /** A duration in its two largest units: 45s, 12m 30s, 3h 05m, 2d 4h. */
    String duration(Duration d) {
        long s = Math.max(d.toSeconds(), 0);
        if (s < 60) {
            return s + "s";
        }
        if (s < 3600) {
            return s / 60 + "m " + s % 60 + "s";
        }
        if (s < 86400) {
            return s / 3600 + "h " + String.format(Locale.ROOT, "%02d", s % 3600 / 60) + "m";
        }
        return s / 86400 + "d " + s % 86400 / 3600 + "h";
    }

    private String cssPercent(BigDecimal share) {
        return share.multiply(HUNDRED).setScale(1, RoundingMode.HALF_UP).stripTrailingZeros().toPlainString() + "%";
    }

    private String cssPercent(double share) {
        return cssPercent(BigDecimal.valueOf(Math.min(Math.max(share, 0), 1)));
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

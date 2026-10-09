package dev.ali.rcp.reporting;

import dev.ali.rcp.availability.AvailabilityReport;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.xml.sax.InputSource;

import javax.xml.parsers.DocumentBuilderFactory;
import java.io.StringReader;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;
import java.util.UUID;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;

class ReliabilityReportHtmlRendererTest {
    private final ReliabilityReportHtmlRenderer renderer = new ReliabilityReportHtmlRenderer();

    @Test
    void rendersAnOfflineSampleWithAccessibleMetersAndPrintStyles(@TempDir Path directory) throws Exception {
        String html = renderer.render(sampleReport());
        Path download = directory.resolve("reliability-report.html");
        Files.writeString(download, html, StandardCharsets.UTF_8);

        assertThat(Files.readString(download)).isEqualTo(html);
        assertThat(html).contains("Demo API", "https://example.com/health", "99.72%", "title=\"99.72222\"", "Target 99.5%",
                "title=\"3.20000 of 7.20000\" data-value=\"3.20000 of 7.20000\">3.2</span><span class=\"unit\">left",
                "Of 7.2 checks · 4 down", "class=\"figure\">142</span><span class=\"unit\">ms p50", "p95 387 ms · 2480 samples",
                "<table>", "@media print", "size: A4", "table-header-group", "break-inside: avoid",
                "6 Oct 2026, 00:00 → 7 Oct 2026, 00:00 UTC", "7 Oct 2026, 00:05 UTC",
                "data-from=\"2026-10-06T00:00:00Z\"", "data-to=\"2026-10-07T00:00:00Z\"", "<span>1 day</span>", "Generated 7 Oct 2026, 00:05 UTC",
                "Schema rcp-report-v1 · ", "Data up to 6 Oct 2026, 23:59 UTC", "6 Oct, 01:00:00", "6 Oct, 01:02:00",
                "<span title=\"ae71250e-bd38-4ef3-83f7-812b4e1b9c30\">ae71250e</span>", "Counted as UP ÷ (UP + DOWN)",
                "1440 conclusive × 0.5% = 7.2", "4 confirmed DOWN checks", "3.2 of 7.2 checks left");
        assertThat(html).doesNotContain("99.72222%", "100.00000", ">UP_PLUS_DOWN<");
        assertThat(html).doesNotContain("<script", "<link", "<iframe", "src=", "href=", "@import");
        // The only url() allowed is an embedded font or the logo's own gradients, so the file never fetches anything.
        assertThat(Pattern.compile("url\\((?!data:font/woff2;base64,|#rcp-)").matcher(html).find()).isFalse();
        assertThat(html).contains("fill=\"url(#rcp-violet)\"", "fill=\"currentColor\"");

        // Every meter is a labelled image with its share recorded, never an unlabelled bar.
        assertThat(Pattern.compile("<div class=\"meter\" role=\"img\" aria-label=\"[^\"]+\" data-meter=\"[a-z-]+\" data-share=\"[0-9.]+\">")
                .matcher(html).results().count()).isEqualTo(4);
        assertThat(Pattern.compile("<div class=\"meter\" role=\"img\" aria-label=\"[^\"]+\"").matcher(html).results().count()).isEqualTo(6);
    }

    @Test
    void scalesAvailabilityInNinesSoTheTargetGapIsVisible() {
        assertThat(renderer.nines(new BigDecimal("90"))).isEqualByComparingTo("0.25");
        assertThat(renderer.nines(new BigDecimal("99"))).isEqualByComparingTo("0.5");
        assertThat(renderer.nines(new BigDecimal("99.9"))).isEqualByComparingTo("0.75");
        assertThat(renderer.nines(new BigDecimal("99.99"))).isEqualByComparingTo("1");
        assertThat(renderer.nines(new BigDecimal("100"))).isEqualByComparingTo("1");
        assertThat(renderer.nines(BigDecimal.ZERO)).isEqualByComparingTo("0");
        assertThat(renderer.nines(null)).isEqualByComparingTo("0");
        String html = renderer.render(sampleReport());
        // 99.72% against 99.5%: the fill passes the target marker, and the ticks name the scale.
        assertThat(html).contains("data-meter=\"availability\" data-share=\"0.639\"", "class=\"meter-mark\" style=\"left:57.5%\"",
                "<span style=\"left:75%\">99.9%</span>", "Scaled in nines");
    }

    @Test
    void pairsTransitionsIntoIncidentsWithDurations() {
        Instant from = Instant.parse("2026-10-06T00:00:00Z");
        UUID before = UUID.randomUUID();
        List<ReliabilityReportHtmlRenderer.Incident> incidents = renderer.incidents(List.of(
                new ReportIncidentEvent(before, "RESOLVED", from.plusSeconds(60)),
                new ReportIncidentEvent(UUID.randomUUID(), "OPENED", from.plusSeconds(120))));
        assertThat(incidents).hasSize(2);
        assertThat(incidents.get(0).opened()).isNull();
        assertThat(incidents.get(1).resolved()).isNull();
        assertThat(renderer.duration(java.time.Duration.ofSeconds(45))).isEqualTo("45s");
        assertThat(renderer.duration(java.time.Duration.ofSeconds(750))).isEqualTo("12m 30s");
        assertThat(renderer.duration(java.time.Duration.ofMinutes(185))).isEqualTo("3h 05m");
        assertThat(renderer.duration(java.time.Duration.ofHours(52))).isEqualTo("2d 4h");
        String html = renderer.render(sampleReport());
        assertThat(html).contains("2 incidents · longest resolved 2m 0s · UTC", "1 resolved · 1 ongoing", "Still open",
                "<td class=\"mono num\">2m 0s</td>", "3m 0s<span class=\"hint\">so far</span>");
    }

    @Test
    void showsTheWindowInTheDotFaceAndWhereEveryDueCheckWent() {
        String html = renderer.render(sampleReport());
        assertThat(html).contains("<span class=\"dots\">6 OCT</span><span class=\"arrow\" role=\"img\" aria-label=\"to\">", "</span><span class=\"dots\">7 OCT</span>",
                "2026 · 00:00 UTC · <span>1 day</span>", "Where the 1440 due checks went", "1440 finalized · 1440 conclusive (UP + DOWN)",
                "<i class=\"seg-up\" style=\"flex:1436\"></i><i class=\"seg-down\" style=\"flex:4\"></i></div>",
                "UP</dt><dd>1436<span>99.7%</span>", "Missing</dt><dd>0<span>0%</span>");
        assertThat(html).doesNotContain("UP / DOWN", "seg-gap", "meta-line");
        assertThat(renderer.windowMeta(Instant.parse("2026-12-31T22:00:00Z"), Instant.parse("2027-01-01T06:30:00Z")))
                .isEqualTo("2026 → 2027 · 22:00 → 06:30 UTC");
        // The tag's text sets its baseline, so a status lines up with the times in its row.
        assertThat(html).contains(".tag { display: inline-flex; align-items: baseline;", ".tag .status-dot { align-self: center; }");
    }

    @Test
    void usesExactlyTheSixRoleTypeScaleWithoutUppercaseTransforms() {
        String html = renderer.render(sampleReport());
        String css = html.substring(html.indexOf("<style>"), html.indexOf("</style>"));
        Set<String> sizes = new TreeSet<>();
        var matcher = Pattern.compile("font-size:\\s*([^;}\\s]+)").matcher(css);
        while (matcher.find()) {
            sizes.add(matcher.group(1));
        }
        // Title, figure, heading, body, hint and label, and their print equivalents.
        assertThat(sizes).containsExactlyInAnyOrder("32px", "30px", "15px", "13px", "12px", "11px",
                "22pt", "19pt", "10.5pt", "9pt", "8pt", "7.5pt");
        assertThat(css).doesNotContain("text-transform", "font: ", "border-radius: 4", "border-radius: 6");
        assertThat(css).contains("\"Geist\"", "\"Geist Mono\"", "\"Doto\"", "#0a0a0a", "#111111", "#242424",
                "#30a46c", "#e5484d", "#f5a524", "#ededf0", "#1a7f4b", "#d1342f", "#b86e00", "#dcdce1");
        assertThat(html).contains("<h1 id=\"report-title\">Demo API</h1>", "<div class=\"edition\">Reliability report</div>",
                "<div class=\"label\">Availability</div>", "<div class=\"label\">Error budget</div>", "Opened · UTC", "Duration");
        assertThat(html).doesNotContain("section-index", "Monitor reliability", "Denominator policy", "class=\"cells");
    }

    @Test
    void escapesEveryUserControlledStringIncludingTitleAndTimeline() {
        ReliabilityReport sample = sampleReport();
        String input = "<script>alert(\"x\")</script>&'";
        String escaped = "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;&amp;&#39;";
        AvailabilityReport a = sample.availability();
        AvailabilityReport withPolicy = new AvailabilityReport(a.monitorId(), a.from(), a.to(), a.sloTargetPercent(),
                a.measuredAvailabilityPercent(), a.evidenceCoveragePercent(), a.minimumEvidenceCoveragePercent(),
                a.sloMet(), a.upExecutions(), a.downExecutions(), a.disagreementExecutions(), a.noDataExecutions(),
                a.conclusiveExecutions(), a.totalFinalizedExecutions(), a.pendingExecutions(), a.missingExecutions(),
                a.expectedOpportunities(), input);
        ReliabilityReport malicious = new ReliabilityReport(input, sample.generatedAt(), null, input, input,
                withPolicy, sample.errorBudget(), sample.latency(),
                List.of(new ReportIncidentEvent(UUID.randomUUID(), input, a.from())), false, List.of(input));

        String html = renderer.render(malicious);
        assertThat(html).doesNotContain(input, "<script>");
        assertThat(html).contains("<title>" + escaped, "<h1 id=\"report-title\">" + escaped,
                "<p class=\"target mono\">" + escaped, "title=\"" + escaped + "\"", "<li>" + escaped,
                "Schema " + escaped, "No source data");
    }

    @Test
    void sparseGreenEvidenceIsNotPresentedAsAnSloPass() {
        ReliabilityReport report = reportWithEvidence(new BigDecimal("100"), null,
                new BigDecimal("0.00500"), 0, new BigDecimal("0.00500"));
        String html = renderer.render(report);
        assertThat(html).contains("NO VERDICT", "Not enough evidence to judge this SLO",
                "Observed availability is not an SLO pass", "2 of 20 samples needed");
        assertThat(html).doesNotContain("The SLO target was met.");
    }

    @Test
    void noEvidenceAndZeroAllowanceRenderWithoutInventingAvailability() {
        String html = renderer.render(reportWithEvidence(null, null, BigDecimal.ZERO, 0, BigDecimal.ZERO));
        assertThat(html).contains("not available", "No source data", "No failed checks are allowed at this target",
                "No incident transitions recorded", "does not rule out an incident opened earlier");
        assertThat(html).doesNotContain("NaN", "Infinity", "width=\"-");
    }

    @Test
    void overspentBudgetsReadAsChecksOverAndBoundTheChart() {
        String html = renderer.render(reportWithEvidence(new BigDecimal("50.00000"), false,
                BigDecimal.ZERO, 1, new BigDecimal("-1.00000")));
        assertThat(html).contains("MISSED", "Error budget exceeded", "title=\"-1.00000 of 0\"", ">1</span><span class=\"unit\">over",
                "1 check over a budget of 0", "Allowed 0 checks · 1 down");
        assertThat(html).contains("data-meter=\"budget\" data-share=\"1\"><span class=\"meter-fill bad\" style=\"width:100%\"></span></div>");
        assertThat(html).doesNotContain("NaN", "Infinity", "width=\"-");
    }

    @Test
    void countsDistinctIncidentsRatherThanTransitionsAndLabelsTruncation() {
        ReliabilityReport sample = sampleReport();
        String html = renderer.render(sample);
        assertThat(html).contains("class=\"figure\">2</span>", "2 incidents");
        ReliabilityReport truncated = new ReliabilityReport(sample.schemaVersion(), sample.generatedAt(),
                sample.sourceDataWatermark(), sample.monitorName(), sample.targetUrl(), sample.availability(),
                sample.errorBudget(), sample.latency(), sample.incidentTimeline(), true, sample.limitations());
        assertThat(renderer.render(truncated)).contains("class=\"figure\">2+</span>", "Lower bound · timeline truncated",
                "Incident timeline truncated at 100 transitions");
    }

    @Test
    void marksStatusWithDotMatrixBlocksAndTouchingModules() {
        String html = renderer.render(sampleReport());
        String nine = "<i></i>".repeat(9);
        // MET chip, one resolved and one open incident.
        assertThat(html).contains("<span class=\"status-dot good\" aria-hidden=\"true\">" + nine + "</span>MET",
                "<span class=\"status-dot bad\" aria-hidden=\"true\">" + nine + "</span>OPEN<",
                "<span class=\"status-dot good\" aria-hidden=\"true\">" + nine + "</span>RESOLVED");
        assertThat(Pattern.compile("class=\"status-dot ").matcher(html).results().count()).isEqualTo(3);
        assertThat(html).doesNotContain("●").doesNotContain("::before");
        assertThat(html).contains("class=\"decision lit\" data-tone=\"good\"",
                "gap: 1px", "linear-gradient(180deg, color-mix(in srgb, var(--hue) var(--light-fall), transparent) 0%",
                "print-color-adjust: exact");
        String css = html.substring(html.indexOf("<style>"), html.indexOf("</style>"));
        assertThat(html).doesNotContain("class=\"metric lit");
        assertThat(css).doesNotContain("border-left", "border-radius: 2", "box-shadow");
        // The only rounding left is the dot itself.
        assertThat(Pattern.compile("border-radius:\\s*([^;}]+)").matcher(css).results().map(m -> m.group(1)).distinct().toList())
                .containsExactly("50%");
    }

    @Test
    void formatsValuesForPeople() {
        assertThat(renderer.percent(new BigDecimal("99.72222"))).isEqualTo("99.72%");
        assertThat(renderer.percent(new BigDecimal("99.995"))).isEqualTo("100.00%");
        assertThat(renderer.percent(new BigDecimal("100.00000"))).isEqualTo("100.00%");
        assertThat(renderer.percent(null)).isEqualTo("not available");
        assertThat(renderer.given(new BigDecimal("99.50000"))).isEqualTo("99.5%");
        assertThat(renderer.given(new BigDecimal("100"))).isEqualTo("100%");
        assertThat(renderer.oneDecimal(new BigDecimal("3.20000"))).isEqualTo("3.2");
        assertThat(renderer.oneDecimal(new BigDecimal("7.26"))).isEqualTo("7.3");
        assertThat(renderer.oneDecimal(new BigDecimal("-1.00000"))).isEqualTo("-1");
        assertThat(renderer.oneDecimal(new BigDecimal("0.00500"))).isEqualTo("0");
        assertThat(renderer.budgetSentence(sampleReport().errorBudget())).isEqualTo("3.2 of 7.2 checks left");
        Instant from = Instant.parse("2026-10-06T00:00:00Z");
        assertThat(renderer.dateTime(from)).isEqualTo("6 Oct 2026, 00:00 UTC");
        assertThat(renderer.window(from, from.plusSeconds(86400))).isEqualTo("6 Oct 2026, 00:00 → 7 Oct 2026, 00:00 UTC");
        assertThat(renderer.timelineTime(from.plusSeconds(3600))).isEqualTo("6 Oct, 01:00:00");
        assertThat(renderer.shortId(UUID.fromString("ae71250e-bd38-4ef3-83f7-812b4e1b9c30"))).isEqualTo("ae71250e");
        assertThat(renderer.denominator("UP_PLUS_DOWN")).isEqualTo("UP ÷ (UP + DOWN)");
        assertThat(renderer.denominator("ALL_REGIONS_AGREED")).isEqualTo("All regions agreed");
    }

    static ReliabilityReport sampleReport() {
        Instant from = Instant.parse("2026-10-06T00:00:00Z");
        Instant to = Instant.parse("2026-10-07T00:00:00Z");
        UUID first = UUID.fromString("ae71250e-bd38-4ef3-83f7-812b4e1b9c30");
        UUID second = UUID.fromString("c822245b-f2c7-408a-9572-1a91d891682a");
        AvailabilityReport availability = new AvailabilityReport(first, from, to, new BigDecimal("99.5"),
                new BigDecimal("99.72222"), new BigDecimal("100.00000"), new BigDecimal("95"), true,
                1436, 4, 0, 0, 1440, 1440, 0, 0, 1440, "UP_PLUS_DOWN");
        return new ReliabilityReport("rcp-report-v1", to.plusSeconds(300), to.minusSeconds(30),
                "Demo API", "https://example.com/health", availability,
                new ReportErrorBudget(new BigDecimal("7.20000"), 4, new BigDecimal("3.20000")),
                new ReportLatency(2480, 142L, 387L, 20),
                List.of(new ReportIncidentEvent(first, "OPENED", from.plusSeconds(3600)),
                        new ReportIncidentEvent(first, "RESOLVED", from.plusSeconds(3720)),
                        new ReportIncidentEvent(second, "OPENED", to.minusSeconds(180))), false,
                List.of("Coverage includes due schedule slots without an execution and excludes recorded paused periods; maintenance and late-correction policies remain incomplete.",
                        "Maintenance windows and regional SLIs are not implemented.",
                        "Incident timeline contains transitions in the requested window; an incident opened earlier may still be active.",
                        "Latency percentiles use HTTP-response samples only and require at least 20 samples.",
                        "Local region labels do not prove geographic probe execution or AWS production operation."));
    }

    private ReliabilityReport reportWithEvidence(BigDecimal measured, Boolean sloMet,
            BigDecimal allowed, long down, BigDecimal remaining) {
        ReliabilityReport sample = sampleReport();
        AvailabilityReport a = sample.availability();
        long conclusive = measured == null ? 0 : down + 1;
        BigDecimal coverage = sloMet != null ? new BigDecimal("100")
                : measured == null ? BigDecimal.ZERO : BigDecimal.TEN;
        AvailabilityReport evidence = new AvailabilityReport(a.monitorId(), a.from(), a.to(),
                allowed.signum() == 0 ? new BigDecimal("100") : a.sloTargetPercent(),
                measured, coverage, a.minimumEvidenceCoveragePercent(), sloMet,
                measured == null ? 0 : 1, down, 0, 0, conclusive, conclusive, 0,
                sloMet == null ? 10 - conclusive : 0, sloMet == null ? 10 : conclusive, a.denominatorPolicy());
        return new ReliabilityReport(sample.schemaVersion(), sample.generatedAt(), null, sample.monitorName(),
                sample.targetUrl(), evidence, new ReportErrorBudget(allowed, down, remaining),
                new ReportLatency(2, null, null, 20), List.of(), false, sample.limitations());
    }
}

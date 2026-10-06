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
import java.util.UUID;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;

class ReliabilityReportHtmlRendererTest {
    private final ReliabilityReportHtmlRenderer renderer = new ReliabilityReportHtmlRenderer();

    @Test
    void rendersAnOfflineSampleWithAccessibleSvgAndPrintStyles(@TempDir Path directory) throws Exception {
        String html = renderer.render(sampleReport());
        Path download = directory.resolve("reliability-report.html");
        Files.writeString(download, html, StandardCharsets.UTF_8);

        assertThat(Files.readString(download)).isEqualTo(html);
        assertThat(html).contains("Demo API", "https://example.com/health", "99.72222%", "Target 99.5%",
                "3.2 executions", "142 p50 ms", "387 p95 ms", "2480 HTTP samples", "<table>",
                "@media print", "size: A4", "table-header-group", "break-inside: avoid",
                "2026-10-06T00:00:00Z", "2026-10-07T00:05:00Z", "rcp-report-v1");
        assertThat(html).doesNotContain("<script", "<link", "<iframe", "src=", "href=", "@import", "url(", "99.9%");

        // Parse every chart/readout, rather than only checking for the word "svg".
        var parser = DocumentBuilderFactory.newInstance();
        parser.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
        var builder = parser.newDocumentBuilder();
        var charts = Pattern.compile("<svg\\b.*?</svg>", Pattern.DOTALL).matcher(html);
        int count = 0;
        while (charts.find()) {
            var svg = builder.parse(new InputSource(new StringReader(charts.group()))).getDocumentElement();
            assertThat(svg.getTagName()).isEqualTo("svg");
            if (!"true".equals(svg.getAttribute("aria-hidden"))) {
                assertThat(svg.getAttribute("role")).isEqualTo("img");
                assertThat(svg.getElementsByTagName("title").getLength()).isEqualTo(1);
            }
            count++;
        }
        assertThat(count).isGreaterThanOrEqualTo(3);
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
        assertThat(html).contains("<title>" + escaped, "<h2 class=\"monitor\">" + escaped,
                "<p class=\"target mono\">" + escaped, "<code>" + escaped, "<li>" + escaped,
                "Schema: " + escaped, "NO_SOURCE_DATA");
    }

    @Test
    void sparseGreenEvidenceIsNotPresentedAsAnSloPass() {
        ReliabilityReport report = reportWithEvidence(new BigDecimal("100"), null,
                new BigDecimal("0.00500"), 0, new BigDecimal("0.00500"));
        String html = renderer.render(report);
        assertThat(html).contains("INSUFFICIENT_DATA", "Insufficient evidence to judge this SLO",
                "Observed availability is not an SLO pass", "INSUFFICIENT_SAMPLES (minimum 20)");
        assertThat(html).doesNotContain("The observed SLO target was met.");
    }

    @Test
    void noEvidenceAndZeroAllowanceRenderWithoutInventingAvailability() {
        String html = renderer.render(reportWithEvidence(null, null, BigDecimal.ZERO, 0, BigDecimal.ZERO));
        assertThat(html).contains("UNDEFINED", "NO_SOURCE_DATA", "No failed executions allowed",
                "No incident transitions recorded", "does not rule out an incident opened earlier");
        assertThat(html).doesNotContain("NaN", "Infinity", "width=\"-", "aria-label=\"100%\"");
    }

    @Test
    void overspentBudgetsKeepTheirNegativeValueAndBoundTheChart() {
        String html = renderer.render(reportWithEvidence(new BigDecimal("50.00000"), false,
                BigDecimal.ZERO, 1, new BigDecimal("-1.00000")));
        assertThat(html).contains("MISSED", "Budget exceeded", "-1 executions", "Remaining -1.00000",
                "class=\"fill-bad\" y=\"74\" width=\"440\"");
        assertThat(html).doesNotContain("NaN", "Infinity", "width=\"-");
    }

    @Test
    void countsDistinctIncidentsRatherThanTransitionsAndLabelsTruncation() {
        ReliabilityReport sample = sampleReport();
        String html = renderer.render(sample);
        assertThat(html).contains("aria-label=\"2\"", "3 transitions · UTC", "Distinct IDs in shown transitions");
        ReliabilityReport truncated = new ReliabilityReport(sample.schemaVersion(), sample.generatedAt(),
                sample.sourceDataWatermark(), sample.monitorName(), sample.targetUrl(), sample.availability(),
                sample.errorBudget(), sample.latency(), sample.incidentTimeline(), true, sample.limitations());
        assertThat(renderer.render(truncated)).contains("aria-label=\"2+\"", "Lower bound · timeline truncated",
                "Incident timeline truncated at 100 transitions");
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

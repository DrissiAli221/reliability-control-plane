package dev.ali.rcp.reporting;

import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class ReliabilityReportCsvWriterTest {
    private final ReliabilityReportCsvWriter writer = new ReliabilityReportCsvWriter(new ReliabilityReportHtmlRenderer());

    @Test
    void pairsTransitionsIntoOneRowPerIncident() {
        String[] lines = writer.write(ReliabilityReportHtmlRendererTest.sampleReport()).split("\r\n");

        assertThat(lines).containsExactly(
                "incident_id,state,opened_at,resolved_at,duration_seconds",
                "ae71250e-bd38-4ef3-83f7-812b4e1b9c30,RESOLVED,2026-10-06T01:00:00Z,2026-10-06T01:02:00Z,120",
                "c822245b-f2c7-408a-9572-1a91d891682a,OPEN,2026-10-06T23:57:00Z,,");
    }

    @Test
    void leavesUnknownEndsEmptyWhenOnlyTheResolutionIsInTheWindow() {
        UUID id = UUID.fromString("ae71250e-bd38-4ef3-83f7-812b4e1b9c30");
        ReliabilityReport sample = ReliabilityReportHtmlRendererTest.sampleReport();
        ReliabilityReport report = new ReliabilityReport(sample.schemaVersion(), sample.generatedAt(), null,
                sample.monitorName(), sample.targetUrl(), sample.availability(), sample.errorBudget(), sample.latency(),
                List.of(new ReportIncidentEvent(id, "RESOLVED", Instant.parse("2026-10-06T01:00:00Z"))), false,
                sample.limitations(), sample.caveats());

        assertThat(writer.write(report)).endsWith(id + ",RESOLVED,,2026-10-06T01:00:00Z,\r\n");
    }

    @Test
    void emitsOnlyTheHeaderWhenThereAreNoIncidents() {
        ReliabilityReport sample = ReliabilityReportHtmlRendererTest.sampleReport();
        ReliabilityReport report = new ReliabilityReport(sample.schemaVersion(), sample.generatedAt(), null,
                sample.monitorName(), sample.targetUrl(), sample.availability(), sample.errorBudget(), sample.latency(),
                List.of(), false, sample.limitations(), sample.caveats());

        assertThat(writer.write(report)).isEqualTo(ReliabilityReportCsvWriter.HEADER + "\r\n");
    }

    @Test
    void quotesFieldsPerRfc4180() {
        assertThat(ReliabilityReportCsvWriter.field("plain")).isEqualTo("plain");
        assertThat(ReliabilityReportCsvWriter.field("a,b")).isEqualTo("\"a,b\"");
        assertThat(ReliabilityReportCsvWriter.field("say \"hi\"")).isEqualTo("\"say \"\"hi\"\"\"");
        assertThat(ReliabilityReportCsvWriter.field("two\nlines")).isEqualTo("\"two\nlines\"");
    }

    @Test
    void defusesSpreadsheetFormulas() {
        assertThat(ReliabilityReportCsvWriter.field("=SUM(A1)")).isEqualTo("'=SUM(A1)");
        assertThat(ReliabilityReportCsvWriter.field("+1")).isEqualTo("'+1");
        assertThat(ReliabilityReportCsvWriter.field("-1")).isEqualTo("'-1");
        assertThat(ReliabilityReportCsvWriter.field("@cmd")).isEqualTo("'@cmd");
        assertThat(ReliabilityReportCsvWriter.field("=1,2")).isEqualTo("\"'=1,2\"");
        assertThat(ReliabilityReportCsvWriter.field("a=b")).isEqualTo("a=b");
    }
}

package dev.ali.rcp.reporting;

import dev.ali.rcp.availability.AvailabilityReport;

import java.time.Instant;
import java.util.List;

public record ReliabilityReport(
        String schemaVersion,
        Instant generatedAt,
        Instant sourceDataWatermark,
        String monitorName,
        String targetUrl,
        AvailabilityReport availability,
        ReportErrorBudget errorBudget,
        ReportLatency latency,
        List<ReportIncidentEvent> incidentTimeline,
        boolean incidentTimelineTruncated,
        List<String> limitations,
        List<ReportCaveat> caveats
) {
}

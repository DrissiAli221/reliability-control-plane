package dev.ali.rcp.reporting;

import java.time.Instant;
import java.util.UUID;

public record ReportIncidentEvent(UUID incidentId, String eventType, Instant occurredAt) {
}

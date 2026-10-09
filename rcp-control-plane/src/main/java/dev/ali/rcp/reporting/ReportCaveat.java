package dev.ali.rcp.reporting;

/** One stated limit of a report: a short topic label and the plain-language caveat. */
public record ReportCaveat(String topic, String text) {
}

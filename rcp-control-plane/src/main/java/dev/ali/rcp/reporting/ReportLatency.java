package dev.ali.rcp.reporting;

public record ReportLatency(long sampleCount, Long p50Ms, Long p95Ms, int minimumSamples) {
}

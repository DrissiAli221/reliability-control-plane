package dev.ali.rcp.probes.sqs;

public record ProbeJobPoll(
        String region,
        int received,
        int completed,
        int processingFailures,
        int acknowledgementFailures
) {
}

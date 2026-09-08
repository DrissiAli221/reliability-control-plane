package dev.ali.rcp.probes.sqs;

import org.springframework.modulith.NamedInterface;

@NamedInterface("runtime")
public record ProbeResultPoll(
        int received,
        int stored,
        int duplicates,
        int processingFailures,
        int acknowledgementFailures
) {
}

package dev.ali.rcp.scheduling.outbox;

public record OutboxPublishResult(
        int claimed,
        int published,
        int failed,
        int lostClaims
) {
}

package dev.ali.rcp.scheduling.outbox;

import java.time.Duration;
import java.util.UUID;

public final class OutboxRetryPolicy {

    private static final Duration BASE_DELAY = Duration.ofSeconds(1);
    private static final Duration MAX_DELAY = Duration.ofMinutes(1);

    public Duration delayFor(
            UUID eventId,
            int attemptNumber
    ) {
        if (attemptNumber < 1) {
            throw new IllegalArgumentException(
                    "attemptNumber must be positive"
            );
        }

        int exponent = Math.min(attemptNumber - 1, 20);
        long exponentialMillis = Math.min(
                MAX_DELAY.toMillis(),
                Math.multiplyExact(
                        BASE_DELAY.toMillis(),
                        1L << exponent
                )
        );

        long jitterRange = exponentialMillis / 2;
        long eventHash = eventId.getMostSignificantBits()
                ^ eventId.getLeastSignificantBits()
                ^ attemptNumber;
        long jitterMillis = Math.floorMod(
                eventHash,
                jitterRange + 1
        );

        return Duration.ofMillis(
                Math.min(
                        MAX_DELAY.toMillis(),
                        exponentialMillis + jitterMillis
                )
        );
    }
}

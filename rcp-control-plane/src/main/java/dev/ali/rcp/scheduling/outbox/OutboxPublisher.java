package dev.ali.rcp.scheduling.outbox;

import java.time.Duration;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

public final class OutboxPublisher {

    private static final int DEFAULT_BATCH_SIZE = 50;
    private static final int DEFAULT_MAX_ATTEMPTS = 5;
    private static final Duration DEFAULT_LEASE_DURATION =
            Duration.ofSeconds(30);
    private static final int MAX_ERROR_LENGTH = 2_000;

    private final OutboxRepository outboxRepository;
    private final ProbeJobTransport transport;
    private final OutboxRetryPolicy retryPolicy;
    private final String publisherId;
    private final int batchSize;
    private final int maxAttempts;
    private final Duration leaseDuration;

    public OutboxPublisher(
            OutboxRepository outboxRepository,
            ProbeJobTransport transport
    ) {
        this(
                outboxRepository,
                transport,
                new OutboxRetryPolicy(),
                "outbox-" + UUID.randomUUID(),
                DEFAULT_BATCH_SIZE,
                DEFAULT_MAX_ATTEMPTS,
                DEFAULT_LEASE_DURATION
        );
    }

    OutboxPublisher(
            OutboxRepository outboxRepository,
            ProbeJobTransport transport,
            OutboxRetryPolicy retryPolicy,
            String publisherId,
            int batchSize,
            int maxAttempts,
            Duration leaseDuration
    ) {
        this.outboxRepository = Objects.requireNonNull(outboxRepository);
        this.transport = Objects.requireNonNull(transport);
        this.retryPolicy = Objects.requireNonNull(retryPolicy);
        this.publisherId = Objects.requireNonNull(publisherId);
        this.batchSize = batchSize;
        this.maxAttempts = maxAttempts;
        this.leaseDuration = Objects.requireNonNull(leaseDuration);
    }

    public OutboxPublishResult publishBatch() {
        List<ClaimedOutboxEvent> events =
                outboxRepository.claimReadyEvents(
                        publisherId,
                        batchSize,
                        leaseDuration
                );

        int published = 0;
        int failed = 0;
        int lostClaims = 0;

        for (ClaimedOutboxEvent event : events) {
            try {
                transport.send(
                        event.destinationRegion(),
                        event.payload()
                );

                if (outboxRepository.markPublished(
                        event.eventId(),
                        publisherId
                )) {
                    published++;
                } else {
                    lostClaims++;
                }
            } catch (Exception exception) {
                if (exception instanceof InterruptedException) {
                    Thread.currentThread().interrupt();
                }

                int attemptNumber =
                        event.previousAttemptCount() + 1;
                Duration retryDelay = retryPolicy.delayFor(
                        event.eventId(),
                        attemptNumber
                );

                if (outboxRepository.recordFailedAttempt(
                        event.eventId(),
                        publisherId,
                        maxAttempts,
                        retryDelay,
                        safeError(exception)
                )) {
                    failed++;
                } else {
                    lostClaims++;
                }
            }
        }

        return new OutboxPublishResult(
                events.size(),
                published,
                failed,
                lostClaims
        );
    }

    private String safeError(Exception exception) {
        String error = exception.getClass().getSimpleName()
                + ": "
                + Objects.toString(exception.getMessage(), "");

        return error.substring(0, Math.min(error.length(), MAX_ERROR_LENGTH));
    }
}

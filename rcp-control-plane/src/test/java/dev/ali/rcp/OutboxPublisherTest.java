package dev.ali.rcp;

import dev.ali.rcp.monitors.Monitor;
import dev.ali.rcp.monitors.MonitorRepository;
import dev.ali.rcp.scheduling.DueMonitorScheduler;
import dev.ali.rcp.scheduling.outbox.ClaimedOutboxEvent;
import dev.ali.rcp.scheduling.outbox.OutboxPublishResult;
import dev.ali.rcp.scheduling.outbox.OutboxPublisher;
import dev.ali.rcp.scheduling.outbox.OutboxRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
@Transactional
class OutboxPublisherTest {

    @Autowired
    private MonitorRepository monitorRepository;

    @Autowired
    private DueMonitorScheduler scheduler;

    @Autowired
    private OutboxRepository outboxRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void publishesClaimedEventsAndMarksThemComplete() {
        createScheduledWork();
        List<String> sentRegions = new ArrayList<>();

        OutboxPublisher publisher = new OutboxPublisher(
                outboxRepository,
                (region, payload) -> sentRegions.add(region)
        );

        OutboxPublishResult result = publisher.publishBatch();

        assertThat(result).isEqualTo(
                new OutboxPublishResult(2, 2, 0, 0)
        );
        assertThat(sentRegions)
                .containsExactlyInAnyOrder("eu-west-1", "us-east-1");
        assertThat(countPublishedEvents()).isEqualTo(2);
        assertThat(countClaimedEvents()).isZero();
    }

    @Test
    void queueFailureKeepsCommittedEventsForRetry() {
        createScheduledWork();

        OutboxPublisher publisher = new OutboxPublisher(
                outboxRepository,
                (region, payload) -> {
                    throw new IllegalStateException("queue unavailable");
                }
        );

        OutboxPublishResult result = publisher.publishBatch();

        assertThat(result).isEqualTo(
                new OutboxPublishResult(2, 0, 2, 0)
        );
        assertThat(countPublishedEvents()).isZero();
        assertThat(countClaimedEvents()).isZero();
        assertThat(minimumAttemptCount()).isEqualTo(1);
        assertThat(countRetryableEvents()).isEqualTo(2);
    }

    @Test
    void anotherPublisherCannotTakeAnActiveLeaseButCanRecoverAnExpiredOne() {
        createScheduledWork();

        List<ClaimedOutboxEvent> firstClaim =
                outboxRepository.claimReadyEvents(
                        "publisher-a",
                        50,
                        Duration.ofMinutes(1)
                );

        List<ClaimedOutboxEvent> blockedClaim =
                outboxRepository.claimReadyEvents(
                        "publisher-b",
                        50,
                        Duration.ofMinutes(1)
                );

        assertThat(firstClaim).hasSize(2);
        assertThat(blockedClaim).isEmpty();

        jdbcTemplate.update(
                """
                UPDATE outbox_events
                SET claimed_until = CURRENT_TIMESTAMP - INTERVAL '1 second'
                WHERE claimed_by = 'publisher-a'
                """
        );

        List<ClaimedOutboxEvent> recoveredClaim =
                outboxRepository.claimReadyEvents(
                        "publisher-b",
                        50,
                        Duration.ofMinutes(1)
                );

        assertThat(recoveredClaim).hasSize(2);
    }

    private void createScheduledWork() {
        Monitor monitor = Monitor.create(
                "outbox-test-owner",
                "Outbox target",
                "https://example.com",
                60,
                5_000,
                Instant.parse("2026-08-17T12:00:00Z")
        );

        monitorRepository.saveAndFlush(monitor);
        assertThat(scheduler.scheduleBatch()).isEqualTo(1);
    }

    private int countPublishedEvents() {
        return jdbcTemplate.queryForObject(
                """
                SELECT COUNT(*)
                FROM outbox_events
                WHERE published_at IS NOT NULL
                """,
                Integer.class
        );
    }

    private int countClaimedEvents() {
        return jdbcTemplate.queryForObject(
                """
                SELECT COUNT(*)
                FROM outbox_events
                WHERE claimed_by IS NOT NULL
                   OR claimed_until IS NOT NULL
                """,
                Integer.class
        );
    }

    private int minimumAttemptCount() {
        return jdbcTemplate.queryForObject(
                "SELECT MIN(attempt_count) FROM outbox_events",
                Integer.class
        );
    }

    private int countRetryableEvents() {
        return jdbcTemplate.queryForObject(
                """
                SELECT COUNT(*)
                FROM outbox_events
                WHERE published_at IS NULL
                  AND failed_at IS NULL
                  AND next_attempt_at > CURRENT_TIMESTAMP
                  AND last_error LIKE 'IllegalStateException:%'
                """,
                Integer.class
        );
    }
}

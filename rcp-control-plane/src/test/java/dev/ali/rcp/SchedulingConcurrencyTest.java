package dev.ali.rcp;

import dev.ali.rcp.monitors.Monitor;
import dev.ali.rcp.monitors.MonitorRepository;
import dev.ali.rcp.scheduling.DueMonitor;
import dev.ali.rcp.scheduling.SchedulingRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
class SchedulingConcurrencyTest {

    private static final String OWNER = "scheduler-concurrency-test";

    @Autowired
    private MonitorRepository monitorRepository;

    @Autowired
    private SchedulingRepository schedulingRepository;

    @Autowired
    private PlatformTransactionManager transactionManager;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @AfterEach
    void deleteTestMonitor() {
        monitorRepository.findAll().stream()
                .filter(monitor -> OWNER.equals(monitor.getOwnerSubject()))
                .forEach(monitor -> {
                    jdbcTemplate.update("DELETE FROM monitor_schedule_periods WHERE monitor_id = ?", monitor.getId());
                    monitorRepository.delete(monitor);
                });
    }

    @Test
    void secondTransactionSkipsMonitorLockedByFirstTransaction()
            throws Exception {
        Monitor monitor = Monitor.create(
                OWNER,
                "Concurrent scheduling target",
                "https://example.com",
                60,
                5_000,
                Instant.parse("2026-08-17T12:00:00Z")
        );
        monitorRepository.saveAndFlush(monitor);

        CountDownLatch firstTransactionHasLock = new CountDownLatch(1);
        CountDownLatch secondTransactionFinishedQuery =
                new CountDownLatch(1);

        ExecutorService executor = Executors.newFixedThreadPool(2);

        try {
            Future<List<DueMonitor>> firstClaim = executor.submit(() ->
                    inTransaction(() -> {
                        List<DueMonitor> claimed =
                                schedulingRepository
                                        .findAndLockDueMonitors(1);

                        firstTransactionHasLock.countDown();

                        boolean secondFinished = await(
                                secondTransactionFinishedQuery
                        );

                        if (!secondFinished) {
                            throw new AssertionError(
                                    "Second scheduler waited on the locked row"
                            );
                        }

                        return claimed;
                    })
            );

            Future<List<DueMonitor>> secondClaim = executor.submit(() -> {
                boolean firstHasLock = await(
                        firstTransactionHasLock
                );

                if (!firstHasLock) {
                    throw new AssertionError(
                            "First scheduler never acquired the row lock"
                    );
                }

                return inTransaction(() -> {
                    List<DueMonitor> claimed =
                            schedulingRepository
                                    .findAndLockDueMonitors(1);
                    secondTransactionFinishedQuery.countDown();
                    return claimed;
                });
            });

            assertThat(firstClaim.get(10, TimeUnit.SECONDS))
                    .extracting(DueMonitor::monitorId)
                    .containsExactly(monitor.getId());
            assertThat(secondClaim.get(10, TimeUnit.SECONDS)).isEmpty();
        } finally {
            executor.shutdownNow();
        }
    }

    private <T> T inTransaction(TransactionWork<T> work) {
        TransactionTemplate transaction =
                new TransactionTemplate(transactionManager);

        return Objects.requireNonNull(
                transaction.execute(status -> work.execute())
        );
    }

    private boolean await(CountDownLatch latch) {
        try {
            return latch.await(5, TimeUnit.SECONDS);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(
                    "Interrupted while coordinating scheduler transactions",
                    exception
            );
        }
    }

    @FunctionalInterface
    private interface TransactionWork<T> {
        T execute();
    }
}

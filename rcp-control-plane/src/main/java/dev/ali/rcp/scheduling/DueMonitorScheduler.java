package dev.ali.rcp.scheduling;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Service
public class DueMonitorScheduler {

    private static final int BATCH_SIZE = 50;
    private static final long INCIDENT_POLICY_VERSION = 1;
    private static final Duration RESULT_GRACE_PERIOD =
            Duration.ofSeconds(30);
    private static final List<String> PROBE_REGIONS = List.of(
            "eu-west-1",
            "us-east-1"
    );

    private final SchedulingRepository schedulingRepository;

    public DueMonitorScheduler(
            SchedulingRepository schedulingRepository
    ) {
        this.schedulingRepository = schedulingRepository;
    }

    @Transactional
    public int scheduleBatch() {
        Instant databaseNow = schedulingRepository.currentDatabaseTime();
        List<DueMonitor> dueMonitors =
                schedulingRepository.findAndLockDueMonitors(BATCH_SIZE);

        for (DueMonitor monitor : dueMonitors) {
            scheduleMonitor(monitor, databaseNow);
        }

        return dueMonitors.size();
    }

    private void scheduleMonitor(
            DueMonitor monitor,
            Instant databaseNow
    ) {
        UUID executionId = UUID.randomUUID();
        Instant resultDeadlineAt = databaseNow
                .plusMillis(monitor.timeoutMs())
                .plus(RESULT_GRACE_PERIOD);

        schedulingRepository.insertExecution(
                executionId,
                monitor,
                resultDeadlineAt,
                INCIDENT_POLICY_VERSION,
                PROBE_REGIONS.size()
        );

        for (String probeRegion : PROBE_REGIONS) {
            schedulingRepository.insertJobAndOutboxEvent(
                    executionId,
                    UUID.randomUUID(),
                    UUID.randomUUID(),
                    monitor,
                    probeRegion,
                    resultDeadlineAt
            );
        }

        schedulingRepository.advanceNextCheckAt(
                monitor.monitorId(),
                monitor.scheduledAt(),
                firstFutureDueTime(monitor, databaseNow)
        );
    }

    private Instant firstFutureDueTime(
            DueMonitor monitor,
            Instant databaseNow
    ) {
        long intervalSeconds = monitor.checkIntervalSeconds();
        long elapsedSeconds = Duration.between(
                monitor.scheduledAt(),
                databaseNow
        ).getSeconds();

        long intervalsToAdvance =
                Math.floorDiv(elapsedSeconds, intervalSeconds) + 1;

        long secondsToAdvance = Math.multiplyExact(
                intervalsToAdvance,
                intervalSeconds
        );

        return monitor.scheduledAt().plusSeconds(secondsToAdvance);
    }
}

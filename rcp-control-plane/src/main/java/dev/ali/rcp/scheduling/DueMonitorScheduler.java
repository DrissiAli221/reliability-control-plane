package dev.ali.rcp.scheduling;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;

@Service
public class DueMonitorScheduler {
    private static final Logger LOG = LoggerFactory.getLogger(DueMonitorScheduler.class);

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

    public static Set<String> probeRegions() {
        return Set.copyOf(PROBE_REGIONS);
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
            UUID jobId = UUID.randomUUID();
            UUID eventId = UUID.randomUUID();
            schedulingRepository.insertJobAndOutboxEvent(
                    executionId,
                    jobId,
                    eventId,
                    monitor,
                    probeRegion,
                    resultDeadlineAt
            );
            LOG.atInfo()
                    .addKeyValue("monitorId", monitor.monitorId())
                    .addKeyValue("executionId", executionId)
                    .addKeyValue("jobId", jobId)
                    .addKeyValue("eventId", eventId)
                    .addKeyValue("probeRegion", probeRegion)
                    .log("probe job and outbox intent staged in scheduling transaction");
        }

        schedulingRepository.advanceNextCheckAt(
                monitor.monitorId(),
                monitor.scheduledAt(),
                firstFutureDueTime(monitor, databaseNow)
        );

        LOG.atInfo()
                .addKeyValue("monitorId", monitor.monitorId())
                .addKeyValue("executionId", executionId)
                .addKeyValue("scheduledAt", monitor.scheduledAt())
                .addKeyValue("regionCount", PROBE_REGIONS.size())
                .log("probe execution scheduled");
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

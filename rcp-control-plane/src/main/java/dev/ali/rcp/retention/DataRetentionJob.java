package dev.ali.rcp.retention;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Runs retention once a day, only where the processing loops run, so tests and read-only replicas never prune. */
@Component
@ConditionalOnProperty(prefix = "rcp.runtime", name = "enabled", havingValue = "true")
class DataRetentionJob {
    private static final Logger log = LoggerFactory.getLogger(DataRetentionJob.class);

    private final DataRetention retention;

    DataRetentionJob(DataRetention retention) {
        this.retention = retention;
    }

    @Scheduled(cron = "${rcp.retention.cron:0 30 4 * * *}", zone = "UTC")
    void prune() {
        DataRetention.Result result = retention.prune();
        log.info("Data retention removed {} executions, {} outbox events and {} processed-message ids",
                result.executions(), result.outboxEvents(), result.processedMessages());
    }
}

package dev.ali.rcp.retention;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.List;
import java.util.UUID;

/**
 * Deletes evidence nobody can see any more, so the database and its backups stop growing with every check.
 *
 * <ul>
 *   <li>Check history (executions, their jobs, results and incident evaluations) older than the history window.
 *       The window must cover the longest view, the 45-day status page; older availability windows then report
 *       less coverage rather than a guessed number. Only executions whose incident decision is recorded are
 *       deleted. Executions that opened or resolved an incident are kept, so incident timelines stay complete, and so
 *       is each monitor's last evaluated execution, which incident processing reads when a paused monitor resumes.</li>
 *   <li>Queue bookkeeping (published outbox events and processed-message ids) older than the bookkeeping window.
 *       Its job is deduplicating redelivered messages, and SQS keeps messages for at most four days.</li>
 * </ul>
 *
 * Ages are measured with database time, like scheduling, and rows are deleted in small batches so the live
 * pipeline never waits long on a lock.
 */
@Component
public class DataRetention {
    static final int MINIMUM_HISTORY_DAYS = 46;
    static final int MINIMUM_BOOKKEEPING_DAYS = 5;

    private final JdbcTemplate jdbc;
    private final TransactionTemplate transactions;
    private final int historyDays;
    private final int bookkeepingDays;
    private final int batchSize;

    DataRetention(
            JdbcTemplate jdbc,
            TransactionTemplate transactions,
            @Value("${rcp.retention.check-history-days:90}") int historyDays,
            @Value("${rcp.retention.queue-bookkeeping-days:14}") int bookkeepingDays,
            @Value("${rcp.retention.batch-size:500}") int batchSize
    ) {
        if (historyDays < MINIMUM_HISTORY_DAYS) {
            throw new IllegalArgumentException("rcp.retention.check-history-days must be at least " + MINIMUM_HISTORY_DAYS
                    + " so the 45-day status history stays complete");
        }
        if (bookkeepingDays < MINIMUM_BOOKKEEPING_DAYS) {
            throw new IllegalArgumentException("rcp.retention.queue-bookkeeping-days must be at least " + MINIMUM_BOOKKEEPING_DAYS
                    + " because SQS can redeliver a message for up to four days");
        }
        if (batchSize < 1) throw new IllegalArgumentException("rcp.retention.batch-size must be positive");
        this.jdbc = jdbc;
        this.transactions = transactions;
        this.historyDays = historyDays;
        this.bookkeepingDays = bookkeepingDays;
        this.batchSize = batchSize;
    }

    public Result prune() {
        long executions = 0;
        int batch;
        do {
            batch = transactions.execute(status -> pruneExecutionBatch());
            executions += batch;
        } while (batch == batchSize);

        long outbox = deleteInBatches("""
                DELETE FROM outbox_events WHERE event_id IN (
                    SELECT event_id FROM outbox_events
                    WHERE published_at < CURRENT_TIMESTAMP - make_interval(days => ?)
                    LIMIT ?)
                """);
        long messages = deleteInBatches("""
                DELETE FROM processed_messages WHERE (consumer_name, message_id) IN (
                    SELECT consumer_name, message_id FROM processed_messages
                    WHERE processed_at < CURRENT_TIMESTAMP - make_interval(days => ?)
                    LIMIT ?)
                """);
        return new Result(executions, outbox, messages);
    }

    private int pruneExecutionBatch() {
        List<UUID> ids = jdbc.queryForList("""
                SELECT e.execution_id FROM probe_executions e
                WHERE e.status = 'FINALIZED'
                  AND e.scheduled_at < CURRENT_TIMESTAMP - make_interval(days => ?)
                  -- Finalized only means the regions answered; the incident decision is a separate, later step.
                  AND EXISTS (SELECT 1 FROM incident_evaluations done WHERE done.execution_id = e.execution_id)
                  -- Incident processing reads the monitor's last evaluated check to detect a changed configuration,
                  -- which after a long pause can be far older than the history window.
                  AND NOT EXISTS (SELECT 1 FROM monitor_incident_state s
                                  WHERE s.monitor_id = e.monitor_id AND s.last_evaluated_at = e.scheduled_at)
                  AND NOT EXISTS (SELECT 1 FROM incidents i
                                  WHERE i.opened_by_execution_id = e.execution_id
                                     OR i.resolved_by_execution_id = e.execution_id)
                  AND NOT EXISTS (SELECT 1 FROM incident_events ev WHERE ev.execution_id = e.execution_id)
                ORDER BY e.scheduled_at
                LIMIT ?
                FOR UPDATE SKIP LOCKED
                """, UUID.class, historyDays, batchSize);
        if (ids.isEmpty()) return 0;
        UUID[] batch = ids.toArray(UUID[]::new);
        // Children first: results point at jobs, and jobs and evaluations point at executions.
        jdbc.update("DELETE FROM probe_results WHERE execution_id = ANY (?)", (Object) batch);
        jdbc.update("DELETE FROM probe_jobs WHERE execution_id = ANY (?)", (Object) batch);
        jdbc.update("DELETE FROM incident_evaluations WHERE execution_id = ANY (?)", (Object) batch);
        return jdbc.update("DELETE FROM probe_executions WHERE execution_id = ANY (?)", (Object) batch);
    }

    private long deleteInBatches(String sql) {
        long total = 0;
        int deleted;
        do {
            deleted = jdbc.update(sql, bookkeepingDays, batchSize);
            total += deleted;
        } while (deleted == batchSize);
        return total;
    }

    public record Result(long executions, long outboxEvents, long processedMessages) {
    }
}

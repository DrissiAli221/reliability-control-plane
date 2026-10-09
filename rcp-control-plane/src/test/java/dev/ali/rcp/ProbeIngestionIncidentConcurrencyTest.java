package dev.ali.rcp;

import dev.ali.rcp.incidents.IncidentProcessor;
import dev.ali.rcp.incidents.IncidentRepository;
import dev.ali.rcp.probes.ProbeMessageCodec;
import dev.ali.rcp.probes.ProbeOutcome;
import dev.ali.rcp.probes.ProbeResult;
import dev.ali.rcp.probes.ProbeResultIngestion;
import dev.ali.rcp.probes.ProbeResultIngestionService;
import dev.ali.rcp.probes.ProbeResultRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Instant;
import java.time.ZoneOffset;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.reset;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
class ProbeIngestionIncidentConcurrencyTest {
    @Autowired private JdbcTemplate jdbc;
    @Autowired private PlatformTransactionManager transactionManager;
    @Autowired private IncidentProcessor processor;
    @Autowired private ProbeResultIngestionService ingestion;
    @Autowired private ProbeMessageCodec codec;
    @MockitoSpyBean private IncidentRepository incidents;
    @MockitoSpyBean private ProbeResultRepository results;

    @Test
    void lateResultAndIncidentEvaluationCommitWithoutDeadlockingOrRejudgingTheVerdict() throws Exception {
        UUID monitor = UUID.randomUUID(), execution = UUID.randomUUID(), job = UUID.randomUUID();
        String messageId = "late-result-" + job;
        Instant scheduledAt = Instant.now().minusSeconds(60);
        var at = scheduledAt.atOffset(ZoneOffset.UTC);
        var transactions = new TransactionTemplate(transactionManager);
        transactions.executeWithoutResult(status -> {
            jdbc.update("""
                    INSERT INTO monitors (monitor_id,owner_subject,name,target_url,
                        check_interval_seconds,timeout_ms,next_check_at)
                    VALUES (?,?,'Late-result fixture','https://example.com',60,5000,CURRENT_TIMESTAMP)
                    """, monitor, "concurrent-" + monitor);
            jdbc.update("""
                    INSERT INTO probe_executions (execution_id,monitor_id,scheduled_at,result_deadline_at,
                        target_url_snapshot,timeout_ms_snapshot,monitor_behavior_version,incident_policy_version,
                        expected_region_count,status,verdict,finalized_at)
                    VALUES (?,?,?,?,'https://example.com',5000,1,1,2,'FINALIZED','NO_DATA',?)
                    """, execution, monitor, at, at.plusSeconds(30), at.plusSeconds(31));
            jdbc.update("INSERT INTO probe_jobs (job_id,execution_id,probe_region) VALUES (?,?,'eu-west-1')", job, execution);
        });
        var result = new ProbeResult(job, execution, monitor, "eu-west-1", scheduledAt,
                scheduledAt.plusSeconds(1), scheduledAt.plusMillis(1030), ProbeOutcome.HTTP_RESPONSE,
                200, 30, 2, null, 1);
        var executionLocked = new CountDownLatch(1);
        var monitorShared = new CountDownLatch(1);
        var monitorWriteRequested = new CountDownLatch(1);

        // Force the actual repository calls into the formerly deadlocking order, without sleeps.
        doAnswer(invocation -> {
            Object candidates = invocation.callRealMethod();
            executionLocked.countDown();
            await(monitorShared);
            return candidates;
        }).when(incidents).findAndLockNextUnevaluated(anyInt());
        doAnswer(invocation -> {
            monitorWriteRequested.countDown();
            return invocation.callRealMethod();
        }).when(incidents).lockMonitorRun(monitor);
        doAnswer(invocation -> {
            Object live = invocation.callRealMethod();
            monitorShared.countDown();
            await(monitorWriteRequested);
            return live;
        }).when(results).lockLiveMonitor(monitor);

        var pool = Executors.newFixedThreadPool(2);
        try {
            var evaluated = pool.submit(() -> transactions.execute(status -> {
                jdbc.execute("SET LOCAL statement_timeout = '10s'");
                return processor.processBatch();
            }));
            await(executionLocked);
            var stored = pool.submit(() -> transactions.execute(status -> {
                jdbc.execute("SET LOCAL statement_timeout = '10s'");
                return ingestion.ingest(messageId, codec.encodeResult(result));
            }));
            assertThat(stored.get(15, TimeUnit.SECONDS)).isEqualTo(ProbeResultIngestion.STORED);
            assertThat(evaluated.get(15, TimeUnit.SECONDS)).isEqualTo(1);
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM probe_results WHERE job_id = ?", Integer.class, job)).isEqualTo(1);
            assertThat(jdbc.queryForObject("SELECT verdict FROM probe_executions WHERE execution_id = ?", String.class, execution)).isEqualTo("NO_DATA");
            assertThat(jdbc.queryForObject("SELECT transition FROM incident_evaluations WHERE execution_id = ?", String.class, execution)).isEqualTo("NONE");
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM incidents WHERE monitor_id = ?", Integer.class, monitor)).isZero();
        } finally {
            executionLocked.countDown();
            monitorShared.countDown();
            monitorWriteRequested.countDown();
            pool.shutdownNow();
            assertThat(pool.awaitTermination(15, TimeUnit.SECONDS)).isTrue();
            reset(incidents, results);
            transactions.executeWithoutResult(status -> {
                jdbc.update("DELETE FROM processed_messages WHERE message_id = ?", messageId);
                jdbc.update("DELETE FROM probe_results WHERE execution_id = ?", execution);
                jdbc.update("DELETE FROM monitor_incident_state WHERE monitor_id = ?", monitor);
                jdbc.update("DELETE FROM incident_evaluations WHERE execution_id = ?", execution);
                jdbc.update("DELETE FROM probe_jobs WHERE execution_id = ?", execution);
                jdbc.update("DELETE FROM probe_executions WHERE execution_id = ?", execution);
                jdbc.update("DELETE FROM monitor_schedule_periods WHERE monitor_id = ?", monitor);
                jdbc.update("DELETE FROM monitors WHERE monitor_id = ?", monitor);
            });
        }
    }

    private static void await(CountDownLatch latch) {
        try {
            if (!latch.await(10, TimeUnit.SECONDS)) throw new AssertionError("Concurrent repository call did not arrive");
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(interrupted);
        }
    }
}

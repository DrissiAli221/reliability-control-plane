package dev.ali.rcp;

import dev.ali.rcp.monitors.*;
import dev.ali.rcp.probes.*;
import dev.ali.rcp.scheduling.DueMonitorScheduler;
import dev.ali.rcp.scheduling.SchedulingRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class MonitorDeletionTest {
    @Autowired MockMvc mvc;
    @Autowired jakarta.persistence.EntityManager entities;
    @Autowired MonitorService service;
    @Autowired MonitorRepository monitors;
    @Autowired SafeTargetPolicy targets;
    @Autowired org.springframework.transaction.PlatformTransactionManager txManager;
    @Autowired JdbcTemplate jdbc;
    @Autowired DueMonitorScheduler scheduler;
    @Autowired SchedulingRepository scheduling;
    @Autowired ProbeMessageCodec codec;
    @Autowired ProbeResultIngestionService ingestion;

    @Test
    @Transactional(propagation = org.springframework.transaction.annotation.Propagation.NOT_SUPPORTED)
    void resultWaitingOnDeletionIsAcknowledgedAfterTheDeleteCommits() throws Exception {
        String owner = "delete-race-" + UUID.randomUUID();
        UUID id = service.create(owner, new CreateMonitorRequest("Race", "https://1.1.1.1/", 60, 5000)).id();
        Instant at = Instant.now();
        UUID execution = UUID.randomUUID(), job = UUID.randomUUID();
        String message = "deleted-race-" + job;
        jdbc.update("""
                INSERT INTO probe_executions(execution_id,monitor_id,scheduled_at,result_deadline_at,
                    target_url_snapshot,timeout_ms_snapshot,monitor_behavior_version,incident_policy_version,expected_region_count)
                VALUES (?,?,?,?,'https://1.1.1.1/',5000,1,1,1)
                """,execution,id,at.atOffset(java.time.ZoneOffset.UTC),at.plusSeconds(60).atOffset(java.time.ZoneOffset.UTC));
        jdbc.update("INSERT INTO probe_jobs(job_id,execution_id,probe_region) VALUES (?,?,'eu-west-1')", job, execution);
        ProbeResult result = new ProbeResult(job,execution,id,"eu-west-1",at,at,at.plusMillis(30),ProbeOutcome.HTTP_RESPONSE,200,30,0,null,1);
        var locked = new java.util.concurrent.CountDownLatch(1);
        var release = new java.util.concurrent.CountDownLatch(1);
        var started = new java.util.concurrent.CountDownLatch(1);
        try (var pool = java.util.concurrent.Executors.newFixedThreadPool(2)) {
            var deletion = pool.submit(() -> new org.springframework.transaction.support.TransactionTemplate(txManager).execute(status -> {
                service.delete(owner,id); locked.countDown();
                try { if (!release.await(5, java.util.concurrent.TimeUnit.SECONDS)) throw new AssertionError("Delete release timed out"); }
                catch (InterruptedException e) { Thread.currentThread().interrupt(); throw new IllegalStateException(e); }
                return true;
            }));
            assertThat(locked.await(5,java.util.concurrent.TimeUnit.SECONDS)).isTrue();
            var late = pool.submit(() -> { started.countDown(); return ingestion.ingest(message,codec.encodeResult(result)); });
            try {
                assertThat(started.await(5,java.util.concurrent.TimeUnit.SECONDS)).isTrue();
                assertThatThrownBy(() -> late.get(200,java.util.concurrent.TimeUnit.MILLISECONDS)).isInstanceOf(java.util.concurrent.TimeoutException.class);
            } finally { release.countDown(); }
            assertThat(deletion.get(5,java.util.concurrent.TimeUnit.SECONDS)).isTrue();
            assertThat(late.get(5,java.util.concurrent.TimeUnit.SECONDS)).isEqualTo(ProbeResultIngestion.DISCARDED_MONITOR);
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM probe_results WHERE job_id = ?",Integer.class,job)).isZero();
        } finally {
            release.countDown();
            jdbc.update("DELETE FROM processed_messages WHERE message_id = ?",message);
            jdbc.update("DELETE FROM probe_results WHERE execution_id = ?",execution);
            jdbc.update("DELETE FROM probe_jobs WHERE execution_id = ?",execution);
            jdbc.update("DELETE FROM probe_executions WHERE execution_id = ?",execution);
            jdbc.update("DELETE FROM monitor_schedule_periods WHERE monitor_id = ?",id);
            jdbc.update("DELETE FROM monitors WHERE monitor_id = ?",id);
        }
    }

    @Test void deletionHidesEveryOwnerViewRemovesPublicMembershipAndDropsAnInFlightResult() throws Exception {
        String owner = "delete-" + UUID.randomUUID();
        UUID id = service.create(owner, new CreateMonitorRequest("Delete target", "https://1.1.1.1/", 60, 5000)).id();
        UUID page = UUID.randomUUID();
        jdbc.update("INSERT INTO status_pages(page_id,owner_subject,name,slug,published) VALUES (?,?,'Page',?,true)", page, owner, page.toString());
        jdbc.update("INSERT INTO status_page_monitors(page_id,monitor_id,sort_order) VALUES (?,?,0)",page,id);
        jdbc.update("UPDATE monitors SET next_check_at = CURRENT_TIMESTAMP WHERE monitor_id = ?", id);
        assertThat(scheduler.scheduleBatch()).isPositive();
        UUID execution = jdbc.queryForObject("SELECT execution_id FROM probe_executions WHERE monitor_id = ?", UUID.class,id);
        UUID job = jdbc.queryForObject("SELECT job_id FROM probe_jobs WHERE execution_id = ? AND probe_region = 'eu-west-1'", UUID.class,execution);
        Instant at = jdbc.queryForObject("SELECT scheduled_at FROM probe_executions WHERE execution_id = ?", OffsetDateTime.class,execution).toInstant();
        mvc.perform(delete("/api/monitors/{id}",id).with(jwt().jwt(t -> t.subject("stranger")))).andExpect(status().isNotFound());
        mvc.perform(delete("/api/monitors/{id}",id).with(jwt().jwt(t -> t.subject(owner)))).andExpect(status().isNoContent());
        entities.clear();
        assertThat(monitors.findById(id)).isEmpty();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM status_page_monitors WHERE monitor_id = ?",Integer.class,id)).isZero();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM outbox_events WHERE payload->>'monitorId' = ? AND failed_at IS NULL",Integer.class,id.toString())).isZero();
        assertThat(scheduling.findAndLockDueMonitors(100)).noneMatch(m -> m.monitorId().equals(id));
        for (String route : new String[]{"", "/history", "/latency-heatmap", "/availability", "/reliability-report", "/incident-state", "/reliability-report/html", "/reliability-report/csv", "/executions/"+execution+"/trace"}) {
            mvc.perform(get("/api/monitors/"+id+route).param("from",Instant.now().minusSeconds(86400).toString()).param("to",Instant.now().toString()).with(jwt().jwt(t -> t.subject(owner)))).andExpect(status().isNotFound());
        }
        mvc.perform(get("/api/pipeline").with(jwt().jwt(t -> t.subject(owner))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.enabledMonitors").value(0))
                .andExpect(jsonPath("$.pendingExecutions").value(0)).andExpect(jsonPath("$.failedOutbox").value(0));
        mvc.perform(get("/api/monitors").with(jwt().jwt(t -> t.subject(owner)))).andExpect(content().json("[]"));
        mvc.perform(delete("/api/monitors/{id}",id).with(jwt().jwt(t -> t.subject(owner)))).andExpect(status().isNotFound());
        ProbeResult result = new ProbeResult(job,execution,id,"eu-west-1",at,at,at.plusMillis(30),ProbeOutcome.HTTP_RESPONSE,200,30,0,null,1);
        assertThat(ingestion.ingest("deleted-"+job,codec.encodeResult(result))).isEqualTo(ProbeResultIngestion.DISCARDED_MONITOR);
        assertThat(ingestion.ingest("deleted-"+job,codec.encodeResult(result))).isEqualTo(ProbeResultIngestion.DUPLICATE_MESSAGE);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM probe_results WHERE monitor_id = ?",Integer.class,id)).isZero();
        MonitorService quota = new MonitorService(monitors,targets,jdbc,1,0,60,5000,"",15);
        quota.create(owner,new CreateMonitorRequest("Replacement","https://1.1.1.1/",60,5000));
        assertThatThrownBy(() -> quota.create(owner,new CreateMonitorRequest("Overflow","https://1.1.1.1/",60,5000)))
                .isInstanceOf(MonitorQuotaExceededException.class);
        int live = jdbc.queryForObject("SELECT COUNT(*) FROM monitors WHERE deleted_at IS NULL",Integer.class);
        MonitorService capped = new MonitorService(monitors,targets,jdbc,25,live+1,60,5000,"",15);
        capped.create("global-"+owner,new CreateMonitorRequest("Global replacement","https://1.1.1.1/",60,5000));
        assertThatThrownBy(() -> capped.create("overflow-"+owner,new CreateMonitorRequest("Global overflow","https://1.1.1.1/",60,5000)))
                .isInstanceOf(MonitorCapacityReachedException.class);
        // Both quota queries count only live rows; the physical tombstone remains for foreign keys.
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM monitors WHERE owner_subject = ? AND deleted_at IS NULL",Integer.class,owner)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM monitors WHERE monitor_id = ?",Integer.class,id)).isEqualTo(1);
    }
}

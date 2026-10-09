package dev.ali.rcp;

import dev.ali.rcp.incidents.ExecutionFinalizer;
import dev.ali.rcp.monitors.*;
import dev.ali.rcp.probes.*;
import dev.ali.rcp.scheduling.DueMonitorScheduler;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import java.time.*;
import java.util.*;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class AcceptedHttpStatusesTest {
    @Autowired MockMvc mvc;
    @Autowired MonitorService service;
    @Autowired JdbcTemplate jdbc;
    @Autowired DueMonitorScheduler scheduler;
    @Autowired ExecutionFinalizer finalizer;
    @Autowired dev.ali.rcp.incidents.IncidentProcessor incidents;
    @Autowired ProbeMessageCodec codec;
    @Autowired ProbeResultIngestionService ingestion;

    @Test void rulesAreValidatedOwnerScopedAndResettable() throws Exception {
        String owner = UUID.randomUUID().toString();
        UUID id = service.create(owner,new CreateMonitorRequest("Codes","https://1.1.1.1/",60,5000)).id();
        for (String invalid : List.of("{}","{\"acceptedHttpStatuses\":[]}","{\"acceptedHttpStatuses\":[99]}","{\"acceptedHttpStatuses\":[600]}","{\"acceptedHttpStatuses\":[null]}")) {
            mvc.perform(patch("/api/monitors/{id}",id).with(jwt().jwt(t -> t.subject(owner))).contentType(MediaType.APPLICATION_JSON).content(invalid)).andExpect(status().isBadRequest());
        }
        mvc.perform(patch("/api/monitors/{id}",id).with(jwt().jwt(t -> t.subject("other"))).contentType(MediaType.APPLICATION_JSON).content("{\"acceptedHttpStatuses\":[403]}"))
                .andExpect(status().isNotFound());
        mvc.perform(patch("/api/monitors/{id}",id).with(jwt().jwt(t -> t.subject(owner))).contentType(MediaType.APPLICATION_JSON).content("{\"acceptedHttpStatuses\":[403,200,403]}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.acceptedHttpStatuses[0]").value(200)).andExpect(jsonPath("$.acceptedHttpStatuses[1]").value(403));
        mvc.perform(patch("/api/monitors/{id}",id).with(jwt().jwt(t -> t.subject(owner))).contentType(MediaType.APPLICATION_JSON).content("{\"acceptedHttpStatuses\":null}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.acceptedHttpStatuses").value(org.hamcrest.Matchers.nullValue()));
        mvc.perform(post("/api/monitors").with(jwt().jwt(t -> t.subject(owner))).contentType(MediaType.APPLICATION_JSON).content("""
                {"name":"Custom","targetUrl":"https://1.1.1.1/","checkIntervalSeconds":60,"timeoutMs":5000,"acceptedHttpStatuses":[403]}
                """)).andExpect(status().isCreated()).andExpect(jsonPath("$.acceptedHttpStatuses[0]").value(403));
    }

    @Test void editingTheRuleNeverReinterpretsOldResultsAndExportsUseTheSavedVerdicts() throws Exception {
        String owner = UUID.randomUUID().toString();
        UUID id = service.create(owner,new CreateMonitorRequest("Snapshot","https://1.1.1.1/",60,5000)).id();
        jdbc.update("UPDATE monitor_schedule_periods SET first_check_at = CURRENT_TIMESTAMP - INTERVAL '120 seconds' WHERE monitor_id = ?", id);
        UUID original = schedule(id,120);
        record403(original);
        service.setAcceptedHttpStatuses(owner,id,List.of(403));
        UUID custom = schedule(id,0);
        record403(custom);
        service.setAcceptedHttpStatuses(owner,id,null);
        assertThat(finalizer.finalizeBatch()).isEqualTo(2);
        assertThat(verdict(original)).isEqualTo("DOWN");
        assertThat(verdict(custom)).isEqualTo("UP");
        List<Integer> snapshot = jdbc.queryForObject("SELECT accepted_http_statuses_snapshot FROM probe_executions WHERE execution_id = ?", (rs,n) -> AcceptedHttpStatuses.read(rs,"accepted_http_statuses_snapshot"),custom);
        assertThat(snapshot).containsExactly(403);
        String from = Instant.now().minusSeconds(86400).toString(), to = Instant.now().plusSeconds(5).toString();
        mvc.perform(get("/api/monitors/{id}/availability",id).with(jwt().jwt(t -> t.subject(owner))).param("from",from).param("to",to))
                .andExpect(status().isOk()).andExpect(jsonPath("$.upExecutions").value(1)).andExpect(jsonPath("$.downExecutions").value(1));
        mvc.perform(get("/api/monitors/{id}/reliability-report",id).with(jwt().jwt(t -> t.subject(owner))).param("from",from).param("to",to))
                .andExpect(status().isOk()).andExpect(jsonPath("$.availability.upExecutions").value(1)).andExpect(jsonPath("$.availability.downExecutions").value(1));
        String csv = mvc.perform(get("/api/monitors/{id}/reliability-report/csv",id).with(jwt().jwt(t -> t.subject(owner))).param("from",from).param("to",to))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(csv).isEqualTo("incident_id,state,opened_at,resolved_at,duration_seconds\r\n");
        mvc.perform(get("/api/monitors/{id}/executions/{execution}/trace",id,custom).with(jwt().jwt(t -> t.subject(owner))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.acceptedHttpStatuses[0]").value(403));
        mvc.perform(get("/api/monitors/{id}/history",id).with(jwt().jwt(t -> t.subject(owner))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.recentChecks[0].acceptedHttpStatuses[0]").value(403));
    }

    @Test void incidentsAndCsvUseThePinnedRuleAndSurviveLaterEdits() throws Exception {
        String owner = UUID.randomUUID().toString();
        UUID id = service.create(owner,new CreateMonitorRequest("Incident rules","https://1.1.1.1/",60,5000)).id();
        for (int age : List.of(240,180)) {
            record403(schedule(id,age)); finalizer.finalizeBatch(); incidents.processBatch();
        }
        assertThat(jdbc.queryForObject("SELECT status FROM incidents WHERE monitor_id = ?",String.class,id)).isEqualTo("OPEN");
        service.setAcceptedHttpStatuses(owner,id,List.of(403));
        for (int age : List.of(120,60)) {
            record403(schedule(id,age)); finalizer.finalizeBatch(); incidents.processBatch();
        }
        assertThat(jdbc.queryForObject("SELECT status FROM incidents WHERE monitor_id = ?",String.class,id)).isEqualTo("RESOLVED");
        String from = Instant.now().minusSeconds(86400).toString(), to = Instant.now().plusSeconds(5).toString();
        String before = mvc.perform(get("/api/monitors/{id}/reliability-report/csv",id).with(jwt().jwt(t -> t.subject(owner)))
                        .param("from",from).param("to",to)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(before).contains(",RESOLVED,");
        service.setAcceptedHttpStatuses(owner,id,null);
        String after = mvc.perform(get("/api/monitors/{id}/reliability-report/csv",id).with(jwt().jwt(t -> t.subject(owner)))
                        .param("from",from).param("to",to)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(after).isEqualTo(before);
    }

    private UUID schedule(UUID id, int age) {
        jdbc.update("UPDATE monitors SET next_check_at = CURRENT_TIMESTAMP - make_interval(secs => ?) WHERE monitor_id = ?",age,id);
        scheduler.scheduleBatch();
        return jdbc.queryForObject("SELECT execution_id FROM probe_executions WHERE monitor_id = ? ORDER BY scheduled_at DESC LIMIT 1",UUID.class,id);
    }
    private void record403(UUID execution) {
        Instant at = jdbc.queryForObject("SELECT scheduled_at FROM probe_executions WHERE execution_id = ?",OffsetDateTime.class,execution).toInstant();
        UUID id = jdbc.queryForObject("SELECT monitor_id FROM probe_executions WHERE execution_id = ?",UUID.class,execution);
        int version = jdbc.queryForObject("SELECT monitor_behavior_version FROM probe_executions WHERE execution_id = ?",Integer.class,execution);
        jdbc.query("SELECT job_id,probe_region FROM probe_jobs WHERE execution_id = ?",rs -> {
            UUID job = rs.getObject("job_id",UUID.class);
            ProbeResult result = new ProbeResult(job,execution,id,rs.getString("probe_region"),at,at,at.plusMillis(25),ProbeOutcome.HTTP_RESPONSE,403,25,0,null,version);
            assertThat(ingestion.ingest("codes-"+job,codec.encodeResult(result))).isEqualTo(ProbeResultIngestion.STORED);
        },execution);
    }
    private String verdict(UUID id) { return jdbc.queryForObject("SELECT verdict FROM probe_executions WHERE execution_id = ?",String.class,id); }
}

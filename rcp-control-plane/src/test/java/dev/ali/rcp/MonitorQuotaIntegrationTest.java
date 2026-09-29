package dev.ali.rcp;

import dev.ali.rcp.monitors.CreateMonitorRequest;
import dev.ali.rcp.monitors.MonitorQuotaExceededException;
import dev.ali.rcp.monitors.MonitorService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "rcp.monitors.max-per-owner=1")
@AutoConfigureMockMvc
class MonitorQuotaIntegrationTest {
    @Autowired MockMvc mockMvc;
    @Autowired MonitorService monitorService;
    @Autowired JdbcTemplate jdbc;
    private final List<String> createdOwners = new ArrayList<>();

    @Test
    void quotaIsOwnerScopedAndReportedAsConflict() throws Exception {
        String owner = UUID.randomUUID().toString();
        String otherOwner = UUID.randomUUID().toString();
        createdOwners.add(owner);
        createdOwners.add(otherOwner);
        String body = """
                {"name":"Portfolio","targetUrl":"https://1.1.1.1",
                 "checkIntervalSeconds":60,"timeoutMs":5000}
                """;

        mockMvc.perform(post("/api/monitors").with(jwt().jwt(jwt -> jwt.subject(owner)))
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated());
        mockMvc.perform(post("/api/monitors").with(jwt().jwt(jwt -> jwt.subject(owner)))
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.title").value("Monitor quota reached"));
        mockMvc.perform(post("/api/monitors").with(jwt().jwt(jwt -> jwt.subject(otherOwner)))
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated());
    }

    @Test
    void concurrentCreationsCannotBothPassQuota() throws Exception {
        String owner = UUID.randomUUID().toString();
        createdOwners.add(owner);
        CreateMonitorRequest request = new CreateMonitorRequest(
                "Portfolio", "https://1.1.1.1", 60, 5000);
        CountDownLatch start = new CountDownLatch(1);

        try (var executor = Executors.newFixedThreadPool(2)) {
            var first = executor.submit(() -> createAfterStart(start, owner, request));
            var second = executor.submit(() -> createAfterStart(start, owner, request));
            start.countDown();
            assertThat(first.get(15, TimeUnit.SECONDS) ^ second.get(15, TimeUnit.SECONDS)).isTrue();
        }
    }

    @AfterEach
    void removeOnlyThisTestsMonitors() {
        for (String owner : createdOwners) {
            jdbc.update("""
                    DELETE FROM monitor_schedule_periods
                    WHERE monitor_id IN (SELECT monitor_id FROM monitors WHERE owner_subject = ?)
                    """, owner);
            jdbc.update("DELETE FROM monitors WHERE owner_subject = ?", owner);
        }
    }

    private boolean createAfterStart(CountDownLatch start, String owner, CreateMonitorRequest request)
            throws InterruptedException {
        start.await();
        try {
            monitorService.create(owner, request);
            return true;
        } catch (MonitorQuotaExceededException exception) {
            return false;
        }
    }
}

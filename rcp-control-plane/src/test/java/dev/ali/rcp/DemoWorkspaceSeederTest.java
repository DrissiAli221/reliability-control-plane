package dev.ali.rcp;

import dev.ali.rcp.monitors.MonitorQueryService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.assertj.core.api.Assertions.assertThat;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = {
        "rcp.demo.owner-subject=" + DemoWorkspaceSeederTest.OWNER,
        "rcp.demo.monitors=Cloudflare DNS|https://1.1.1.1, Cloudflare secondary|https://1.0.0.1"
})
class DemoWorkspaceSeederTest {
    static final String OWNER = "seeded-demo-owner";

    @Autowired MonitorQueryService monitors;
    @Autowired JdbcTemplate jdbc;

    @Test
    void anEmptyDemoAccountIsSeededOnStartup() {
        assertThat(monitors.listForOwner(OWNER))
                .extracting(monitor -> monitor.name())
                .containsExactlyInAnyOrder("Cloudflare DNS", "Cloudflare secondary");
    }

    @AfterEach
    void removeSeededMonitors() {
        jdbc.update("DELETE FROM monitor_schedule_periods WHERE monitor_id IN (SELECT monitor_id FROM monitors WHERE owner_subject = ?)", OWNER);
        jdbc.update("DELETE FROM monitors WHERE owner_subject = ?", OWNER);
    }
}

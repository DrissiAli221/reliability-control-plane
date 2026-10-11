package dev.ali.rcp;

import dev.ali.rcp.monitors.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

import static org.assertj.core.api.Assertions.*;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = {"rcp.demo.owner-subject=fleet-demo", "rcp.demo.monitors=",
        "rcp.demo.max-monitors=15", "rcp.monitors.max-per-owner=1", "rcp.monitors.max-total=2"})
@Transactional
class DemoFleetLimitsIntegrationTest {
    @Autowired MonitorService service;
    @Autowired JdbcTemplate jdbc;

    private void add(String owner, String name) {
        service.create(owner, new CreateMonitorRequest(name, "https://1.1.1.1", 60, 5000));
    }

    @Test
    void configurationCannotLiftTheAbsoluteDemoCeiling() {
        for (int ceiling : new int[]{0, 16}) {
            assertThatThrownBy(() -> new MonitorService(
                    org.mockito.Mockito.mock(MonitorRepository.class),
                    org.mockito.Mockito.mock(SafeTargetPolicy.class),
                    jdbc, 5, 30, 60, 5000, "fleet-demo", ceiling))
                    .isInstanceOf(IllegalArgumentException.class);
        }
    }

    @Test
    void demoFleetHasItsOwnCeilingWithoutConsumingVisitorCapacity() {
        // Other test contexts may have a seeded workspace; hide their rows only inside this rolled-back transaction.
        jdbc.update("UPDATE monitors SET deleted_at = CURRENT_TIMESTAMP WHERE deleted_at IS NULL");
        for (int i = 0; i < 15; i++) add("fleet-demo", "Demo " + i);
        assertThat(service.usage("visitor-one").totalMonitors()).isZero();
        assertThat(service.usage("fleet-demo").ownedMonitors()).isZero();
        add("visitor-one", "First visitor");
        assertThatThrownBy(() -> add("visitor-one", "Second owned")).isInstanceOf(MonitorQuotaExceededException.class);
        add("visitor-two", "Second visitor");
        assertThat(service.usage("visitor-one").ownedMonitors()).isEqualTo(1);
        assertThat(service.usage("visitor-one").totalMonitors()).isEqualTo(2);
        assertThatThrownBy(() -> add("visitor-three", "Full visitor fleet")).isInstanceOf(MonitorCapacityReachedException.class);
        assertThatThrownBy(() -> add("fleet-demo", "Too many demo targets")).isInstanceOf(MonitorQuotaExceededException.class);
        // Deletion releases only the relevant quota; existing visitor slots stay full.
        var id = jdbc.queryForObject("SELECT monitor_id FROM monitors WHERE owner_subject = 'fleet-demo' AND name = 'Demo 0' AND deleted_at IS NULL", java.util.UUID.class);
        service.delete("fleet-demo", id);
        add("fleet-demo", "Demo replacement");
        assertThat(service.usage("visitor-one").totalMonitors()).isEqualTo(2);
    }
}

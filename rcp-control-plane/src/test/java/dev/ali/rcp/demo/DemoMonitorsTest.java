package dev.ali.rcp.demo;

import dev.ali.rcp.monitors.CreateMonitorRequest;
import dev.ali.rcp.monitors.MonitorLimits;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class DemoMonitorsTest {
    @Test
    void parsesNamedTargetsAndFitsThemToTheDeploymentLimits() {
        MonitorLimits strict = new MonitorLimits(3, 15, 120, 2_000);

        assertThat(DemoMonitors.parse(" Example | https://example.com , Wikipedia|https://www.wikipedia.org,", strict))
                .containsExactly(
                        new CreateMonitorRequest("Example", "https://example.com", 120, 2_000),
                        new CreateMonitorRequest("Wikipedia", "https://www.wikipedia.org", 120, 2_000));
        assertThat(DemoMonitors.parse("", strict)).isEmpty();
        assertThat(DemoMonitors.request("Relaxed", "https://1.1.1.1", new MonitorLimits(25, 0, 30, 30_000)))
                .isEqualTo(new CreateMonitorRequest("Relaxed", "https://1.1.1.1", 60, 5_000));
    }

    @Test
    void rejectsEntriesWithoutANameOrTarget() {
        MonitorLimits limits = new MonitorLimits(3, 0, 60, 5_000);
        assertThatThrownBy(() -> DemoMonitors.parse("https://example.com", limits)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> DemoMonitors.parse("Example|", limits)).isInstanceOf(IllegalArgumentException.class);
    }
}

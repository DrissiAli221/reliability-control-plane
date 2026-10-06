package dev.ali.rcp.identity;

import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

import static org.assertj.core.api.Assertions.assertThat;

class SeparateManagementPortTest {
    @Test
    void opensMetricsOnlyForAPortOtherThanTheApiPort() {
        assertThat(separate(null, null)).isFalse();
        assertThat(separate("9091", null)).isTrue();
        assertThat(separate("8080", null)).isFalse();
        assertThat(separate("9091", "9091")).isFalse();
        assertThat(separate("9091", "8080")).isTrue();
        assertThat(separate("0", "8080")).isTrue();
        assertThat(separate("-1", null)).isFalse();
    }

    private boolean separate(String managementPort, String serverPort) {
        MockEnvironment environment = new MockEnvironment();
        if (managementPort != null) environment.setProperty("management.server.port", managementPort);
        if (serverPort != null) environment.setProperty("server.port", serverPort);
        return InternalMetricsSecurityConfiguration.SeparateManagementPort.separate(environment);
    }
}

package dev.ali.rcp;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.micrometer.metrics.test.autoconfigure.AutoConfigureMetrics;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalManagementPort;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Metrics are scrapeable without a token on the private management port and absent from the public port.
 * Spring Boot turns metrics export off in tests, so it is switched back on to get the Prometheus endpoint.
 */
@AutoConfigureMetrics
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "management.server.port=0",
        "management.endpoints.web.exposure.include=health,prometheus"
})
class InternalMetricsPortTest {
    private final HttpClient http = HttpClient.newHttpClient();

    @LocalServerPort int publicPort;
    @LocalManagementPort int managementPort;

    @Test
    void theManagementPortServesMetricsAndReadinessWithoutAToken() throws Exception {
        HttpResponse<String> metrics = get(managementPort, "/actuator/prometheus");
        assertThat(metrics.statusCode()).isEqualTo(200);
        assertThat(metrics.body()).contains("rcp_system_monitors_enabled");

        assertThat(get(managementPort, "/actuator/health/readiness").statusCode()).isEqualTo(200);
    }

    @Test
    void thePublicPortServesNoActuatorEndpoints() throws Exception {
        assertThat(get(publicPort, "/actuator/prometheus").statusCode()).isIn(401, 404);
        assertThat(get(publicPort, "/actuator/health").statusCode()).isIn(401, 404);
    }

    @Test
    void thePublicApiStillRequiresSignIn() throws Exception {
        assertThat(get(publicPort, "/api/monitors").statusCode()).isEqualTo(401);
    }

    private HttpResponse<String> get(int port, String path) throws Exception {
        return http.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + path)).GET().build(),
                HttpResponse.BodyHandlers.ofString());
    }
}

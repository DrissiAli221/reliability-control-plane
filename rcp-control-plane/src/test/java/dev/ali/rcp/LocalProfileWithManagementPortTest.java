package dev.ali.rcp;

import org.junit.jupiter.api.Test;
import org.springframework.boot.micrometer.metrics.test.autoconfigure.AutoConfigureMetrics;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalManagementPort;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

import static org.assertj.core.api.Assertions.assertThat;

/** The local profile's own metrics rule and a separate management port must start together. */
@ActiveProfiles("local")
@AutoConfigureMetrics
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "rcp.runtime.enabled=false",
        "rcp.local-worker.enabled=false",
        "rcp.local-identity.secret=bG9jYWwtdGVzdC1rZXktMzItYnl0ZXMtbWluaW11bS1sZW5ndGghISE=",
        "management.server.port=0"
})
class LocalProfileWithManagementPortTest {
    @LocalManagementPort int managementPort;

    @Test
    void startsAndServesMetricsOnTheManagementPort() throws Exception {
        HttpResponse<String> response = HttpClient.newHttpClient().send(
                HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + managementPort + "/actuator/prometheus")).GET().build(),
                HttpResponse.BodyHandlers.ofString());

        assertThat(response.statusCode()).isEqualTo(200);
    }
}

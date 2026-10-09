package dev.ali.rcp.probes;

import com.sun.net.httpserver.HttpServer;
import dev.ali.rcp.monitors.SafeTargetPolicy;
import org.junit.jupiter.api.Test;

import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ValidatedProbeHttpClientRegionTest {
    @Test
    void regionIsOneDiagnosticHeaderOnEachTargetAndAbsentForLegacyClients() throws Exception {
        InetAddress loopback = InetAddress.getByName("127.0.0.1");
        AtomicReference<List<String>> observed = new AtomicReference<>();
        HttpServer server = HttpServer.create(new InetSocketAddress(loopback, 0), 0);
        server.createContext("/", exchange -> {
            try (exchange) {
                observed.set(exchange.getRequestHeaders().get("X-RCP-Probe-Region"));
                exchange.sendResponseHeaders(200, 2);
                exchange.getResponseBody().write(new byte[]{'o', 'k'});
            }
        });
        SafeTargetPolicy fixture = new SafeTargetPolicy() {
            @Override
            public InetAddress[] resolvePublicAddresses(String host) {
                return new InetAddress[]{loopback};
            }
        };
        server.start();
        try {
            String base = "http://127.0.0.1:" + server.getAddress().getPort();
            for (String region : List.of("eu-west-1", "us-east-1")) {
                var client = new ValidatedProbeHttpClient(fixture, Duration.ofSeconds(1), region);
                for (String path : List.of("/drill/status.html", "/another-public-target")) {
                    assertThat(client.get(base + path, Duration.ofSeconds(2), 1024).statusCode()).isEqualTo(200);
                    assertThat(observed.get()).containsExactly(region);
                }
            }
            new ValidatedProbeHttpClient(fixture, Duration.ofSeconds(1))
                    .get(base + "/", Duration.ofSeconds(2), 1024);
            assertThat(observed.get()).isNull();
        } finally {
            server.stop(0);
        }
    }

    @Test
    void rejectsInvalidRegionAndHeaderInjection() {
        for (String region : List.of("", "eu-west-1\r\nInjected: value", "not a region")) {
            assertThatThrownBy(() -> new ValidatedProbeHttpClient(new SafeTargetPolicy(), Duration.ofSeconds(1), region))
                    .isInstanceOf(IllegalArgumentException.class);
        }
    }
}

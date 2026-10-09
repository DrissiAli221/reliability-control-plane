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
    void regionHeaderIsSentOnlyToTheConfiguredHostAndDrillPath() throws Exception {
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
            int port = server.getAddress().getPort();
            String base = "http://127.0.0.1:" + port;
            for (String region : List.of("eu-west-1", "us-east-1")) {
                var client = new ValidatedProbeHttpClient(fixture, Duration.ofSeconds(1), region, "127.0.0.1");
                assertThat(client.get(base + "/drill/status.html", Duration.ofSeconds(2), 1024).statusCode()).isEqualTo(200);
                assertThat(observed.get()).containsExactly(region);
                for (String other : List.of("/another-public-target", "/drill/status.html/x", "/")) {
                    client.get(base + other, Duration.ofSeconds(2), 1024);
                    assertThat(observed.get()).isNull();
                }
            }
            // A different host, an unset host and a blank host never receive the header.
            for (String host : new String[]{"example.com", null, " "}) {
                new ValidatedProbeHttpClient(fixture, Duration.ofSeconds(1), "eu-west-1", host)
                        .get(base + "/drill/status.html", Duration.ofSeconds(2), 1024);
                assertThat(observed.get()).isNull();
            }
            new ValidatedProbeHttpClient(fixture, Duration.ofSeconds(1))
                    .get(base + "/drill/status.html", Duration.ofSeconds(2), 1024);
            assertThat(observed.get()).isNull();
        } finally {
            server.stop(0);
        }
    }

    @Test
    void rejectsInvalidRegionAndHeaderInjection() {
        for (String region : List.of("", "eu-west-1\r\nInjected: value", "not a region")) {
            assertThatThrownBy(() -> new ValidatedProbeHttpClient(new SafeTargetPolicy(), Duration.ofSeconds(1), region, "api.example.com"))
                    .isInstanceOf(IllegalArgumentException.class);
        }
    }
}

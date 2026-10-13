package dev.ali.rcp.probes;

import com.sun.net.httpserver.HttpServer;
import dev.ali.rcp.monitors.SafeTargetPolicy;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.time.Duration;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * A body larger than the cap is still an answer: the probe keeps the status code, and it drops the connection
 * instead of downloading the rest, so even an endless body returns well before the request deadline.
 */
class ValidatedProbeHttpClientLargeBodyTest {
    private static final int CAP = 65_536;
    private final InetAddress loopback = InetAddress.getLoopbackAddress();
    private HttpServer server;
    private ValidatedProbeHttpClient client;

    @BeforeEach
    void startServer() throws IOException {
        server = HttpServer.create(new InetSocketAddress(loopback, 0), 0);
        server.createContext("/endless", exchange -> {
            try (exchange) {
                exchange.sendResponseHeaders(503, 0);
                byte[] chunk = new byte[16_384];
                while (true) {
                    exchange.getResponseBody().write(chunk);
                }
            } catch (IOException ignored) {
                // The probe hangs up once it has read past the cap.
            }
        });
        server.createContext("/small", exchange -> {
            try (exchange) {
                byte[] body = "ok".getBytes();
                exchange.sendResponseHeaders(200, body.length);
                exchange.getResponseBody().write(body);
            }
        });
        server.start();
        // Test-only resolver permits the local fixture; production SafeTargetPolicy rejects it.
        SafeTargetPolicy localFixturePolicy = new SafeTargetPolicy(host -> new InetAddress[]{loopback}) {
            @Override
            public InetAddress[] resolvePublicAddresses(String host) {
                return new InetAddress[]{loopback};
            }
        };
        client = new ValidatedProbeHttpClient(localFixturePolicy, Duration.ofSeconds(1));
    }

    @AfterEach
    void stopServer() {
        server.stop(0);
    }

    @Test
    void anEndlessBodyStillReportsItsStatusWithoutWaitingForTheDeadline() throws Exception {
        long started = System.nanoTime();

        ProbeHttpResponse response = client.get(url("/endless"), Duration.ofSeconds(5), CAP);

        assertThat(response.statusCode()).isEqualTo(503);
        assertThat(response.responseBytes()).isGreaterThan(CAP);
        assertThat(TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started)).isLessThan(2_000);
    }

    @Test
    void theNextRequestStillWorksAfterAConnectionWasDropped() throws Exception {
        client.get(url("/endless"), Duration.ofSeconds(5), CAP);

        ProbeHttpResponse response = client.get(url("/small"), Duration.ofSeconds(5), CAP);

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.responseBytes()).isEqualTo(2);
    }

    private String url(String path) {
        return "http://127.0.0.1:" + server.getAddress().getPort() + path;
    }
}

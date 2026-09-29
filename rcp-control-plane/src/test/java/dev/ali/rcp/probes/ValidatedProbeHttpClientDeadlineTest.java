package dev.ali.rcp.probes;

import com.sun.net.httpserver.HttpServer;
import dev.ali.rcp.monitors.SafeTargetPolicy;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.SocketTimeoutException;
import java.time.Duration;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ValidatedProbeHttpClientDeadlineTest {
    @Test
    void tricklingBodyCannotExtendTheWholeRequestDeadline() throws Exception {
        InetAddress loopback = InetAddress.getByName("127.0.0.1");
        HttpServer server = HttpServer.create(new InetSocketAddress(loopback, 0), 0);
        server.createContext("/trickle", exchange -> {
            try (exchange) {
                exchange.sendResponseHeaders(200, 0);
                for (int chunk = 0; chunk < 50; chunk++) {
                    exchange.getResponseBody().write('a');
                    exchange.getResponseBody().flush();
                    Thread.sleep(40);
                }
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
            } catch (IOException ignored) {
                // The client is expected to close this connection at its deadline.
            }
        });
        server.start();
        try {
            // Test-only resolver permits the local fixture; production SafeTargetPolicy rejects it.
            SafeTargetPolicy localFixturePolicy = new SafeTargetPolicy(host -> new InetAddress[]{loopback}) {
                @Override
                public InetAddress[] resolvePublicAddresses(String host) {
                    return new InetAddress[]{loopback};
                }
            };
            ValidatedProbeHttpClient client =
                    new ValidatedProbeHttpClient(localFixturePolicy, Duration.ofMillis(300));
            String url = "http://127.0.0.1:" + server.getAddress().getPort() + "/trickle";
            long started = System.nanoTime();

            assertThatThrownBy(() -> client.get(url, Duration.ofMillis(300), 65_536))
                    .isInstanceOf(SocketTimeoutException.class)
                    .hasMessageContaining("total probe request deadline");
            assertThat(TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started))
                    .isLessThan(1_500);
        } finally {
            server.stop(0);
        }
    }
}

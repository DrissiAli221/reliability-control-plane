package dev.ali.rcp.probes.local;

import dev.ali.rcp.probes.ProbeHttpClient;
import dev.ali.rcp.probes.ProbeHttpResponse;
import dev.ali.rcp.probes.ResponseTooLargeException;
import org.junit.jupiter.api.Test;

import java.net.ConnectException;
import java.net.http.HttpTimeoutException;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class FaultInjectingProbeHttpClientTest {

    @Test
    void passThroughCallsTheRealClientAdapter() throws Exception {
        LocalProbeFaults faults = new LocalProbeFaults();
        AtomicInteger calls = new AtomicInteger();
        ProbeHttpClient delegate = (url, timeout, limit) -> {
            calls.incrementAndGet();
            return new ProbeHttpResponse(204, 0);
        };

        ProbeHttpResponse response = client(delegate, faults).get(
                "https://example.com/",
                Duration.ofSeconds(1),
                1024
        );

        assertThat(response.statusCode()).isEqualTo(204);
        assertThat(calls).hasValue(1);
    }

    @Test
    void injectedHttpFailureDoesNotCallTheNetwork() throws Exception {
        LocalProbeFaults faults = new LocalProbeFaults();
        AtomicInteger calls = new AtomicInteger();
        ProbeHttpClient delegate = (url, timeout, limit) -> {
            calls.incrementAndGet();
            return new ProbeHttpResponse(204, 0);
        };
        faults.changeMode(LocalProbeFaultMode.HTTP_503);

        ProbeHttpResponse response = client(delegate, faults).get(
                "https://example.com/",
                Duration.ofSeconds(1),
                1024
        );

        assertThat(response.statusCode()).isEqualTo(503);
        assertThat(calls).hasValue(0);
    }

    @Test
    void injectedTransportFailuresUseTheSameExceptionTypesAsRealFailures() {
        LocalProbeFaults faults = new LocalProbeFaults();
        ProbeHttpClient client = client(
                (url, timeout, limit) -> new ProbeHttpResponse(204, 0),
                faults
        );

        faults.changeMode(LocalProbeFaultMode.CONNECTION_FAILURE);
        assertThatThrownBy(() -> client.get("https://example.com/", Duration.ofSeconds(1), 1024))
                .isInstanceOf(ConnectException.class);

        faults.changeMode(LocalProbeFaultMode.REQUEST_TIMEOUT);
        assertThatThrownBy(() -> client.get("https://example.com/", Duration.ofSeconds(1), 1024))
                .isInstanceOf(HttpTimeoutException.class);

        faults.changeMode(LocalProbeFaultMode.RESPONSE_TOO_LARGE);
        assertThatThrownBy(() -> client.get("https://example.com/", Duration.ofSeconds(1), 1024))
                .isInstanceOf(ResponseTooLargeException.class);
    }

    private FaultInjectingProbeHttpClient client(
            ProbeHttpClient delegate,
            LocalProbeFaults faults
    ) {
        return new FaultInjectingProbeHttpClient(delegate, faults);
    }
}

package dev.ali.rcp.probes.local;

import dev.ali.rcp.probes.ProbeHttpClient;
import dev.ali.rcp.probes.ProbeHttpResponse;
import dev.ali.rcp.probes.ResponseTooLargeException;

import java.io.IOException;
import java.net.ConnectException;
import java.net.http.HttpTimeoutException;
import java.time.Duration;
import java.util.Objects;

final class FaultInjectingProbeHttpClient implements ProbeHttpClient {
    private final ProbeHttpClient delegate;
    private final LocalProbeFaults faults;

    FaultInjectingProbeHttpClient(ProbeHttpClient delegate, LocalProbeFaults faults) {
        this.delegate = Objects.requireNonNull(delegate);
        this.faults = Objects.requireNonNull(faults);
    }

    @Override
    public ProbeHttpResponse get(
            String normalizedUrl,
            Duration timeout,
            int maximumBodyBytes
    ) throws IOException, InterruptedException {
        return switch (faults.currentMode()) {
            case PASS_THROUGH -> delegate.get(normalizedUrl, timeout, maximumBodyBytes);
            case HTTP_503 -> new ProbeHttpResponse(503, 0);
            case CONNECTION_FAILURE -> throw new ConnectException("injected connection failure");
            case REQUEST_TIMEOUT -> throw new HttpTimeoutException("injected request timeout");
            case RESPONSE_TOO_LARGE -> throw new ResponseTooLargeException(maximumBodyBytes);
        };
    }
}

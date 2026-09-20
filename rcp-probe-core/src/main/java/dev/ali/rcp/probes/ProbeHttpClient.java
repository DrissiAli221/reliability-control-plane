package dev.ali.rcp.probes;

import java.io.IOException;
import java.time.Duration;

@FunctionalInterface
public interface ProbeHttpClient {
    ProbeHttpResponse get(String normalizedUrl, Duration timeout, int maximumBodyBytes)
            throws IOException, InterruptedException;
}

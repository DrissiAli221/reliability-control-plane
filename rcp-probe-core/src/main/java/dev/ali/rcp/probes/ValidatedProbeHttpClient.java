package dev.ali.rcp.probes;

import dev.ali.rcp.monitors.SafeTargetPolicy;
import org.apache.hc.client5.http.classic.methods.HttpGet;
import org.apache.hc.client5.http.config.RequestConfig;
import org.apache.hc.client5.http.impl.classic.CloseableHttpClient;
import org.apache.hc.client5.http.impl.classic.HttpClients;
import org.apache.hc.client5.http.impl.io.PoolingHttpClientConnectionManagerBuilder;
import org.apache.hc.core5.util.Timeout;
import org.apache.hc.core5.util.TimeValue;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.SocketTimeoutException;
import java.time.Duration;
import java.util.Objects;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

/** HTTP adapter whose actual socket resolution is checked by SafeTargetPolicy. */
public final class ValidatedProbeHttpClient implements ProbeHttpClient {
    private static final ScheduledExecutorService DEADLINE_TIMER =
            Executors.newSingleThreadScheduledExecutor(task -> {
                Thread thread = new Thread(task, "rcp-probe-deadline");
                thread.setDaemon(true);
                return thread;
            });

    private final CloseableHttpClient client;
    private final Duration connectTimeout;

    public ValidatedProbeHttpClient(SafeTargetPolicy policy, Duration connectTimeout) {
        Objects.requireNonNull(policy);
        if (connectTimeout == null || connectTimeout.isZero() || connectTimeout.isNegative()) {
            throw new IllegalArgumentException("connectTimeout must be positive");
        }
        this.connectTimeout = connectTimeout;
        var manager = PoolingHttpClientConnectionManagerBuilder.create()
                .setDnsResolver(new ValidatedDnsResolver(policy))
                .setMaxConnTotal(32)
                .setMaxConnPerRoute(2)
                .setConnectionTimeToLive(TimeValue.ofSeconds(30))
                .build();
        this.client = HttpClients.custom()
                .setConnectionManager(manager)
                .disableRedirectHandling()
                .disableAutomaticRetries()
                .disableCookieManagement()
                .disableAuthCaching()
                .disableContentCompression()
                .setUserAgent("RCP-Probe/1.0")
                .build();
    }

    @Override
    public ProbeHttpResponse get(String normalizedUrl, Duration timeout, int maximumBodyBytes)
            throws IOException {
        if (timeout == null || timeout.isZero() || timeout.isNegative()) {
            throw new IllegalArgumentException("timeout must be positive");
        }
        if (maximumBodyBytes < 1) {
            throw new IllegalArgumentException("maximumBodyBytes must be positive");
        }
        HttpGet request = new HttpGet(URI.create(normalizedUrl));
        request.setHeader("Accept", "*/*");
        request.setConfig(RequestConfig.custom()
                .setConnectionRequestTimeout(Timeout.ofMilliseconds(Math.max(1, timeout.toMillis())))
                .setConnectTimeout(Timeout.ofMilliseconds(Math.max(1, Math.min(connectTimeout.toMillis(), timeout.toMillis()))))
                .setResponseTimeout(Timeout.ofMilliseconds(Math.max(1, timeout.toMillis())))
                .setHardCancellationEnabled(true)
                .build());

        // Response/socket timeouts limit inactivity, not elapsed request time. Cancel the
        // actual request after the whole-operation budget, including trickling bodies.
        ScheduledFuture<?> deadline = DEADLINE_TIMER.schedule(
                request::cancel, Math.max(1, timeout.toMillis()), TimeUnit.MILLISECONDS
        );
        try {
            ProbeHttpResponse result = client.execute(request, response -> {
                if (response.getEntity() == null) {
                    return new ProbeHttpResponse(response.getCode(), 0);
                }
                try (InputStream body = response.getEntity().getContent()) {
                    return new ProbeHttpResponse(response.getCode(), readWithLimit(body, maximumBodyBytes));
                }
            });
            if (request.isCancelled()) {
                throw new SocketTimeoutException("total probe request deadline exceeded");
            }
            return result;
        } catch (IOException exception) {
            if (request.isCancelled()) {
                SocketTimeoutException timeoutException =
                        new SocketTimeoutException("total probe request deadline exceeded");
                timeoutException.initCause(exception);
                throw timeoutException;
            }
            throw exception;
        } finally {
            deadline.cancel(false);
        }
    }

    static long readWithLimit(InputStream body, int maximumBodyBytes) throws IOException {
        byte[] buffer = new byte[8_192];
        long total = 0;
        int read;
        while ((read = body.read(buffer)) != -1) {
            total += read;
            if (total > maximumBodyBytes) {
                throw new ResponseTooLargeException(maximumBodyBytes);
            }
        }
        return total;
    }
}

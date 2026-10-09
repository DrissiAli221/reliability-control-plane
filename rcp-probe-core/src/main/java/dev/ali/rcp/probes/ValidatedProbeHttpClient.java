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

    static final String REGION_HEADER_PATH = "/drill/status.html";

    private final CloseableHttpClient client;
    private final Duration connectTimeout;
    private final String probeRegion;
    private final String regionHeaderHost;

    public ValidatedProbeHttpClient(SafeTargetPolicy policy, Duration connectTimeout) {
        this(policy, connectTimeout, null, null);
    }

    /**
     * The optional region is diagnostic metadata, never an authentication credential. It is sent
     * only to {@code regionHeaderHost} and only for {@value #REGION_HEADER_PATH}; a null or blank
     * host means the header is never sent.
     */
    public ValidatedProbeHttpClient(
            SafeTargetPolicy policy, Duration connectTimeout, String probeRegion, String regionHeaderHost) {
        Objects.requireNonNull(policy);
        if (connectTimeout == null || connectTimeout.isZero() || connectTimeout.isNegative()) {
            throw new IllegalArgumentException("connectTimeout must be positive");
        }
        this.connectTimeout = connectTimeout;
        if (probeRegion != null && !probeRegion.matches("[a-z]{2}(?:-[a-z]+)+-[0-9]+")) {
            throw new IllegalArgumentException("probeRegion must be an AWS region name");
        }
        this.probeRegion = probeRegion;
        this.regionHeaderHost = regionHeaderHost == null || regionHeaderHost.isBlank()
                ? null : regionHeaderHost.strip().toLowerCase(java.util.Locale.ROOT);
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

    private boolean wantsRegionHeader(URI uri) {
        return uri.getHost() != null
                && regionHeaderHost.equals(uri.getHost().toLowerCase(java.util.Locale.ROOT))
                && REGION_HEADER_PATH.equals(uri.getPath());
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
        URI uri = URI.create(normalizedUrl);
        HttpGet request = new HttpGet(uri);
        request.setHeader("Accept", "*/*");
        if (probeRegion != null && regionHeaderHost != null && wantsRegionHeader(uri)) {
            request.setHeader("X-RCP-Probe-Region", probeRegion);
        }
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
                InputStream body = response.getEntity().getContent();
                long bytesRead = countUpTo(body, maximumBodyBytes);
                if (bytesRead > maximumBodyBytes) {
                    // The status line already answers the probe. Closing the stream normally would drain
                    // the rest of a huge or endless body, so drop the connection instead.
                    request.cancel();
                    throw new BodyCapReached(new ProbeHttpResponse(response.getCode(), bytesRead));
                }
                body.close();
                return new ProbeHttpResponse(response.getCode(), bytesRead);
            });
            if (request.isCancelled()) {
                throw new SocketTimeoutException("total probe request deadline exceeded");
            }
            return result;
        } catch (BodyCapReached capReached) {
            return capReached.response;
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

    /** Counts the body without keeping it, stopping as soon as it passes the cap. */
    static long countUpTo(InputStream body, int maximumBodyBytes) throws IOException {
        byte[] buffer = new byte[8_192];
        long total = 0;
        int read;
        while ((read = body.read(buffer)) != -1) {
            total += read;
            if (total > maximumBodyBytes) {
                return total;
            }
        }
        return total;
    }

    /** Carries the response out of the handler, the only path that skips draining the body. */
    private static final class BodyCapReached extends IOException {
        private final transient ProbeHttpResponse response;

        BodyCapReached(ProbeHttpResponse response) {
            super("response body reached the probe cap");
            this.response = response;
        }
    }
}

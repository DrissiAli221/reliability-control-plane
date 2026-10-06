package dev.ali.rcp.probes;

import javax.net.ssl.SSLException;
import java.io.IOException;
import java.net.ConnectException;
import java.net.SocketTimeoutException;
import java.net.UnknownHostException;
import java.net.http.HttpConnectTimeoutException;
import java.net.http.HttpTimeoutException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Objects;
import java.util.function.LongSupplier;

public final class ProbeEngine {
    // Bounds how much of a body a probe downloads. A larger body still counts as a response: its status code is
    // the evidence, so the probe stops reading at the cap instead of discarding the answer.
    static final int MAXIMUM_BODY_BYTES = 65_536;

    private final ProbeTargetPolicy targetPolicy;
    private final ProbeHttpClient httpClient;
    private final Clock clock;
    private final LongSupplier nanoTime;

    public ProbeEngine(ProbeTargetPolicy targetPolicy, ProbeHttpClient httpClient) {
        this(targetPolicy, httpClient, Clock.systemUTC(), System::nanoTime);
    }

    ProbeEngine(
            ProbeTargetPolicy targetPolicy,
            ProbeHttpClient httpClient,
            Clock clock,
            LongSupplier nanoTime
    ) {
        this.targetPolicy = Objects.requireNonNull(targetPolicy);
        this.httpClient = Objects.requireNonNull(httpClient);
        this.clock = Objects.requireNonNull(clock);
        this.nanoTime = Objects.requireNonNull(nanoTime);
    }

    public ProbeResult execute(ProbeJob job) {
        Objects.requireNonNull(job, "job must not be null");
        Instant startedAt = clock.instant();

        if (!startedAt.isBefore(job.resultDeadlineAt())) {
            return failure(job, startedAt, startedAt, ProbeOutcome.EXPIRED, 0, "result_deadline_elapsed");
        }

        String normalizedUrl;
        try {
            normalizedUrl = targetPolicy.validateAndNormalize(job.targetUrl());
        } catch (UnsafeProbeTargetException exception) {
            return failure(job, startedAt, clock.instant(), ProbeOutcome.UNSAFE_TARGET, 0, "unsafe_target");
        }

        Duration remainingBeforeDeadline = Duration.between(clock.instant(), job.resultDeadlineAt());
        Duration configuredTimeout = Duration.ofMillis(job.timeoutMillis());
        Duration effectiveTimeout = configuredTimeout.compareTo(remainingBeforeDeadline) < 0
                ? configuredTimeout
                : remainingBeforeDeadline;
        if (effectiveTimeout.isZero() || effectiveTimeout.isNegative()) {
            return failure(job, startedAt, clock.instant(), ProbeOutcome.EXPIRED, 0, "result_deadline_elapsed");
        }

        long startedNanos = nanoTime.getAsLong();
        try {
            ProbeHttpResponse response = httpClient.get(normalizedUrl, effectiveTimeout, MAXIMUM_BODY_BYTES);
            return success(job, startedAt, clock.instant(), elapsedMillis(startedNanos), response);
        } catch (ResponseTooLargeException exception) {
            return failure(job, startedAt, clock.instant(), ProbeOutcome.RESPONSE_TOO_LARGE,
                    elapsedMillis(startedNanos), "response_too_large");
        } catch (HttpConnectTimeoutException exception) {
            return failure(job, startedAt, clock.instant(), ProbeOutcome.CONNECT_TIMEOUT,
                    elapsedMillis(startedNanos), "connect_timeout");
        } catch (org.apache.hc.client5.http.ConnectTimeoutException exception) {
            return failure(job, startedAt, clock.instant(), ProbeOutcome.CONNECT_TIMEOUT,
                    elapsedMillis(startedNanos), "connect_timeout");
        } catch (HttpTimeoutException exception) {
            return failure(job, startedAt, clock.instant(), ProbeOutcome.REQUEST_TIMEOUT,
                    elapsedMillis(startedNanos), "request_timeout");
        } catch (SocketTimeoutException exception) {
            return failure(job, startedAt, clock.instant(), ProbeOutcome.REQUEST_TIMEOUT,
                    elapsedMillis(startedNanos), "request_timeout");
        } catch (SSLException exception) {
            return failure(job, startedAt, clock.instant(), ProbeOutcome.TLS_FAILURE,
                    elapsedMillis(startedNanos), "tls_failure");
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            return failure(job, startedAt, clock.instant(), ProbeOutcome.INTERRUPTED,
                    elapsedMillis(startedNanos), "interrupted");
        } catch (IOException exception) {
            if (hasCause(exception, ValidatedDnsResolver.UnsafeTargetDnsException.class)) {
                return failure(job, startedAt, clock.instant(), ProbeOutcome.UNSAFE_TARGET,
                        elapsedMillis(startedNanos), "unsafe_target");
            }
            String errorType = hasCause(exception, UnknownHostException.class)
                    ? "dns_failure"
                    : hasCause(exception, ConnectException.class) ? "connection_failure" : "io_failure";
            return failure(job, startedAt, clock.instant(), ProbeOutcome.CONNECTION_FAILURE,
                    elapsedMillis(startedNanos), errorType);
        } catch (RuntimeException exception) {
            return failure(job, startedAt, clock.instant(), ProbeOutcome.INTERNAL_ERROR,
                    elapsedMillis(startedNanos), "internal_error");
        }
    }

    private ProbeResult success(
            ProbeJob job,
            Instant startedAt,
            Instant completedAt,
            long latencyMillis,
            ProbeHttpResponse response
    ) {
        return new ProbeResult(
                job.jobId(), job.executionId(), job.monitorId(), job.probeRegion(), job.scheduledAt(),
                startedAt, completedAt, ProbeOutcome.HTTP_RESPONSE, response.statusCode(), latencyMillis,
                response.responseBytes(), null, job.monitorBehaviorVersion()
        );
    }

    private ProbeResult failure(
            ProbeJob job,
            Instant startedAt,
            Instant completedAt,
            ProbeOutcome outcome,
            long latencyMillis,
            String errorType
    ) {
        return new ProbeResult(
                job.jobId(), job.executionId(), job.monitorId(), job.probeRegion(), job.scheduledAt(),
                startedAt, completedAt, outcome, null, latencyMillis, 0, errorType,
                job.monitorBehaviorVersion()
        );
    }

    private long elapsedMillis(long startedNanos) {
        return Math.max(0, Duration.ofNanos(nanoTime.getAsLong() - startedNanos).toMillis());
    }

    private boolean hasCause(Throwable throwable, Class<? extends Throwable> type) {
        Throwable current = throwable;
        while (current != null) {
            if (type.isInstance(current)) {
                return true;
            }
            current = current.getCause();
        }
        return false;
    }
}

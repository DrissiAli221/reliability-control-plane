package dev.ali.rcp.probes;

import org.junit.jupiter.api.Test;

import java.net.http.HttpTimeoutException;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;

import static org.assertj.core.api.Assertions.assertThat;

class ProbeEngineTest {
    private static final Instant NOW = Instant.parse("2026-09-07T12:00:00Z");

    @Test
    void reportsHttpFactsWithoutDecidingWhetherTheMonitorIsDown() {
        ProbeEngine engine = engine(
                target -> target,
                (url, timeout, maximumBodyBytes) -> new ProbeHttpResponse(503, 17)
        );

        ProbeResult result = engine.execute(job(NOW.plusSeconds(30)));

        assertThat(result.outcome()).isEqualTo(ProbeOutcome.HTTP_RESPONSE);
        assertThat(result.httpStatus()).isEqualTo(503);
        assertThat(result.responseBytes()).isEqualTo(17);
        assertThat(result.errorType()).isNull();
    }

    @Test
    void expiredJobNeverTouchesTheTarget() {
        AtomicBoolean called = new AtomicBoolean();
        ProbeEngine engine = engine(
                target -> target,
                (url, timeout, maximumBodyBytes) -> {
                    called.set(true);
                    return new ProbeHttpResponse(200, 0);
                }
        );

        ProbeResult result = engine.execute(job(NOW));

        assertThat(result.outcome()).isEqualTo(ProbeOutcome.EXPIRED);
        assertThat(called).isFalse();
    }

    @Test
    void unsafeTargetIsAResultFactRatherThanAnEscapedException() {
        ProbeEngine engine = engine(
                target -> { throw new UnsafeProbeTargetException("blocked"); },
                (url, timeout, maximumBodyBytes) -> new ProbeHttpResponse(200, 0)
        );

        ProbeResult result = engine.execute(job(NOW.plusSeconds(30)));

        assertThat(result.outcome()).isEqualTo(ProbeOutcome.UNSAFE_TARGET);
        assertThat(result.errorType()).isEqualTo("unsafe_target");
    }

    @Test
    void connectionTimeDnsRejectionIsNotReportedAsTargetDowntime() {
        ProbeEngine engine = engine(
                target -> target,
                (url, timeout, maximumBodyBytes) -> {
                    throw new ValidatedDnsResolver.UnsafeTargetDnsException();
                }
        );

        ProbeResult result = engine.execute(job(NOW.plusSeconds(30)));

        assertThat(result.outcome()).isEqualTo(ProbeOutcome.UNSAFE_TARGET);
        assertThat(result.errorType()).isEqualTo("unsafe_target");
    }

    @Test
    void responseLimitAndTimeoutBecomeStableOutcomeCategories() {
        ProbeEngine oversizedEngine = engine(
                target -> target,
                (url, timeout, maximumBodyBytes) -> { throw new ResponseTooLargeException(maximumBodyBytes); }
        );
        ProbeEngine timeoutEngine = engine(
                target -> target,
                (url, timeout, maximumBodyBytes) -> { throw new HttpTimeoutException("late"); }
        );

        assertThat(oversizedEngine.execute(job(NOW.plusSeconds(30))).outcome())
                .isEqualTo(ProbeOutcome.RESPONSE_TOO_LARGE);
        assertThat(timeoutEngine.execute(job(NOW.plusSeconds(30))).outcome())
                .isEqualTo(ProbeOutcome.REQUEST_TIMEOUT);
    }

    private ProbeEngine engine(ProbeTargetPolicy policy, ProbeHttpClient client) {
        AtomicLong nanos = new AtomicLong();
        return new ProbeEngine(policy, client, Clock.fixed(NOW, ZoneOffset.UTC), nanos::getAndIncrement);
    }

    private ProbeJob job(Instant deadline) {
        return new ProbeJob(
                UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(),
                NOW.minusSeconds(1), deadline, "https://example.com/health", 5_000,
                "eu-west-1", 1
        );
    }
}

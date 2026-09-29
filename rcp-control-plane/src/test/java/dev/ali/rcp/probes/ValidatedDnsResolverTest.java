package dev.ali.rcp.probes;

import dev.ali.rcp.monitors.SafeTargetPolicy;
import dev.ali.rcp.monitors.UnsafeTargetException;
import org.junit.jupiter.api.Test;

import java.net.InetAddress;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ValidatedDnsResolverTest {
    @Test
    void rejectsPrivateAnswerAtConnectionTimeEvenAfterPublicCreationAnswer() throws Exception {
        AtomicInteger resolutions = new AtomicInteger();
        SafeTargetPolicy policy = new SafeTargetPolicy(host -> resolutions.getAndIncrement() == 0
                ? new InetAddress[]{address(1, 1, 1, 1)}
                : new InetAddress[]{address(127, 0, 0, 1)});

        assertThat(policy.validateAndNormalize("https://example.com/health"))
                .isEqualTo("https://example.com/health");
        assertThatThrownBy(() -> new ValidatedDnsResolver(policy).resolve("example.com"))
                .isInstanceOf(ValidatedDnsResolver.UnsafeTargetDnsException.class);
        assertThat(resolutions).hasValue(2);
    }

    @Test
    void rejectsMixedPublicAndPrivateAnswersRatherThanPickingThePublicOne() throws Exception {
        SafeTargetPolicy policy = new SafeTargetPolicy(host -> new InetAddress[]{
                address(1, 1, 1, 1), address(10, 0, 0, 1)
        });

        assertThatThrownBy(() -> new ValidatedDnsResolver(policy).resolve("example.com"))
                .isInstanceOf(ValidatedDnsResolver.UnsafeTargetDnsException.class);
    }

    @Test
    void returnsOnlyValidatedAnswersToTheConnectionOperator() throws Exception {
        SafeTargetPolicy policy = new SafeTargetPolicy(host -> new InetAddress[]{address(1, 1, 1, 1)});

        assertThat(new ValidatedDnsResolver(policy).resolve("example.com"))
                .extracting(InetAddress::getHostAddress)
                .containsExactly("1.1.1.1");
    }

    @Test
    void rejectsQueriesAndSurroundingWhitespace() {
        SafeTargetPolicy policy = new SafeTargetPolicy(host -> new InetAddress[]{address(1, 1, 1, 1)});

        assertThatThrownBy(() -> policy.validateAndNormalize("https://example.com/?key=secret"))
                .isInstanceOf(UnsafeTargetException.class);
        assertThatThrownBy(() -> policy.validateAndNormalize(" https://example.com/"))
                .isInstanceOf(UnsafeTargetException.class);
    }

    @Test
    void actualHttpAdapterRejectsUnsafeConnectionDnsWithoutContactingTheAddress() {
        SafeTargetPolicy policy = new SafeTargetPolicy(host -> new InetAddress[]{address(127, 0, 0, 1)});
        ValidatedProbeHttpClient client = new ValidatedProbeHttpClient(policy, Duration.ofSeconds(1));

        assertThatThrownBy(() -> client.get("http://rebind.example/", Duration.ofSeconds(1), 1024))
                .isInstanceOf(ValidatedDnsResolver.UnsafeTargetDnsException.class);
    }

    @Test
    void actualHttpAdapterRejectsPrivateIpLiteral() {
        ValidatedProbeHttpClient client = new ValidatedProbeHttpClient(
                new SafeTargetPolicy(), Duration.ofSeconds(1)
        );

        assertThatThrownBy(() -> client.get("http://127.0.0.1/", Duration.ofSeconds(1), 1024))
                .isInstanceOf(ValidatedDnsResolver.UnsafeTargetDnsException.class);
    }

    @Test
    void workerPrecheckDoesNotDuplicateConnectionTimeDnsLookup() throws Exception {
        AtomicInteger resolutions = new AtomicInteger();
        SafeTargetPolicy policy = new SafeTargetPolicy(host -> {
            resolutions.incrementAndGet();
            return new InetAddress[]{address(1, 1, 1, 1)};
        });

        String normalized = new SafeTargetProbePolicy(policy)
                .validateAndNormalize("https://example.com/health");
        assertThat(normalized).isEqualTo("https://example.com/health");
        assertThat(resolutions).hasValue(0);

        new ValidatedDnsResolver(policy).resolve("example.com");
        assertThat(resolutions).hasValue(1);
    }

    private InetAddress address(int a, int b, int c, int d) {
        try {
            return InetAddress.getByAddress(new byte[]{(byte) a, (byte) b, (byte) c, (byte) d});
        } catch (java.net.UnknownHostException exception) {
            throw new AssertionError(exception);
        }
    }
}

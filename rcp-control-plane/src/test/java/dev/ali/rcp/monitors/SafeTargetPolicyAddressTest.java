package dev.ali.rcp.monitors;

import org.junit.jupiter.api.Test;

import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Adversarial samples from the IANA IPv4/IPv6 special-purpose registries. */
class SafeTargetPolicyAddressTest {
    @Test
    void rejectsReservedPrivateTranslationAndMetadataAddresses() {
        String[] forbidden = {
                "0.1.2.3", "10.0.0.1", "100.64.0.1", "127.0.0.1",
                "169.254.169.254", "172.16.0.1", "192.0.0.1", "192.0.2.1",
                "192.31.196.1", "192.52.193.1", "192.88.99.1",
                "192.168.1.1", "192.175.48.1", "198.18.0.1",
                "198.51.100.1", "203.0.113.1", "224.0.0.1", "240.0.0.1",
                "255.255.255.255", "::1", "::ffff:127.0.0.1",
                "64:ff9b::a9fe:a9fe", "64:ff9b:1::a9fe:a9fe", "100::1",
                "2001::1", "2001:db8::1", "2002::1", "2620:4f:8000::1",
                "3fff::1", "5f00::1", "fc00::1", "fe80::1", "ff02::1"
        };

        for (String literal : forbidden) {
            SafeTargetPolicy policy = new SafeTargetPolicy(host -> addresses(literal));
            assertThatThrownBy(() -> policy.resolvePublicAddresses("sample.example"))
                    .as("address %s must not become a probe destination", literal)
                    .isInstanceOf(UnsafeTargetException.class);
        }
    }

    @Test
    void allowsOrdinaryPublicIpv4AndIpv6Answers() {
        for (String literal : new String[]{
                "1.1.1.1", "8.8.8.8", "2001:4860:4860::8888",
                "2606:4700:4700::1111"
        }) {
            SafeTargetPolicy policy = new SafeTargetPolicy(host -> addresses(literal));
            assertThat(policy.resolvePublicAddresses("sample.example"))
                    .as("address %s should remain eligible", literal)
                    .hasSize(1);
        }
    }

    @Test
    void malformedOrCredentialBearingUrlsFailBeforeDns() {
        AtomicInteger resolutions = new AtomicInteger();
        SafeTargetPolicy policy = new SafeTargetPolicy(host -> {
            resolutions.incrementAndGet();
            return addresses("1.1.1.1");
        });
        String[] forbiddenUrls = {
                "file:///etc/passwd", "http://user:pass@sample.example/",
                "https://sample.example:80/", "http://sample.example:8080/",
                "https://sample.example/?token=secret", "https://sample.example/#fragment",
                " https://sample.example/", "http://sample.example\\@127.0.0.1/"
        };

        for (String url : forbiddenUrls) {
            assertThatThrownBy(() -> policy.validateAndNormalize(url))
                    .as("URL %s must be rejected", url)
                    .isInstanceOf(UnsafeTargetException.class);
        }
        assertThat(resolutions).hasValue(0);
    }

    private InetAddress[] addresses(String literal) throws UnknownHostException {
        return new InetAddress[]{InetAddress.getByName(literal)};
    }
}

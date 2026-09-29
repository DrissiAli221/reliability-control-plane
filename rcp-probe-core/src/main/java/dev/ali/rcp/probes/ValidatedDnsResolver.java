package dev.ali.rcp.probes;

import dev.ali.rcp.monitors.SafeTargetPolicy;
import dev.ali.rcp.monitors.UnsafeTargetException;
import org.apache.hc.client5.http.DnsResolver;

import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.Objects;

/** Validates the exact DNS answers handed to the connection operator. */
public final class ValidatedDnsResolver implements DnsResolver {
    private final SafeTargetPolicy policy;

    public ValidatedDnsResolver(SafeTargetPolicy policy) {
        this.policy = Objects.requireNonNull(policy);
    }

    @Override
    public InetAddress[] resolve(String host) throws UnknownHostException {
        try {
            return policy.resolvePublicAddresses(host);
        } catch (UnsafeTargetException exception) {
            UnsafeTargetDnsException rejected = new UnsafeTargetDnsException();
            rejected.initCause(exception);
            throw rejected;
        }
    }

    @Override
    public String resolveCanonicalHostname(String host) {
        return host;
    }

    public static final class UnsafeTargetDnsException extends UnknownHostException {
        public UnsafeTargetDnsException() {
            super("DNS answer rejected by target safety policy");
        }
    }
}

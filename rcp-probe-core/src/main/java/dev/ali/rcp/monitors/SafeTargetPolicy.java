package dev.ali.rcp.monitors;

import java.net.IDN;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.URI;
import java.net.URISyntaxException;
import java.net.UnknownHostException;
import java.util.Locale;

public class SafeTargetPolicy {
    private final Resolver resolver;

    public SafeTargetPolicy() {
        this(InetAddress::getAllByName);
    }

    public SafeTargetPolicy(Resolver resolver) {
        this.resolver = java.util.Objects.requireNonNull(resolver);
    }

    @FunctionalInterface
    public interface Resolver {
        InetAddress[] resolve(String host) throws UnknownHostException;
    }

    public String validateAndNormalize(String rawTargetUrl) {
        NormalizedTarget target = normalizeSyntax(rawTargetUrl);
        resolvePublicAddresses(target.host());
        return target.url();
    }

    /** Syntax only: workers must pair this with connection-time DNS validation. */
    public String validateSyntaxAndNormalize(String rawTargetUrl) {
        return normalizeSyntax(rawTargetUrl).url();
    }

    private NormalizedTarget normalizeSyntax(String rawTargetUrl) {
        URI uri = parse(rawTargetUrl);

        String scheme = normalizeScheme(uri);
        rejectCredentials(uri);
        rejectFragment(uri);
        rejectQuery(uri);

        String host = normalizeHost(uri);
        validatePort(scheme, uri.getPort());
        return new NormalizedTarget(host, normalizedUrl(uri, scheme, host));
    }

    private record NormalizedTarget(String host, String url) {
    }

    private URI parse(String rawTargetUrl) {
        if (rawTargetUrl == null || !rawTargetUrl.equals(rawTargetUrl.trim())) {
            throw new UnsafeTargetException("Target URL must be present without surrounding whitespace");
        }
        try {
            return new URI(rawTargetUrl);
        } catch (URISyntaxException exception) {
            throw new UnsafeTargetException("Target URL is malformed", exception);
        }
    }

    private String normalizeScheme(URI uri) {
        String scheme = uri.getScheme();

        if (scheme == null) {
            throw new UnsafeTargetException("Target URL must have a scheme");
        }

        scheme = scheme.toLowerCase(Locale.ROOT);

        if (!scheme.equals("http") && !scheme.equals("https")) {
            throw new UnsafeTargetException(
                    "Only HTTP and HTTPS targets are allowed"
            );
        }

        return scheme;
    }

    private void rejectCredentials(URI uri) {
        if (uri.getRawUserInfo() != null) {
            throw new UnsafeTargetException(
                    "Credentials in target URLs are not allowed"
            );
        }
    }

    private void rejectFragment(URI uri) {
        if (uri.getRawFragment() != null) {
            throw new UnsafeTargetException(
                    "URL fragments are not allowed"
            );
        }
    }

    private void rejectQuery(URI uri) {
        if (uri.getRawQuery() != null) {
            throw new UnsafeTargetException("Query strings in target URLs are not allowed");
        }
    }

    private String normalizeHost(URI uri) {
        String host = uri.getHost();

        if (host == null || host.isBlank()) {
            throw new UnsafeTargetException(
                    "Target URL must contain a valid host"
            );
        }

        if (host.startsWith("[") && host.endsWith("]")) {
            host = host.substring(1, host.length() - 1);
        }

        if (host.contains(":")) {
            return host.toLowerCase(Locale.ROOT);
        }

        try {
            return IDN.toASCII(host, IDN.USE_STD3_ASCII_RULES)
                    .toLowerCase(Locale.ROOT);
        } catch (IllegalArgumentException exception) {
            throw new UnsafeTargetException(
                    "Target host is invalid",
                    exception
            );
        }
    }

    private void validatePort(String scheme, int port) {
        if (port == -1) {
            return;
        }

        boolean validHttpPort = scheme.equals("http") && port == 80;
        boolean validHttpsPort = scheme.equals("https") && port == 443;

        if (!validHttpPort && !validHttpsPort) {
            throw new UnsafeTargetException(
                    "Only the default HTTP and HTTPS ports are allowed"
            );
        }
    }

    /** Reused by the HTTP client's connection-time DNS resolver. */
    public InetAddress[] resolvePublicAddresses(String host) {
        InetAddress[] addresses;

        try {
            addresses = resolver.resolve(host);
        } catch (UnknownHostException exception) {
            throw new UnsafeTargetException(
                    "Target host could not be resolved",
                    exception
            );
        }

        if (addresses.length == 0) {
            throw new UnsafeTargetException(
                    "Target host resolved to no addresses"
            );
        }

        for (InetAddress address : addresses) {
            if (isForbidden(address)) {
                throw new UnsafeTargetException(
                        "Target resolves to a forbidden address"
                );
            }
        }
        return addresses.clone();
    }

    private boolean isForbidden(InetAddress address) {
        if (address.isAnyLocalAddress()
                || address.isLoopbackAddress()
                || address.isLinkLocalAddress()
                || address.isSiteLocalAddress()
                || address.isMulticastAddress()) {
            return true;
        }

        byte[] bytes = address.getAddress();

        if (address instanceof Inet4Address) {
            return isForbiddenIpv4(bytes);
        }

        return isForbiddenIpv6(bytes);
    }

    // IANA IPv4 Special-Purpose Address Space, reviewed 2026-09-27:
    // https://www.iana.org/assignments/iana-ipv4-special-registry
    private boolean isForbiddenIpv4(byte[] bytes) {
        int first = unsigned(bytes[0]);
        int second = unsigned(bytes[1]);
        int third = unsigned(bytes[2]);

        return first == 0
                || first == 10
                || first == 127
                || first >= 224
                || (first == 100 && second >= 64 && second <= 127)
                || (first == 169 && second == 254)
                || (first == 172 && second >= 16 && second <= 31)
                || (first == 192 && second == 0 && (third == 0 || third == 2))
                || (first == 192 && second == 31 && third == 196)
                || (first == 192 && second == 52 && third == 193)
                || (first == 192 && second == 168)
                || (first == 192 && second == 88 && third == 99)
                || (first == 192 && second == 175 && third == 48)
                || (first == 198 && (second == 18 || second == 19))
                || (first == 198 && second == 51 && third == 100)
                || (first == 203 && second == 0 && third == 113);
    }

    private boolean isForbiddenIpv6(byte[] bytes) {
        int first = unsigned(bytes[0]);
        int second = unsigned(bytes[1]);
        int third = unsigned(bytes[2]);
        int fourth = unsigned(bytes[3]);

        // Conservatively accept only current global-unicast space (2000::/3).
        // This also blocks IPv4-translation, discard, dummy, ULA, and link-local
        // prefixes. Revisit if public IPv6 allocation expands beyond this range.
        // IANA IPv6 Special-Purpose Address Space, reviewed 2026-09-27:
        // https://www.iana.org/assignments/iana-ipv6-special-registry
        if ((first & 0xE0) != 0x20) {
            return true;
        }

        boolean ietfProtocolAssignments = first == 0x20
                && second == 0x01 && (third & 0xFE) == 0;
        boolean documentation =
                first == 0x20
                        && second == 0x01
                        && third == 0x0D
                        && fourth == 0xB8;
        boolean sixToFour = first == 0x20 && second == 0x02;
        boolean documentationV2 =
                first == 0x3F && second == 0xFF && (third & 0xF0) == 0;
        boolean as112 = first == 0x26 && second == 0x20
                && third == 0 && fourth == 0x4F
                && unsigned(bytes[4]) == 0x80 && unsigned(bytes[5]) == 0;

        if (ietfProtocolAssignments
                || documentation
                || sixToFour
                || documentationV2
                || as112) {
            return true;
        }

        return false;
    }

    private int unsigned(byte value) {
        return value & 0xFF;
    }

    private String normalizedUrl(
            URI original,
            String scheme,
            String host
    ) {
        String authorityHost = host.contains(":")
                ? "[" + host + "]"
                : host;

        String port = original.getPort() == -1
                ? ""
                : ":" + original.getPort();

        String path = original.getRawPath();

        if (path == null || path.isBlank()) {
            path = "/";
        }

        return scheme + "://" + authorityHost + port + path;
    }
}

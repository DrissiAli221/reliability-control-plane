package dev.ali.rcp.monitors;

import java.net.IDN;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.URI;
import java.net.URISyntaxException;
import java.net.UnknownHostException;
import java.util.Locale;

public class SafeTargetPolicy {

    public String validateAndNormalize(String rawTargetUrl) {
        URI uri = parse(rawTargetUrl);

        String scheme = normalizeScheme(uri);
        rejectCredentials(uri);
        rejectFragment(uri);

        String host = normalizeHost(uri);
        validatePort(scheme, uri.getPort());
        validateResolvedAddresses(host);

        return normalizedUrl(uri, scheme, host);
    }

    private URI parse(String rawTargetUrl) {
        try {
            return new URI(rawTargetUrl.trim());
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

    private void validateResolvedAddresses(String host) {
        InetAddress[] addresses;

        try {
            addresses = InetAddress.getAllByName(host);
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
                || (first == 192 && second == 0)
                || (first == 192 && second == 168)
                || (first == 192 && second == 88 && third == 99)
                || (first == 198 && (second == 18 || second == 19))
                || (first == 198 && second == 51 && third == 100)
                || (first == 203 && second == 0 && third == 113);
    }

    private boolean isForbiddenIpv6(byte[] bytes) {
        int first = unsigned(bytes[0]);
        int second = unsigned(bytes[1]);
        int third = unsigned(bytes[2]);
        int fourth = unsigned(bytes[3]);

        boolean uniqueLocal = (first & 0xFE) == 0xFC;
        boolean documentation =
                first == 0x20
                        && second == 0x01
                        && third == 0x0D
                        && fourth == 0xB8;
        boolean sixToFour = first == 0x20 && second == 0x02;
        boolean documentationV2 =
                first == 0x3F && (second & 0xF0) == 0xF0;

        if (first == 0
                || uniqueLocal
                || documentation
                || sixToFour
                || documentationV2) {
            return true;
        }

        if (isIpv4Mapped(bytes)) {
            byte[] ipv4 = {
                    bytes[12],
                    bytes[13],
                    bytes[14],
                    bytes[15]
            };

            return isForbiddenIpv4(ipv4);
        }

        return false;
    }

    private boolean isIpv4Mapped(byte[] bytes) {
        for (int index = 0; index < 10; index++) {
            if (bytes[index] != 0) {
                return false;
            }
        }

        return unsigned(bytes[10]) == 255
                && unsigned(bytes[11]) == 255;
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

        String query = original.getRawQuery() == null
                ? ""
                : "?" + original.getRawQuery();

        return scheme + "://" + authorityHost + port + path + query;
    }
}

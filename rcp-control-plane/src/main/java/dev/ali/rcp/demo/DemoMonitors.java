package dev.ali.rcp.demo;

import dev.ali.rcp.monitors.CreateMonitorRequest;
import dev.ali.rcp.monitors.MonitorLimits;

import java.util.Arrays;
import java.util.List;

/** Parses "Name|https://target, Other|https://other" into create requests that fit the deployment's limits. */
final class DemoMonitors {
    private static final int PREFERRED_INTERVAL_SECONDS = 60;
    private static final int PREFERRED_TIMEOUT_MS = 5_000;

    private DemoMonitors() {
    }

    static List<CreateMonitorRequest> parse(String specification, MonitorLimits limits) {
        if (specification == null || specification.isBlank()) return List.of();
        return Arrays.stream(specification.split(","))
                .map(String::trim)
                .filter(entry -> !entry.isEmpty())
                .map(entry -> {
                    int separator = entry.indexOf('|');
                    if (separator <= 0 || separator == entry.length() - 1) {
                        throw new IllegalArgumentException("rcp.demo.monitors entries must look like Name|https://target, got: " + entry);
                    }
                    return request(entry.substring(0, separator).trim(), entry.substring(separator + 1).trim(), limits);
                })
                .toList();
    }

    static CreateMonitorRequest request(String name, String targetUrl, MonitorLimits limits) {
        return new CreateMonitorRequest(
                name,
                targetUrl,
                Math.max(PREFERRED_INTERVAL_SECONDS, limits.minIntervalSeconds()),
                Math.min(PREFERRED_TIMEOUT_MS, limits.maxTimeoutMs())
        );
    }
}

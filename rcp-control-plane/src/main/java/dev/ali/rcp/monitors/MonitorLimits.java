package dev.ali.rcp.monitors;

/**
 * Deployment-wide limits on what a monitor may ask for. Defaults suit a private deployment; a public demo
 * tightens them so strangers cannot turn the probes into a load generator or run up the bill.
 *
 * @param maxPerOwner       monitors one identity may register, paused ones included
 * @param maxTotal          monitors across every identity; 0 disables the cap
 * @param minIntervalSeconds shortest allowed check interval
 * @param maxTimeoutMs      longest allowed per-check timeout
 */
public record MonitorLimits(int maxPerOwner, int maxTotal, int minIntervalSeconds, int maxTimeoutMs) {
    public MonitorLimits {
        if (maxPerOwner < 1) throw new IllegalArgumentException("rcp.monitors.max-per-owner must be positive");
        if (maxTotal < 0) throw new IllegalArgumentException("rcp.monitors.max-total must not be negative");
        if (minIntervalSeconds < 30) throw new IllegalArgumentException("rcp.monitors.min-interval-seconds must be at least 30");
        if (maxTimeoutMs < 100 || maxTimeoutMs > 30_000) {
            throw new IllegalArgumentException("rcp.monitors.max-timeout-ms must be between 100 and 30000");
        }
    }
}

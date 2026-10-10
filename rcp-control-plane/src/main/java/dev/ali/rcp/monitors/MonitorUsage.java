package dev.ali.rcp.monitors;

/**
 * How much of the limits is in use right now. Deleted monitors do not count, matching the limit checks.
 *
 * @param ownedMonitors monitors owned by the caller
 * @param totalMonitors monitors across every identity on this deployment
 */
public record MonitorUsage(long ownedMonitors, long totalMonitors) {
}

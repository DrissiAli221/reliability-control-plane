package dev.ali.rcp.monitors;

/** A request that is valid in general but outside this deployment's configured limits. */
public class MonitorLimitException extends RuntimeException {
    public MonitorLimitException(String message) {
        super(message);
    }
}

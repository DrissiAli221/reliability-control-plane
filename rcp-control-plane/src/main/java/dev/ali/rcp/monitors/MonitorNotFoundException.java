package dev.ali.rcp.monitors;

public final class MonitorNotFoundException extends RuntimeException {
    public MonitorNotFoundException() {
        super("Monitor not found");
    }
}

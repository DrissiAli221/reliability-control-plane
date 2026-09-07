package dev.ali.rcp.availability;

public final class AvailabilityMonitorNotFoundException extends RuntimeException {
    public AvailabilityMonitorNotFoundException() {
        super("monitor not found");
    }
}

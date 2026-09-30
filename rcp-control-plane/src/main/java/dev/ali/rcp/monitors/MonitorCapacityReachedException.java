package dev.ali.rcp.monitors;

public class MonitorCapacityReachedException extends RuntimeException {
    public MonitorCapacityReachedException(int limit) {
        super("This deployment already runs its maximum of " + limit + " monitors");
    }
}

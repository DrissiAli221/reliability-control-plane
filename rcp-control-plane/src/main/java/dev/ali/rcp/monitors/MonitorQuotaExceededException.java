package dev.ali.rcp.monitors;

public class MonitorQuotaExceededException extends RuntimeException {
    public MonitorQuotaExceededException(int limit) {
        super("Maximum of " + limit + " monitors per owner reached");
    }
}

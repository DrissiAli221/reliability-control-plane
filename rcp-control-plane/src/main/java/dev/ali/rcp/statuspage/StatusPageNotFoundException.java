package dev.ali.rcp.statuspage;

public final class StatusPageNotFoundException extends RuntimeException {
    public StatusPageNotFoundException() {
        super("status page not found");
    }
}

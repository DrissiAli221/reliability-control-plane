package dev.ali.rcp.probes;

import java.io.IOException;

public final class ResponseTooLargeException extends IOException {
    public ResponseTooLargeException(int maximumBodyBytes) {
        super("response exceeded the configured " + maximumBodyBytes + " byte limit");
    }
}

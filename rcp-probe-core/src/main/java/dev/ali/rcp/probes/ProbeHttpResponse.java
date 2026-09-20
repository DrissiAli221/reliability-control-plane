package dev.ali.rcp.probes;

public record ProbeHttpResponse(int statusCode, long responseBytes) {
    public ProbeHttpResponse {
        if (statusCode < 100 || statusCode > 599) {
            throw new IllegalArgumentException("statusCode must be a valid HTTP status");
        }
        if (responseBytes < 0) {
            throw new IllegalArgumentException("responseBytes must not be negative");
        }
    }
}

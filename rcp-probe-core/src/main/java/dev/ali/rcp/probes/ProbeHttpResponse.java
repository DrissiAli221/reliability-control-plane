package dev.ali.rcp.probes;

public record ProbeHttpResponse(int statusCode, long responseBytes, String botProtection) {
    public ProbeHttpResponse(int statusCode, long responseBytes) { this(statusCode,responseBytes,null); }
    public ProbeHttpResponse {
        if (botProtection != null && !botProtection.equals("CLOUDFLARE_CHALLENGE"))
            throw new IllegalArgumentException("unknown bot protection marker");
        if (statusCode < 100 || statusCode > 599) {
            throw new IllegalArgumentException("statusCode must be a valid HTTP status");
        }
        if (responseBytes < 0) {
            throw new IllegalArgumentException("responseBytes must not be negative");
        }
    }
}

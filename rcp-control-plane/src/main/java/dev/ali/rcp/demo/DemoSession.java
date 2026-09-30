package dev.ali.rcp.demo;

/**
 * Tokens for the shared read-only demo account. No refresh token is handed out: a demo visit that outlives the
 * access token simply clicks "Try the live demo" again.
 */
public record DemoSession(String accessToken, String idToken, long expiresInSeconds) {
}

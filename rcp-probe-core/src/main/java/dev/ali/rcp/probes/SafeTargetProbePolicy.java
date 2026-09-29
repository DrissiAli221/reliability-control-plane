package dev.ali.rcp.probes;

import dev.ali.rcp.monitors.SafeTargetPolicy;
import dev.ali.rcp.monitors.UnsafeTargetException;

import java.util.Objects;

public final class SafeTargetProbePolicy implements ProbeTargetPolicy {
    private final SafeTargetPolicy safeTargetPolicy;

    public SafeTargetProbePolicy(SafeTargetPolicy safeTargetPolicy) {
        this.safeTargetPolicy = Objects.requireNonNull(safeTargetPolicy);
    }

    @Override
    public String validateAndNormalize(String targetUrl) throws UnsafeProbeTargetException {
        try {
            // The HTTP adapter validates the one DNS answer set actually used to connect.
            return safeTargetPolicy.validateSyntaxAndNormalize(targetUrl);
        } catch (UnsafeTargetException exception) {
            throw new UnsafeProbeTargetException(exception.getMessage());
        }
    }
}

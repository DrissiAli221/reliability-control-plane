package dev.ali.rcp.probes;

@FunctionalInterface
public interface ProbeTargetPolicy {
    String validateAndNormalize(String targetUrl) throws UnsafeProbeTargetException;
}

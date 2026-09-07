package dev.ali.rcp.probes;

@FunctionalInterface
public interface ProbeResultTransport {
    void send(String resultPayload);
}

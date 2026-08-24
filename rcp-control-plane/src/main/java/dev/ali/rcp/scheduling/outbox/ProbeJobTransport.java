package dev.ali.rcp.scheduling.outbox;

@FunctionalInterface
public interface ProbeJobTransport {

    void send(
            String destinationRegion,
            String payload
    ) throws Exception;
}

package dev.ali.rcp.scheduling.runtime;

import software.amazon.awssdk.services.sqs.SqsClient;

import java.util.Map;

final class RegionalSqsClients implements AutoCloseable {

    private final Map<String, SqsClient> clientsByRegion;

    RegionalSqsClients(Map<String, SqsClient> clientsByRegion) {
        this.clientsByRegion = Map.copyOf(clientsByRegion);
    }

    Map<String, SqsClient> asMap() {
        return clientsByRegion;
    }

    @Override
    public void close() {
        clientsByRegion.values().forEach(SqsClient::close);
    }
}

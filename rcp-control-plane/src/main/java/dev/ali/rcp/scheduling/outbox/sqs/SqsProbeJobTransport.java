package dev.ali.rcp.scheduling.outbox.sqs;

import dev.ali.rcp.scheduling.outbox.ProbeJobTransport;
import software.amazon.awssdk.services.sqs.SqsClient;
import software.amazon.awssdk.services.sqs.model.SendMessageRequest;

import java.util.Map;

public final class SqsProbeJobTransport implements ProbeJobTransport {

    private final Map<String, SqsClient> sqsClientsByRegion;
    private final Map<String, String> queueUrlsByRegion;

    public SqsProbeJobTransport(
            Map<String, SqsClient> sqsClientsByRegion,
            Map<String, String> queueUrlsByRegion
    ) {
        this.sqsClientsByRegion = Map.copyOf(sqsClientsByRegion);
        this.queueUrlsByRegion = Map.copyOf(queueUrlsByRegion);
        if (!this.sqsClientsByRegion.keySet().equals(this.queueUrlsByRegion.keySet())) {
            throw new IllegalArgumentException("Every probe-job queue region must have exactly one SQS client");
        }
    }

    @Override
    public void send(
            String destinationRegion,
            String payload
    ) {
        String queueUrl = queueUrlsByRegion.get(destinationRegion);

        if (queueUrl == null) {
            throw new IllegalArgumentException(
                    "No probe-job queue configured for region "
                            + destinationRegion
            );
        }

        SqsClient sqsClient = sqsClientsByRegion.get(destinationRegion);
        sqsClient.sendMessage(
                SendMessageRequest.builder()
                        .queueUrl(queueUrl)
                        .messageBody(payload)
                        .build()
        );
    }
}

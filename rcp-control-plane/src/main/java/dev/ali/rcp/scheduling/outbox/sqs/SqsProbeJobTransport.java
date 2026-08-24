package dev.ali.rcp.scheduling.outbox.sqs;

import dev.ali.rcp.scheduling.outbox.ProbeJobTransport;
import software.amazon.awssdk.services.sqs.SqsClient;
import software.amazon.awssdk.services.sqs.model.SendMessageRequest;

import java.util.Map;
import java.util.Objects;

public final class SqsProbeJobTransport implements ProbeJobTransport {

    private final SqsClient sqsClient;
    private final Map<String, String> queueUrlsByRegion;

    public SqsProbeJobTransport(
            SqsClient sqsClient,
            Map<String, String> queueUrlsByRegion
    ) {
        this.sqsClient = Objects.requireNonNull(sqsClient);
        this.queueUrlsByRegion = Map.copyOf(queueUrlsByRegion);
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

        sqsClient.sendMessage(
                SendMessageRequest.builder()
                        .queueUrl(queueUrl)
                        .messageBody(payload)
                        .build()
        );
    }
}

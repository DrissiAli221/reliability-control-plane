package dev.ali.rcp.probes.sqs;

import dev.ali.rcp.probes.ProbeResultTransport;
import software.amazon.awssdk.services.sqs.SqsClient;
import software.amazon.awssdk.services.sqs.model.SendMessageRequest;

import java.util.Objects;

public final class SqsProbeResultTransport implements ProbeResultTransport {
    private final SqsClient sqsClient;
    private final String resultQueueUrl;

    public SqsProbeResultTransport(SqsClient sqsClient, String resultQueueUrl) {
        this.sqsClient = Objects.requireNonNull(sqsClient);
        this.resultQueueUrl = requireText(resultQueueUrl);
    }

    @Override
    public void send(String resultPayload) {
        sqsClient.sendMessage(
                SendMessageRequest.builder()
                        .queueUrl(resultQueueUrl)
                        .messageBody(resultPayload)
                        .build()
        );
    }

    private static String requireText(String value) {
        Objects.requireNonNull(value, "resultQueueUrl must not be null");
        if (value.isBlank()) {
            throw new IllegalArgumentException("resultQueueUrl must not be blank");
        }
        return value;
    }
}

package dev.ali.rcp.scheduling.outbox.sqs;

import org.junit.jupiter.api.Test;
import software.amazon.awssdk.services.sqs.SqsClient;
import software.amazon.awssdk.services.sqs.model.SendMessageRequest;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

class SqsProbeJobTransportTest {

    @Test
    void sendsThroughClientThatSignsForDestinationRegion() {
        SqsClient europe = mock(SqsClient.class);
        SqsClient virginia = mock(SqsClient.class);
        SqsProbeJobTransport transport = new SqsProbeJobTransport(
                Map.of("eu-west-1", europe, "us-east-1", virginia),
                Map.of(
                        "eu-west-1", "https://sqs.eu-west-1.amazonaws.com/123/europe",
                        "us-east-1", "https://sqs.us-east-1.amazonaws.com/123/virginia"
                )
        );

        transport.send("us-east-1", "job-json");

        verify(virginia).sendMessage(argThat((SendMessageRequest request) ->
                request.queueUrl().contains("us-east-1") && request.messageBody().equals("job-json")
        ));
        verify(europe, never()).sendMessage(org.mockito.ArgumentMatchers.any(SendMessageRequest.class));
    }

    @Test
    void rejectsClientAndQueueRegionMismatchAtConstruction() {
        assertThatThrownBy(() -> new SqsProbeJobTransport(
                Map.of("eu-west-1", mock(SqsClient.class)),
                Map.of("us-east-1", "https://sqs.us-east-1.amazonaws.com/123/jobs")
        )).isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("exactly one SQS client");
    }
}

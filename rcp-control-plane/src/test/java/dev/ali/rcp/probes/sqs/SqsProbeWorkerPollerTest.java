package dev.ali.rcp.probes.sqs;

import dev.ali.rcp.probes.ProbeOutcome;
import dev.ali.rcp.probes.ProbeResult;
import dev.ali.rcp.probes.ProbeWorker;
import org.junit.jupiter.api.Test;
import software.amazon.awssdk.services.sqs.SqsClient;
import software.amazon.awssdk.services.sqs.model.DeleteMessageRequest;
import software.amazon.awssdk.services.sqs.model.Message;
import software.amazon.awssdk.services.sqs.model.ReceiveMessageRequest;
import software.amazon.awssdk.services.sqs.model.ReceiveMessageResponse;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class SqsProbeWorkerPollerTest {

    @Test
    void acknowledgesOnlyAfterResultPublicationCompletes() {
        SqsClient sqs = mock(SqsClient.class);
        ProbeWorker worker = mock(ProbeWorker.class);
        when(sqs.receiveMessage(any(ReceiveMessageRequest.class)))
                .thenReturn(response());
        when(worker.handle("job-json")).thenReturn(probeResult());

        ProbeJobPoll result = poller(sqs, worker).pollBatch();

        assertThat(result).isEqualTo(new ProbeJobPoll("eu-west-1", 1, 1, 0, 0));
        verify(worker).handle("job-json");
        verify(sqs).deleteMessage(any(DeleteMessageRequest.class));
    }

    @Test
    void leavesJobForRetryWhenWorkerCannotPublishItsResult() {
        SqsClient sqs = mock(SqsClient.class);
        ProbeWorker worker = mock(ProbeWorker.class);
        when(sqs.receiveMessage(any(ReceiveMessageRequest.class)))
                .thenReturn(response());
        when(worker.handle("job-json"))
                .thenThrow(new IllegalStateException("result queue unavailable"));

        ProbeJobPoll result = poller(sqs, worker).pollBatch();

        assertThat(result).isEqualTo(new ProbeJobPoll("eu-west-1", 1, 0, 1, 0));
        verify(sqs, never()).deleteMessage(any(DeleteMessageRequest.class));
    }

    private SqsProbeWorkerPoller poller(SqsClient sqs, ProbeWorker worker) {
        return new SqsProbeWorkerPoller(
                "eu-west-1",
                sqs,
                "http://localhost:9324/000000000000/probe-jobs-eu-west-1",
                worker,
                0,
                60
        );
    }

    private ReceiveMessageResponse response() {
        return ReceiveMessageResponse.builder()
                .messages(Message.builder()
                        .messageId("message-1")
                        .receiptHandle("receipt-1")
                        .body("job-json")
                        .build())
                .build();
    }

    private ProbeResult probeResult() {
        Instant now = Instant.parse("2026-09-08T12:00:00Z");
        return new ProbeResult(
                UUID.fromString("00000000-0000-0000-0000-000000000001"),
                UUID.fromString("00000000-0000-0000-0000-000000000002"),
                UUID.fromString("00000000-0000-0000-0000-000000000003"),
                "eu-west-1",
                now.minusSeconds(1),
                now,
                now.plusMillis(25),
                ProbeOutcome.HTTP_RESPONSE,
                200,
                25,
                512,
                null,
                1
        );
    }
}

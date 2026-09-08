package dev.ali.rcp.probes.sqs;

import dev.ali.rcp.probes.ProbeWorker;
import org.junit.jupiter.api.Test;
import software.amazon.awssdk.services.sqs.SqsClient;
import software.amazon.awssdk.services.sqs.model.DeleteMessageRequest;
import software.amazon.awssdk.services.sqs.model.Message;
import software.amazon.awssdk.services.sqs.model.ReceiveMessageRequest;
import software.amazon.awssdk.services.sqs.model.ReceiveMessageResponse;

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
}

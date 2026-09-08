package dev.ali.rcp.probes.sqs;

import dev.ali.rcp.probes.ProbeResultIngestion;
import dev.ali.rcp.probes.ProbeResultIngestionService;
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

class SqsProbeResultConsumerTest {

    @Test
    void acknowledgesOnlyAfterSuccessfulIngestion() {
        SqsClient sqs = mock(SqsClient.class);
        ProbeResultIngestionService ingestion = mock(ProbeResultIngestionService.class);
        when(sqs.receiveMessage(any(ReceiveMessageRequest.class)))
                .thenReturn(response(message("message-1", "receipt-1")));
        when(ingestion.ingest("message-1", "result-json"))
                .thenReturn(ProbeResultIngestion.STORED);

        ProbeResultPoll result = consumer(sqs, ingestion).pollBatch();

        assertThat(result).isEqualTo(new ProbeResultPoll(1, 1, 0, 0, 0));
        verify(sqs).deleteMessage(any(DeleteMessageRequest.class));
    }

    @Test
    void leavesMessageUnacknowledgedWhenDatabaseProcessingFails() {
        SqsClient sqs = mock(SqsClient.class);
        ProbeResultIngestionService ingestion = mock(ProbeResultIngestionService.class);
        when(sqs.receiveMessage(any(ReceiveMessageRequest.class)))
                .thenReturn(response(message("message-1", "receipt-1")));
        when(ingestion.ingest("message-1", "result-json"))
                .thenThrow(new IllegalStateException("database unavailable"));

        ProbeResultPoll result = consumer(sqs, ingestion).pollBatch();

        assertThat(result).isEqualTo(new ProbeResultPoll(1, 0, 0, 1, 0));
        verify(sqs, never()).deleteMessage(any(DeleteMessageRequest.class));
    }

    @Test
    void acknowledgesDuplicateBecausePostgresqlAlreadyContainsTheResult() {
        SqsClient sqs = mock(SqsClient.class);
        ProbeResultIngestionService ingestion = mock(ProbeResultIngestionService.class);
        when(sqs.receiveMessage(any(ReceiveMessageRequest.class)))
                .thenReturn(response(message("message-1", "receipt-1")));
        when(ingestion.ingest("message-1", "result-json"))
                .thenReturn(ProbeResultIngestion.DUPLICATE_MESSAGE);

        ProbeResultPoll result = consumer(sqs, ingestion).pollBatch();

        assertThat(result).isEqualTo(new ProbeResultPoll(1, 0, 1, 0, 0));
        verify(sqs).deleteMessage(any(DeleteMessageRequest.class));
    }

    private SqsProbeResultConsumer consumer(
            SqsClient sqs,
            ProbeResultIngestionService ingestion
    ) {
        return new SqsProbeResultConsumer(
                sqs,
                "http://localhost:9324/queue/probe-results",
                ingestion,
                10,
                60
        );
    }

    private ReceiveMessageResponse response(Message message) {
        return ReceiveMessageResponse.builder().messages(message).build();
    }

    private Message message(String messageId, String receiptHandle) {
        return Message.builder()
                .messageId(messageId)
                .receiptHandle(receiptHandle)
                .body("result-json")
                .build();
    }
}

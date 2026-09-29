package dev.ali.rcp.probes.sqs;

import dev.ali.rcp.probes.ProbeResultIngestion;
import dev.ali.rcp.probes.ProbeResultIngestionService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.modulith.NamedInterface;
import software.amazon.awssdk.services.sqs.SqsClient;
import software.amazon.awssdk.services.sqs.model.DeleteMessageRequest;
import software.amazon.awssdk.services.sqs.model.Message;
import software.amazon.awssdk.services.sqs.model.ReceiveMessageRequest;

import java.util.List;
import java.util.Objects;

@NamedInterface("runtime")
public final class SqsProbeResultConsumer {
    private static final Logger LOG = LoggerFactory.getLogger(SqsProbeResultConsumer.class);
    private final SqsClient sqsClient;
    private final String resultQueueUrl;
    private final ProbeResultIngestionService ingestionService;
    private final int waitTimeSeconds;
    private final int visibilityTimeoutSeconds;

    public SqsProbeResultConsumer(
            SqsClient sqsClient,
            String resultQueueUrl,
            ProbeResultIngestionService ingestionService,
            int waitTimeSeconds,
            int visibilityTimeoutSeconds
    ) {
        this.sqsClient = Objects.requireNonNull(sqsClient);
        this.resultQueueUrl = requireText(resultQueueUrl, "resultQueueUrl");
        this.ingestionService = Objects.requireNonNull(ingestionService);
        if (waitTimeSeconds < 0 || waitTimeSeconds > 20) {
            throw new IllegalArgumentException("waitTimeSeconds must be between 0 and 20");
        }
        if (visibilityTimeoutSeconds < 1) {
            throw new IllegalArgumentException("visibilityTimeoutSeconds must be positive");
        }
        this.waitTimeSeconds = waitTimeSeconds;
        this.visibilityTimeoutSeconds = visibilityTimeoutSeconds;
    }

    public ProbeResultPoll pollBatch() {
        List<Message> messages = sqsClient.receiveMessage(
                ReceiveMessageRequest.builder()
                        .queueUrl(resultQueueUrl)
                        .maxNumberOfMessages(10)
                        .waitTimeSeconds(waitTimeSeconds)
                        .visibilityTimeout(visibilityTimeoutSeconds)
                        .build()
        ).messages();

        int stored = 0;
        int duplicates = 0;
        int processingFailures = 0;
        int acknowledgementFailures = 0;

        for (Message message : messages) {
            try {
                ProbeResultIngestion ingestion = ingestionService.ingest(
                        message.messageId(),
                        message.body()
                );
                if (ingestion == ProbeResultIngestion.STORED) {
                    stored++;
                } else {
                    duplicates++;
                }

                try {
                    acknowledge(message);
                } catch (RuntimeException acknowledgementFailure) {
                    acknowledgementFailures++;
                    LOG.atWarn()
                            .addKeyValue("sqsMessageId", message.messageId())
                            .addKeyValue("errorType", acknowledgementFailure.getClass().getSimpleName())
                            .log("probe result stored but queue acknowledgement failed");
                }
            } catch (RuntimeException processingFailure) {
                processingFailures++;
                // Never log the raw result body: it is untrusted queue input.
                LOG.atWarn()
                        .addKeyValue("sqsMessageId", message.messageId())
                        .addKeyValue("errorType", processingFailure.getClass().getSimpleName())
                        .log("probe result processing failed; message left for retry or DLQ");
            }
        }

        return new ProbeResultPoll(
                messages.size(),
                stored,
                duplicates,
                processingFailures,
                acknowledgementFailures
        );
    }

    private void acknowledge(Message message) {
        sqsClient.deleteMessage(
                DeleteMessageRequest.builder()
                        .queueUrl(resultQueueUrl)
                        .receiptHandle(message.receiptHandle())
                        .build()
        );
    }

    private String requireText(String value, String name) {
        Objects.requireNonNull(value, name + " must not be null");
        if (value.isBlank()) {
            throw new IllegalArgumentException(name + " must not be blank");
        }
        return value;
    }
}

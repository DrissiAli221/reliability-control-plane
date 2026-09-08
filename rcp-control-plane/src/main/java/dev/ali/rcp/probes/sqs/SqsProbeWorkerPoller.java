package dev.ali.rcp.probes.sqs;

import dev.ali.rcp.probes.ProbeResult;
import dev.ali.rcp.probes.ProbeWorker;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import software.amazon.awssdk.services.sqs.SqsClient;
import software.amazon.awssdk.services.sqs.model.DeleteMessageRequest;
import software.amazon.awssdk.services.sqs.model.Message;
import software.amazon.awssdk.services.sqs.model.ReceiveMessageRequest;

import java.util.List;
import java.util.Objects;

public final class SqsProbeWorkerPoller {
    private static final Logger LOG = LoggerFactory.getLogger(SqsProbeWorkerPoller.class);
    private final String region;
    private final SqsClient sqsClient;
    private final String jobQueueUrl;
    private final ProbeWorker worker;
    private final int waitTimeSeconds;
    private final int visibilityTimeoutSeconds;

    public SqsProbeWorkerPoller(
            String region,
            SqsClient sqsClient,
            String jobQueueUrl,
            ProbeWorker worker,
            int waitTimeSeconds,
            int visibilityTimeoutSeconds
    ) {
        this.region = requireText(region, "region");
        this.sqsClient = Objects.requireNonNull(sqsClient);
        this.jobQueueUrl = requireText(jobQueueUrl, "jobQueueUrl");
        this.worker = Objects.requireNonNull(worker);
        if (waitTimeSeconds < 0 || waitTimeSeconds > 20) {
            throw new IllegalArgumentException("waitTimeSeconds must be between 0 and 20");
        }
        if (visibilityTimeoutSeconds < 1) {
            throw new IllegalArgumentException("visibilityTimeoutSeconds must be positive");
        }
        this.waitTimeSeconds = waitTimeSeconds;
        this.visibilityTimeoutSeconds = visibilityTimeoutSeconds;
    }

    public ProbeJobPoll pollBatch() {
        List<Message> messages = sqsClient.receiveMessage(
                ReceiveMessageRequest.builder()
                        .queueUrl(jobQueueUrl)
                        .maxNumberOfMessages(10)
                        .waitTimeSeconds(waitTimeSeconds)
                        .visibilityTimeout(visibilityTimeoutSeconds)
                        .build()
        ).messages();

        int completed = 0;
        int processingFailures = 0;
        int acknowledgementFailures = 0;

        for (Message message : messages) {
            try {
                ProbeResult result = worker.handle(message.body());
                completed++;
                LOG.atInfo()
                        .addKeyValue("jobId", result.jobId())
                        .addKeyValue("executionId", result.executionId())
                        .addKeyValue("monitorId", result.monitorId())
                        .addKeyValue("probeRegion", result.probeRegion())
                        .addKeyValue("probeOutcome", result.outcome())
                        .addKeyValue("httpStatus", result.httpStatus())
                        .addKeyValue("latencyMs", result.latencyMillis())
                        .log("probe job completed and result published");
                try {
                    acknowledge(message);
                } catch (RuntimeException acknowledgementFailure) {
                    acknowledgementFailures++;
                    LOG.atWarn()
                            .addKeyValue("sqsMessageId", message.messageId())
                            .addKeyValue("probeRegion", region)
                            .addKeyValue("errorType", acknowledgementFailure.getClass().getSimpleName())
                            .log("probe job completed but queue acknowledgement failed");
                }
            } catch (RuntimeException processingFailure) {
                processingFailures++;
                LOG.atWarn()
                        .addKeyValue("sqsMessageId", message.messageId())
                        .addKeyValue("probeRegion", region)
                        .addKeyValue("errorType", processingFailure.getClass().getSimpleName())
                        .log("probe job processing failed");
            }
        }

        return new ProbeJobPoll(
                region,
                messages.size(),
                completed,
                processingFailures,
                acknowledgementFailures
        );
    }

    private void acknowledge(Message message) {
        sqsClient.deleteMessage(DeleteMessageRequest.builder()
                .queueUrl(jobQueueUrl)
                .receiptHandle(message.receiptHandle())
                .build());
    }

    private static String requireText(String value, String name) {
        Objects.requireNonNull(value, name + " must not be null");
        if (value.isBlank()) {
            throw new IllegalArgumentException(name + " must not be blank");
        }
        return value;
    }
}

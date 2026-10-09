package dev.ali.rcp.lambda;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import com.amazonaws.services.lambda.runtime.events.SQSEvent;
import com.amazonaws.services.lambda.runtime.events.SQSBatchResponse;
import dev.ali.rcp.monitors.SafeTargetPolicy;
import dev.ali.rcp.probes.ValidatedProbeHttpClient;
import dev.ali.rcp.probes.ProbeEngine;
import dev.ali.rcp.probes.ProbeMessageCodec;
import dev.ali.rcp.probes.ProbeWorker;
import dev.ali.rcp.probes.SafeTargetProbePolicy;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.sqs.SqsClient;
import software.amazon.awssdk.services.sqs.model.SendMessageRequest;
import tools.jackson.databind.ObjectMapper;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.function.Consumer;

public final class ProbeLambdaHandler implements RequestHandler<SQSEvent, SQSBatchResponse> {
    private static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(3);

    private final Consumer<String> jobProcessor;

    public ProbeLambdaHandler() {
        this(defaultWorker()::handle);
    }

    ProbeLambdaHandler(Consumer<String> jobProcessor) {
        this.jobProcessor = Objects.requireNonNull(jobProcessor);
    }

    @Override
    public SQSBatchResponse handleRequest(SQSEvent event, Context context) {
        Objects.requireNonNull(event, "event must not be null");
        List<SQSBatchResponse.BatchItemFailure> failures = new ArrayList<>();

        for (SQSEvent.SQSMessage message : event.getRecords()) {
            try {
                jobProcessor.accept(message.getBody());
            } catch (RuntimeException exception) {
                context.getLogger().log(
                        "probe job failed messageId=" + message.getMessageId()
                                + " errorType=" + exception.getClass().getSimpleName()
                );
                failures.add(new SQSBatchResponse.BatchItemFailure(message.getMessageId()));
            }
        }

        return new SQSBatchResponse(failures);
    }

    private static ProbeWorker defaultWorker() {
        String probeRegion = requiredEnvironment("PROBE_REGION");
        String resultQueueUrl = requiredEnvironment("RESULT_QUEUE_URL");
        Region resultQueueRegion = Region.of(requiredEnvironment("RESULT_QUEUE_REGION"));

        SqsClient resultSqs = SqsClient.builder()
                .region(resultQueueRegion)
                .build();
        ProbeMessageCodec codec = new ProbeMessageCodec(new ObjectMapper());
        SafeTargetPolicy targetPolicy = new SafeTargetPolicy();
        ProbeEngine engine = new ProbeEngine(
                new SafeTargetProbePolicy(targetPolicy),
                new ValidatedProbeHttpClient(
                        targetPolicy, CONNECT_TIMEOUT, probeRegion, System.getenv("PROBE_REGION_HEADER_HOST"))
        );

        return new ProbeWorker(
                probeRegion,
                codec,
                engine,
                payload -> resultSqs.sendMessage(
                        SendMessageRequest.builder()
                                .queueUrl(resultQueueUrl)
                                .messageBody(payload)
                                .build()
                )
        );
    }

    private static String requiredEnvironment(String name) {
        String value = System.getenv(name);
        if (value == null || value.isBlank()) {
            throw new IllegalStateException(name + " must be configured");
        }
        return value;
    }
}

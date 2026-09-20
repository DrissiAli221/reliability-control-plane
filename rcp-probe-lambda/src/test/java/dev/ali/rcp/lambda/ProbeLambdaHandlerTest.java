package dev.ali.rcp.lambda;

import com.amazonaws.services.lambda.runtime.ClientContext;
import com.amazonaws.services.lambda.runtime.CognitoIdentity;
import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.LambdaLogger;
import com.amazonaws.services.lambda.runtime.events.SQSEvent;
import com.amazonaws.services.lambda.runtime.events.SQSBatchResponse;
import dev.ali.rcp.probes.ProbeJob;
import dev.ali.rcp.probes.ProbeMessageCodec;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class ProbeLambdaHandlerTest {

    @Test
    void standaloneLambdaMapperReadsTheVersionedJobContract() {
        ProbeMessageCodec codec = new ProbeMessageCodec(new ObjectMapper());

        ProbeJob job = codec.decodeJob("""
                {
                  "schemaVersion": 1,
                  "eventId": "00000000-0000-0000-0000-000000000001",
                  "jobId": "00000000-0000-0000-0000-000000000002",
                  "executionId": "00000000-0000-0000-0000-000000000003",
                  "monitorId": "00000000-0000-0000-0000-000000000004",
                  "scheduledAt": "2026-09-20T12:00:00Z",
                  "resultDeadlineAt": "2026-09-20T12:01:00Z",
                  "targetUrl": "https://example.com/health",
                  "timeoutMs": 5000,
                  "probeRegion": "eu-west-1",
                  "monitorBehaviorVersion": 1
                }
                """);

        assertThat(job.probeRegion()).isEqualTo("eu-west-1");
        assertThat(job.targetUrl()).isEqualTo("https://example.com/health");
    }

    @Test
    void reportsOnlyFailedRecordsSoSuccessfulJobsAreNotRetried() {
        List<String> processed = new ArrayList<>();
        ProbeLambdaHandler handler = new ProbeLambdaHandler(body -> {
            processed.add(body);
            if (body.equals("bad")) {
                throw new IllegalStateException("result queue unavailable");
            }
        });

        SQSBatchResponse response = handler.handleRequest(
                event(message("message-1", "good"), message("message-2", "bad")),
                new TestContext()
        );

        assertThat(processed).containsExactly("good", "bad");
        assertThat(response.getBatchItemFailures())
                .extracting(SQSBatchResponse.BatchItemFailure::getItemIdentifier)
                .containsExactly("message-2");
    }

    @Test
    void returnsNoFailuresWhenEveryResultWasPublished() {
        ProbeLambdaHandler handler = new ProbeLambdaHandler(body -> { });

        SQSBatchResponse response = handler.handleRequest(
                event(message("message-1", "first"), message("message-2", "second")),
                new TestContext()
        );

        assertThat(response.getBatchItemFailures()).isEmpty();
    }

    private SQSEvent event(SQSEvent.SQSMessage... messages) {
        SQSEvent event = new SQSEvent();
        event.setRecords(List.of(messages));
        return event;
    }

    private SQSEvent.SQSMessage message(String messageId, String body) {
        SQSEvent.SQSMessage message = new SQSEvent.SQSMessage();
        message.setMessageId(messageId);
        message.setBody(body);
        return message;
    }

    private static final class TestContext implements Context {
        @Override public String getAwsRequestId() { return "request-id"; }
        @Override public String getLogGroupName() { return "log-group"; }
        @Override public String getLogStreamName() { return "log-stream"; }
        @Override public String getFunctionName() { return "probe-worker"; }
        @Override public String getFunctionVersion() { return "1"; }
        @Override public String getInvokedFunctionArn() { return "function-arn"; }
        @Override public CognitoIdentity getIdentity() { return null; }
        @Override public ClientContext getClientContext() { return null; }
        @Override public int getRemainingTimeInMillis() { return 30_000; }
        @Override public int getMemoryLimitInMB() { return 512; }
        @Override public LambdaLogger getLogger() { return new NoOpLambdaLogger(); }
    }

    private static final class NoOpLambdaLogger implements LambdaLogger {
        @Override public void log(String message) { }
        @Override public void log(byte[] message) { }
    }
}

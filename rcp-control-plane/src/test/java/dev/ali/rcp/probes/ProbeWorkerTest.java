package dev.ali.rcp.probes;

import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ProbeWorkerTest {
    private static final Instant NOW = Instant.parse("2026-09-07T12:00:00Z");
    private static final UUID JOB_ID = UUID.fromString("10000000-0000-0000-0000-000000000001");
    private static final UUID EXECUTION_ID = UUID.fromString("20000000-0000-0000-0000-000000000002");
    private static final UUID MONITOR_ID = UUID.fromString("30000000-0000-0000-0000-000000000003");

    private final ObjectMapper objectMapper = JsonMapper.builder().build();
    private final ProbeMessageCodec codec = new ProbeMessageCodec(objectMapper);

    @Test
    void turnsTheDurableOutboxPayloadIntoAPublishedResultFact() throws Exception {
        AtomicReference<String> published = new AtomicReference<>();
        ProbeWorker worker = worker(published::set);

        ProbeResult result = worker.handle(jobPayload("eu-west-1", 1));

        assertThat(result.jobId()).isEqualTo(JOB_ID);
        assertThat(result.outcome()).isEqualTo(ProbeOutcome.HTTP_RESPONSE);
        assertThat(result.httpStatus()).isEqualTo(503);
        assertThat(objectMapper.readTree(published.get()).get("jobId").asText())
                .isEqualTo(JOB_ID.toString());
        assertThat(objectMapper.readTree(published.get()).get("outcome").asText())
                .isEqualTo("HTTP_RESPONSE");
    }

    @Test
    void rejectsUnknownMessageSchemaBeforeCallingTheTarget() {
        ProbeWorker worker = worker(payload -> { });

        assertThatThrownBy(() -> worker.handle(jobPayload("eu-west-1", 2)))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("unsupported probe-job schema version");
    }

    @Test
    void rejectsAJobDeliveredToTheWrongRegionalWorker() {
        ProbeWorker worker = worker(payload -> { });

        assertThatThrownBy(() -> worker.handle(jobPayload("us-east-1", 1)))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("reached worker in eu-west-1");
    }

    @Test
    void publicationFailureEscapesSoTheQueueCanRetryTheSameJob() {
        ProbeWorker worker = worker(payload -> { throw new IllegalStateException("SQS unavailable"); });

        assertThatThrownBy(() -> worker.handle(jobPayload("eu-west-1", 1)))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("SQS unavailable");
    }

    private ProbeWorker worker(ProbeResultTransport resultTransport) {
        ProbeEngine engine = new ProbeEngine(
                target -> target,
                (url, timeout, maximumBodyBytes) -> new ProbeHttpResponse(503, 12),
                Clock.fixed(NOW, ZoneOffset.UTC),
                () -> 0
        );
        return new ProbeWorker("eu-west-1", codec, engine, resultTransport);
    }

    private String jobPayload(String region, int schemaVersion) {
        return """
                {
                  "schemaVersion": %d,
                  "eventId": "40000000-0000-0000-0000-000000000004",
                  "jobId": "%s",
                  "executionId": "%s",
                  "monitorId": "%s",
                  "scheduledAt": "2026-09-07T11:59:59Z",
                  "resultDeadlineAt": "2026-09-07T12:00:30Z",
                  "targetUrl": "https://example.com/health",
                  "timeoutMs": 5000,
                  "probeRegion": "%s",
                  "monitorBehaviorVersion": 1
                }
                """.formatted(schemaVersion, JOB_ID, EXECUTION_ID, MONITOR_ID, region);
    }
}

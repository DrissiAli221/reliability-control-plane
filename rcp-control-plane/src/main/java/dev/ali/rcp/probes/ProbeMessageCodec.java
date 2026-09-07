package dev.ali.rcp.probes;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

public final class ProbeMessageCodec {
    private static final int SUPPORTED_SCHEMA_VERSION = 1;

    private final ObjectMapper objectMapper;

    public ProbeMessageCodec(ObjectMapper objectMapper) {
        this.objectMapper = Objects.requireNonNull(objectMapper);
    }

    public ProbeJob decodeJob(String payload) {
        try {
            ProbeJobMessage message = objectMapper.readValue(payload, ProbeJobMessage.class);
            if (message.schemaVersion() != SUPPORTED_SCHEMA_VERSION) {
                throw new IllegalArgumentException(
                        "unsupported probe-job schema version: " + message.schemaVersion()
                );
            }
            return new ProbeJob(
                    message.jobId(),
                    message.executionId(),
                    message.monitorId(),
                    message.scheduledAt(),
                    message.resultDeadlineAt(),
                    message.targetUrl(),
                    message.timeoutMs(),
                    message.probeRegion(),
                    message.monitorBehaviorVersion()
            );
        } catch (JacksonException exception) {
            throw new IllegalArgumentException("invalid probe-job JSON", exception);
        }
    }

    public String encodeResult(ProbeResult result) {
        ProbeResultMessage message = new ProbeResultMessage(
                SUPPORTED_SCHEMA_VERSION,
                result.jobId(),
                result.executionId(),
                result.monitorId(),
                result.probeRegion(),
                result.scheduledAt(),
                result.startedAt(),
                result.completedAt(),
                result.outcome(),
                result.httpStatus(),
                result.latencyMillis(),
                result.responseBytes(),
                result.errorType(),
                result.monitorBehaviorVersion()
        );
        try {
            return objectMapper.writeValueAsString(message);
        } catch (JacksonException exception) {
            throw new IllegalStateException("could not encode probe result", exception);
        }
    }

    private record ProbeJobMessage(
            int schemaVersion,
            UUID eventId,
            UUID jobId,
            UUID executionId,
            UUID monitorId,
            Instant scheduledAt,
            Instant resultDeadlineAt,
            String targetUrl,
            int timeoutMs,
            String probeRegion,
            int monitorBehaviorVersion
    ) {
    }

    private record ProbeResultMessage(
            int schemaVersion,
            UUID jobId,
            UUID executionId,
            UUID monitorId,
            String probeRegion,
            Instant scheduledAt,
            Instant startedAt,
            Instant completedAt,
            ProbeOutcome outcome,
            Integer httpStatus,
            long latencyMillis,
            long responseBytes,
            String errorType,
            int monitorBehaviorVersion
    ) {
    }
}

package dev.ali.rcp.probes;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Objects;

@Service
public class ProbeResultIngestionService {
    private static final Logger LOG = LoggerFactory.getLogger(ProbeResultIngestionService.class);
    static final String CONSUMER_NAME = "probe-result-processor-v1";

    private final ProbeMessageCodec codec;
    private final ProbeResultRepository repository;

    public ProbeResultIngestionService(
            ProbeMessageCodec codec,
            ProbeResultRepository repository
    ) {
        this.codec = Objects.requireNonNull(codec);
        this.repository = Objects.requireNonNull(repository);
    }

    @Transactional
    public ProbeResultIngestion ingest(String messageId, String resultPayload) {
        requireText(messageId, "messageId");
        requireText(resultPayload, "resultPayload");
        ProbeResult result = codec.decodeResult(resultPayload);

        if (!repository.markMessageProcessed(CONSUMER_NAME, messageId)) {
            logIngestion(result, messageId, ProbeResultIngestion.DUPLICATE_MESSAGE);
            return ProbeResultIngestion.DUPLICATE_MESSAGE;
        }
        if (!repository.insertResult(result)) {
            logIngestion(result, messageId, ProbeResultIngestion.DUPLICATE_LOGICAL_RESULT);
            return ProbeResultIngestion.DUPLICATE_LOGICAL_RESULT;
        }
        logIngestion(result, messageId, ProbeResultIngestion.STORED);
        return ProbeResultIngestion.STORED;
    }

    private void logIngestion(
            ProbeResult result,
            String messageId,
            ProbeResultIngestion ingestion
    ) {
        LOG.atInfo()
                .addKeyValue("sqsMessageId", messageId)
                .addKeyValue("jobId", result.jobId())
                .addKeyValue("executionId", result.executionId())
                .addKeyValue("monitorId", result.monitorId())
                .addKeyValue("probeRegion", result.probeRegion())
                .addKeyValue("ingestion", ingestion)
                .log("probe result ingestion decided");
    }

    private void requireText(String value, String name) {
        Objects.requireNonNull(value, name + " must not be null");
        if (value.isBlank()) {
            throw new IllegalArgumentException(name + " must not be blank");
        }
    }
}

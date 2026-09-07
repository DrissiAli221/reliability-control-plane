package dev.ali.rcp.probes;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Objects;

@Service
public class ProbeResultIngestionService {
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
            return ProbeResultIngestion.DUPLICATE_MESSAGE;
        }
        if (!repository.insertResult(result)) {
            return ProbeResultIngestion.DUPLICATE_LOGICAL_RESULT;
        }
        return ProbeResultIngestion.STORED;
    }

    private void requireText(String value, String name) {
        Objects.requireNonNull(value, name + " must not be null");
        if (value.isBlank()) {
            throw new IllegalArgumentException(name + " must not be blank");
        }
    }
}

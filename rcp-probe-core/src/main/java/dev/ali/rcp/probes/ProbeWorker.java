package dev.ali.rcp.probes;

import java.util.Objects;

public final class ProbeWorker {
    private final String workerRegion;
    private final ProbeMessageCodec codec;
    private final ProbeEngine engine;
    private final ProbeResultTransport resultTransport;

    public ProbeWorker(
            String workerRegion,
            ProbeMessageCodec codec,
            ProbeEngine engine,
            ProbeResultTransport resultTransport
    ) {
        this.workerRegion = requireText(workerRegion, "workerRegion");
        this.codec = Objects.requireNonNull(codec);
        this.engine = Objects.requireNonNull(engine);
        this.resultTransport = Objects.requireNonNull(resultTransport);
    }

    public ProbeResult handle(String jobPayload) {
        ProbeJob job = codec.decodeJob(jobPayload);
        if (!workerRegion.equals(job.probeRegion())) {
            throw new IllegalArgumentException(
                    "job for region " + job.probeRegion() + " reached worker in " + workerRegion
            );
        }

        ProbeResult result = engine.execute(job);
        resultTransport.send(codec.encodeResult(result));
        return result;
    }

    private static String requireText(String value, String name) {
        Objects.requireNonNull(value, name + " must not be null");
        if (value.isBlank()) {
            throw new IllegalArgumentException(name + " must not be blank");
        }
        return value;
    }
}

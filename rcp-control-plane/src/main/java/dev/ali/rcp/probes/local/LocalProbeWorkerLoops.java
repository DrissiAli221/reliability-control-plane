package dev.ali.rcp.probes.local;

import dev.ali.rcp.probes.sqs.ProbeJobPoll;
import dev.ali.rcp.probes.sqs.SqsProbeWorkerPoller;
import io.micrometer.core.instrument.MeterRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;

import java.util.List;
import java.util.Objects;

public class LocalProbeWorkerLoops {
    private static final Logger LOG = LoggerFactory.getLogger(LocalProbeWorkerLoops.class);

    private final List<SqsProbeWorkerPoller> pollers;
    private final MeterRegistry meters;

    public LocalProbeWorkerLoops(List<SqsProbeWorkerPoller> pollers, MeterRegistry meters) {
        this.pollers = List.copyOf(pollers);
        this.meters = Objects.requireNonNull(meters);
    }

    @Scheduled(fixedDelayString = "${rcp.local-worker.poll-delay:PT0.25S}")
    public void pollRegionalQueues() {
        for (SqsProbeWorkerPoller poller : pollers) {
            try {
                record(poller.pollBatch());
            } catch (RuntimeException exception) {
                meters.counter("rcp.local.worker.poll.failures").increment();
                LOG.error("local probe worker poll failed", exception);
            }
        }
    }

    private void record(ProbeJobPoll poll) {
        String region = poll.region();
        meters.counter("rcp.probe.jobs.completed", "region", region).increment(poll.completed());
        meters.counter("rcp.probe.jobs.processing.failures", "region", region)
                .increment(poll.processingFailures());
        meters.counter("rcp.probe.jobs.acknowledgement.failures", "region", region)
                .increment(poll.acknowledgementFailures());
        if (poll.received() > 0) {
            LOG.info(
                    "local probe worker completed batch region={} received={} completed={}",
                    region,
                    poll.received(),
                    poll.completed()
            );
        }
    }
}

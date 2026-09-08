package dev.ali.rcp.scheduling.runtime;

import dev.ali.rcp.incidents.ExecutionFinalizer;
import dev.ali.rcp.incidents.IncidentProcessor;
import dev.ali.rcp.probes.sqs.ProbeResultPoll;
import dev.ali.rcp.probes.sqs.SqsProbeResultConsumer;
import dev.ali.rcp.scheduling.DueMonitorScheduler;
import dev.ali.rcp.scheduling.outbox.OutboxPublishResult;
import dev.ali.rcp.scheduling.outbox.OutboxPublisher;
import io.micrometer.core.instrument.MeterRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;

import java.util.Objects;

public class ControlPlaneProcessingLoops {
    private static final Logger LOG = LoggerFactory.getLogger(ControlPlaneProcessingLoops.class);

    private final DueMonitorScheduler scheduler;
    private final OutboxPublisher outboxPublisher;
    private final SqsProbeResultConsumer resultConsumer;
    private final ExecutionFinalizer finalizer;
    private final IncidentProcessor incidentProcessor;
    private final MeterRegistry meters;

    public ControlPlaneProcessingLoops(
            DueMonitorScheduler scheduler,
            OutboxPublisher outboxPublisher,
            SqsProbeResultConsumer resultConsumer,
            ExecutionFinalizer finalizer,
            IncidentProcessor incidentProcessor,
            MeterRegistry meters
    ) {
        this.scheduler = Objects.requireNonNull(scheduler);
        this.outboxPublisher = Objects.requireNonNull(outboxPublisher);
        this.resultConsumer = Objects.requireNonNull(resultConsumer);
        this.finalizer = Objects.requireNonNull(finalizer);
        this.incidentProcessor = Objects.requireNonNull(incidentProcessor);
        this.meters = Objects.requireNonNull(meters);
    }

    @Scheduled(fixedDelayString = "${rcp.runtime.scheduler-delay:PT1S}")
    public void scheduleDueMonitors() {
        runLoop("scheduler", () -> {
            int count = scheduler.scheduleBatch();
            meters.counter("rcp.scheduler.monitors.scheduled").increment(count);
            logActivity("scheduler", count);
        });
    }

    @Scheduled(fixedDelayString = "${rcp.runtime.outbox-delay:PT1S}")
    public void publishOutbox() {
        runLoop("outbox", () -> {
            OutboxPublishResult result = outboxPublisher.publishBatch();
            meters.counter("rcp.outbox.events.published").increment(result.published());
            meters.counter("rcp.outbox.events.failed").increment(result.failed());
            logActivity("outbox", result.claimed());
        });
    }

    @Scheduled(fixedDelayString = "${rcp.runtime.result-poll-delay:PT0.1S}")
    public void consumeResults() {
        runLoop("result-consumer", () -> {
            ProbeResultPoll result = resultConsumer.pollBatch();
            meters.counter("rcp.probe.results.stored").increment(result.stored());
            meters.counter("rcp.probe.results.duplicates").increment(result.duplicates());
            meters.counter("rcp.probe.results.processing.failures").increment(result.processingFailures());
            meters.counter("rcp.probe.results.acknowledgement.failures")
                    .increment(result.acknowledgementFailures());
            logActivity("result-consumer", result.received());
        });
    }

    @Scheduled(fixedDelayString = "${rcp.runtime.finalizer-delay:PT1S}")
    public void finalizeExecutions() {
        runLoop("execution-finalizer", () -> {
            int count = finalizer.finalizeBatch();
            meters.counter("rcp.executions.finalized").increment(count);
            logActivity("execution-finalizer", count);
        });
    }

    @Scheduled(fixedDelayString = "${rcp.runtime.incident-delay:PT1S}")
    public void processIncidents() {
        runLoop("incident-processor", () -> {
            int count = incidentProcessor.processBatch();
            meters.counter("rcp.incident.evaluations.processed").increment(count);
            logActivity("incident-processor", count);
        });
    }

    private void runLoop(String loop, Runnable work) {
        try {
            work.run();
        } catch (RuntimeException exception) {
            meters.counter("rcp.runtime.loop.failures", "loop", loop).increment();
            LOG.error("control-plane loop failed loop={}", loop, exception);
        }
    }

    private void logActivity(String loop, int count) {
        if (count > 0) {
            LOG.info("control-plane loop completed loop={} itemCount={}", loop, count);
        }
    }
}

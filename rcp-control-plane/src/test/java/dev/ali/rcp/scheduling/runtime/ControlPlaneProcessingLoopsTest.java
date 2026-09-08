package dev.ali.rcp.scheduling.runtime;

import dev.ali.rcp.incidents.ExecutionFinalizer;
import dev.ali.rcp.incidents.IncidentProcessor;
import dev.ali.rcp.probes.sqs.ProbeResultPoll;
import dev.ali.rcp.probes.sqs.SqsProbeResultConsumer;
import dev.ali.rcp.scheduling.DueMonitorScheduler;
import dev.ali.rcp.scheduling.outbox.OutboxPublisher;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ControlPlaneProcessingLoopsTest {

    @Test
    void recordsLoopFailureWithoutStoppingFutureScheduledRuns() {
        DueMonitorScheduler scheduler = mock(DueMonitorScheduler.class);
        when(scheduler.scheduleBatch())
                .thenThrow(new IllegalStateException("database unavailable"))
                .thenReturn(2);
        SimpleMeterRegistry meters = new SimpleMeterRegistry();
        ControlPlaneProcessingLoops loops = loops(scheduler, meters);

        loops.scheduleDueMonitors();
        loops.scheduleDueMonitors();

        assertThat(meters.counter("rcp.runtime.loop.failures", "loop", "scheduler").count())
                .isEqualTo(1);
        assertThat(meters.counter("rcp.scheduler.monitors.scheduled").count())
                .isEqualTo(2);
    }

    private ControlPlaneProcessingLoops loops(
            DueMonitorScheduler scheduler,
            SimpleMeterRegistry meters
    ) {
        OutboxPublisher outbox = mock(OutboxPublisher.class);
        SqsProbeResultConsumer consumer = mock(SqsProbeResultConsumer.class);
        when(consumer.pollBatch()).thenReturn(new ProbeResultPoll(0, 0, 0, 0, 0));
        return new ControlPlaneProcessingLoops(
                scheduler,
                outbox,
                consumer,
                mock(ExecutionFinalizer.class),
                mock(IncidentProcessor.class),
                meters
        );
    }
}

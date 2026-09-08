package dev.ali.rcp.observability;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class SystemStateMetricsTest {

    @Test
    void publishesOneConsistentDatabaseSnapshotAsGauges() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForMap(anyString())).thenReturn(Map.of(
                "enabled_monitors", 3L,
                "due_monitors", 1L,
                "pending_executions", 2L,
                "awaiting_incident_evaluation", 4L,
                "open_incidents", 1L,
                "pending_outbox", 5L,
                "failed_outbox", 0L,
                "oldest_outbox_age_seconds", new BigDecimal("12.8")
        ));
        SimpleMeterRegistry meters = new SimpleMeterRegistry();
        SystemStateMetrics metrics = new SystemStateMetrics(
                jdbc,
                meters,
                Clock.fixed(Instant.parse("2026-09-08T12:00:00Z"), ZoneOffset.UTC)
        );

        metrics.registerGauges();
        metrics.refresh();

        assertThat(value(meters, "rcp.system.monitors.enabled")).isEqualTo(3);
        assertThat(value(meters, "rcp.system.executions.pending")).isEqualTo(2);
        assertThat(value(meters, "rcp.system.incidents.open")).isEqualTo(1);
        assertThat(value(meters, "rcp.system.outbox.pending")).isEqualTo(5);
        assertThat(value(meters, "rcp.system.outbox.oldest.pending.age.seconds")).isEqualTo(12);
        assertThat(value(meters, "rcp.system.metrics.last.success.epoch.seconds"))
                .isEqualTo(Instant.parse("2026-09-08T12:00:00Z").getEpochSecond());
    }

    @Test
    void recordsRefreshFailureAndKeepsTheLastSnapshot() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForMap(anyString()))
                .thenReturn(snapshotWithPendingOutbox(7L))
                .thenThrow(new IllegalStateException("database unavailable"));
        SimpleMeterRegistry meters = new SimpleMeterRegistry();
        SystemStateMetrics metrics = new SystemStateMetrics(jdbc, meters, Clock.systemUTC());
        metrics.registerGauges();

        metrics.refresh();
        metrics.refresh();

        assertThat(value(meters, "rcp.system.outbox.pending")).isEqualTo(7);
        assertThat(meters.counter("rcp.system.metrics.refresh.failures").count()).isEqualTo(1);
    }

    private Map<String, Object> snapshotWithPendingOutbox(long pendingOutbox) {
        return Map.of(
                "enabled_monitors", 0L,
                "due_monitors", 0L,
                "pending_executions", 0L,
                "awaiting_incident_evaluation", 0L,
                "open_incidents", 0L,
                "pending_outbox", pendingOutbox,
                "failed_outbox", 0L,
                "oldest_outbox_age_seconds", BigDecimal.ZERO
        );
    }

    private double value(SimpleMeterRegistry meters, String name) {
        return meters.get(name).gauge().value();
    }
}

package dev.ali.rcp.observability;

import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.atomic.AtomicLong;

@Component
public class SystemStateMetrics {
    private static final Logger LOG = LoggerFactory.getLogger(SystemStateMetrics.class);

    private final JdbcTemplate jdbcTemplate;
    private final MeterRegistry meters;
    private final Clock clock;
    private final Map<String, AtomicLong> values = new LinkedHashMap<>();
    private final AtomicLong lastSuccessfulRefreshEpochSeconds = new AtomicLong();

    @Autowired
    public SystemStateMetrics(JdbcTemplate jdbcTemplate, MeterRegistry meters) {
        this(jdbcTemplate, meters, Clock.systemUTC());
    }

    SystemStateMetrics(JdbcTemplate jdbcTemplate, MeterRegistry meters, Clock clock) {
        this.jdbcTemplate = Objects.requireNonNull(jdbcTemplate);
        this.meters = Objects.requireNonNull(meters);
        this.clock = Objects.requireNonNull(clock);
    }

    @PostConstruct
    void registerGauges() {
        register("rcp.system.monitors.enabled", "Enabled monitors");
        register("rcp.system.monitors.due", "Enabled monitors currently due for scheduling");
        register("rcp.system.executions.pending", "Executions waiting for results or their deadline");
        register("rcp.system.executions.awaiting.incident.evaluation", "Finalized executions not yet evaluated by incident policy");
        register("rcp.system.incidents.open", "Currently open incidents");
        register("rcp.system.outbox.pending", "Committed events not yet published");
        register("rcp.system.outbox.failed", "Outbox events that exhausted retries");
        register("rcp.system.outbox.oldest.pending.age.seconds", "Age of the oldest unpublished outbox event");
        Gauge.builder("rcp.system.metrics.last.success.epoch.seconds", lastSuccessfulRefreshEpochSeconds, AtomicLong::get)
                .description("Unix timestamp of the latest successful database metric refresh")
                .register(meters);
    }

    @Scheduled(fixedDelayString = "${rcp.observability.state-refresh-delay:PT5S}")
    public void refresh() {
        try {
            Map<String, Object> snapshot = jdbcTemplate.queryForMap("""
                    SELECT
                        (SELECT COUNT(*) FROM monitors WHERE enabled) AS enabled_monitors,
                        (SELECT COUNT(*) FROM monitors
                            WHERE enabled AND next_check_at <= CURRENT_TIMESTAMP) AS due_monitors,
                        (SELECT COUNT(*) FROM probe_executions
                            WHERE status = 'PENDING') AS pending_executions,
                        (SELECT COUNT(*) FROM probe_executions executions
                            WHERE status = 'FINALIZED'
                              AND NOT EXISTS (
                                  SELECT 1 FROM incident_evaluations evaluations
                                  WHERE evaluations.execution_id = executions.execution_id
                              )) AS awaiting_incident_evaluation,
                        (SELECT COUNT(*) FROM incidents WHERE status = 'OPEN') AS open_incidents,
                        (SELECT COUNT(*) FROM outbox_events
                            WHERE published_at IS NULL AND failed_at IS NULL) AS pending_outbox,
                        (SELECT COUNT(*) FROM outbox_events
                            WHERE failed_at IS NOT NULL) AS failed_outbox,
                        (SELECT COALESCE(
                            EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - MIN(created_at))), 0
                         ) FROM outbox_events
                            WHERE published_at IS NULL AND failed_at IS NULL) AS oldest_outbox_age_seconds
                    """);

            set("rcp.system.monitors.enabled", snapshot, "enabled_monitors");
            set("rcp.system.monitors.due", snapshot, "due_monitors");
            set("rcp.system.executions.pending", snapshot, "pending_executions");
            set("rcp.system.executions.awaiting.incident.evaluation", snapshot, "awaiting_incident_evaluation");
            set("rcp.system.incidents.open", snapshot, "open_incidents");
            set("rcp.system.outbox.pending", snapshot, "pending_outbox");
            set("rcp.system.outbox.failed", snapshot, "failed_outbox");
            set("rcp.system.outbox.oldest.pending.age.seconds", snapshot, "oldest_outbox_age_seconds");
            lastSuccessfulRefreshEpochSeconds.set(clock.instant().getEpochSecond());
        } catch (RuntimeException exception) {
            meters.counter("rcp.system.metrics.refresh.failures").increment();
            LOG.warn("failed to refresh database-backed system metrics", exception);
        }
    }

    private void register(String name, String description) {
        AtomicLong value = new AtomicLong();
        values.put(name, value);
        Gauge.builder(name, value, AtomicLong::get)
                .description(description)
                .register(meters);
    }

    private void set(String metric, Map<String, Object> snapshot, String column) {
        Number value = (Number) snapshot.get(column);
        values.get(metric).set(value.longValue());
    }
}

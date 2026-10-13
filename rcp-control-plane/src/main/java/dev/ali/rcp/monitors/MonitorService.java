package dev.ali.rcp.monitors;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.Objects;
import java.util.UUID;

@Service
public class MonitorService {

    private final MonitorRepository monitorRepository;
    private final SafeTargetPolicy safeTargetPolicy;
    // Advisory-lock classes: one global key for the deployment-wide cap, one per-owner family for the quota.
    private static final int CAPACITY_LOCK = 0x52435054;
    private static final int OWNER_LOCK = 0x5243504d;

    private final JdbcTemplate jdbcTemplate;
    private final MonitorLimits limits;
    private final String demoOwnerSubject;
    private final int maxDemoMonitors;

    public MonitorService(
            MonitorRepository monitorRepository,
            SafeTargetPolicy safeTargetPolicy,
            JdbcTemplate jdbcTemplate,
            @Value("${rcp.monitors.max-per-owner:25}") int maxPerOwner,
            @Value("${rcp.monitors.max-total:0}") int maxTotal,
            @Value("${rcp.monitors.min-interval-seconds:30}") int minIntervalSeconds,
            @Value("${rcp.monitors.max-timeout-ms:30000}") int maxTimeoutMs,
            @Value("${rcp.demo.owner-subject:}") String demoOwnerSubject,
            @Value("${rcp.demo.max-monitors:15}") int maxDemoMonitors
    ) {
        this.monitorRepository = monitorRepository;
        this.safeTargetPolicy = safeTargetPolicy;
        this.jdbcTemplate = jdbcTemplate;
        this.limits = new MonitorLimits(maxPerOwner, maxTotal, minIntervalSeconds, maxTimeoutMs);
        this.demoOwnerSubject = demoOwnerSubject.trim();
        if (maxDemoMonitors < 1 || maxDemoMonitors > 15) {
            throw new IllegalArgumentException("rcp.demo.max-monitors must be between 1 and the hard ceiling of 15");
        }
        this.maxDemoMonitors = maxDemoMonitors;
    }

    /** The limits this deployment enforces, so clients can offer only choices that will be accepted. */
    public MonitorLimits limits() {
        return limits;
    }

    /** Visitor capacity excludes only the server-configured demo subject, never a caller-supplied group claim. */
    @Transactional(readOnly = true)
    public MonitorUsage usage(String ownerSubject) {
        Long owned = isDemoOwner(ownerSubject) ? 0L : jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM monitors WHERE owner_subject = ? AND deleted_at IS NULL", Long.class, ownerSubject);
        Long total = visitorCount();
        return new MonitorUsage(owned == null ? 0 : owned, total == null ? 0 : total);
    }

    private boolean isDemoOwner(String subject) {
        return !demoOwnerSubject.isBlank() && demoOwnerSubject.equals(subject);
    }

    private Long visitorCount() {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM monitors WHERE deleted_at IS NULL AND owner_subject <> ?",
                Long.class, demoOwnerSubject);
    }

    @Transactional
    public MonitorResponse create(
            String ownerSubject,
            CreateMonitorRequest request
    ) {
        if (request.checkIntervalSeconds() < limits.minIntervalSeconds()) {
            throw new MonitorLimitException("Checks can run at most every " + limits.minIntervalSeconds() + " s on this deployment");
        }
        if (request.timeoutMs() > limits.maxTimeoutMs()) {
            throw new MonitorLimitException("Timeouts can be at most " + limits.maxTimeoutMs() + " ms on this deployment");
        }
        String normalizedTarget = safeTargetPolicy.validateAndNormalize(
                request.targetUrl()
        );

        // Locks are always taken in the same order (global, then owner) so concurrent creations cannot deadlock.
        // The global lock only exists when a deployment-wide cap is configured.
        boolean demo = isDemoOwner(ownerSubject);
        if (!demo && limits.maxTotal() > 0) {
            jdbcTemplate.queryForList("SELECT pg_advisory_xact_lock(?, ?)", CAPACITY_LOCK, 0);
            Long total = visitorCount();
            if (total != null && total >= limits.maxTotal()) {
                throw new MonitorCapacityReachedException(limits.maxTotal());
            }
        }

        // Serialize creations for this subject across all control-plane instances.
        // Hash collisions merely serialize unrelated subjects; the count still uses
        // the full subject. The transaction-scoped lock releases on commit/rollback.
        jdbcTemplate.queryForList("SELECT pg_advisory_xact_lock(?, ?)",
                OWNER_LOCK, ownerSubject.hashCode());
        Long existing = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM monitors WHERE owner_subject = ? AND deleted_at IS NULL",
                Long.class, ownerSubject
        );
        int ownerLimit = demo ? maxDemoMonitors : limits.maxPerOwner();
        if (existing != null && existing >= ownerLimit) {
            throw new MonitorQuotaExceededException(ownerLimit);
        }

        Monitor monitor = Monitor.create(
                ownerSubject,
                request.name().trim(),
                normalizedTarget,
                request.checkIntervalSeconds(),
                request.timeoutMs(),
                databaseNow()
        );

        monitor.changeAcceptedHttpStatuses(request.acceptedHttpStatuses(), monitor.getCreatedAt());
        Monitor saved = monitorRepository.saveAndFlush(monitor);

        return MonitorResponse.from(saved);
    }

    @Transactional
    public MonitorResponse setEnabled(String ownerSubject, UUID monitorId, boolean enabled) {
        Objects.requireNonNull(ownerSubject, "ownerSubject must not be null");
        Objects.requireNonNull(monitorId, "monitorId must not be null");
        Monitor monitor = monitorRepository.findOwnedForUpdate(monitorId, ownerSubject)
                .orElseThrow(MonitorNotFoundException::new);
        if (monitor.isEnabled() == enabled) {
            return MonitorResponse.from(monitor);
        }
        if (enabled) {
            // A target accepted months ago may no longer resolve safely.
            safeTargetPolicy.validateAndNormalize(monitor.getTargetUrl());
        }
        monitor.changeEnabled(enabled, databaseNow());
        monitorRepository.flush();
        return MonitorResponse.from(monitor);
    }

    @Transactional
    public MonitorResponse setAcceptedHttpStatuses(String ownerSubject, UUID monitorId, java.util.List<Integer> codes) {
        Monitor monitor = monitorRepository.findOwnedForUpdate(monitorId, ownerSubject)
                .orElseThrow(MonitorNotFoundException::new);
        monitor.changeAcceptedHttpStatuses(codes, databaseNow());
        monitorRepository.flush();
        return MonitorResponse.from(monitor);
    }

    @Transactional
    public void delete(String ownerSubject, UUID monitorId) {
        Monitor monitor = monitorRepository.findOwnedForUpdate(monitorId, ownerSubject)
                .orElseThrow(MonitorNotFoundException::new);
        monitor.markDeleted(databaseNow());
        monitorRepository.flush();
        jdbcTemplate.update("DELETE FROM status_page_monitors WHERE monitor_id = ?", monitorId);
        // Do not lock executions here: incident evaluation locks execution then monitor.
        // An already published/leased job may still run; ingestion serializes on the monitor row and drops it.
        jdbcTemplate.update("""
                UPDATE outbox_events SET failed_at = clock_timestamp(), last_error = 'monitor_deleted',
                    claimed_by = NULL, claimed_until = NULL
                WHERE published_at IS NULL AND failed_at IS NULL
                  AND payload->>'monitorId' = ?
                """, monitorId.toString());
    }

    @Transactional(readOnly = true)
    public MonitorResponse get(String ownerSubject, UUID monitorId) {
        Objects.requireNonNull(ownerSubject, "ownerSubject must not be null");
        Objects.requireNonNull(monitorId, "monitorId must not be null");
        return monitorRepository.findByIdAndOwnerSubject(monitorId, ownerSubject)
                .map(MonitorResponse::from)
                .orElseThrow(MonitorNotFoundException::new);
    }

    private Instant databaseNow() {
        return Objects.requireNonNull(jdbcTemplate.queryForObject(
                "SELECT clock_timestamp()", OffsetDateTime.class
        )).toInstant();
    }
}

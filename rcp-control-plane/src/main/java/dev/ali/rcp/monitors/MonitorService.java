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

    public MonitorService(
            MonitorRepository monitorRepository,
            SafeTargetPolicy safeTargetPolicy,
            JdbcTemplate jdbcTemplate,
            @Value("${rcp.monitors.max-per-owner:25}") int maxPerOwner,
            @Value("${rcp.monitors.max-total:0}") int maxTotal,
            @Value("${rcp.monitors.min-interval-seconds:30}") int minIntervalSeconds,
            @Value("${rcp.monitors.max-timeout-ms:30000}") int maxTimeoutMs
    ) {
        this.monitorRepository = monitorRepository;
        this.safeTargetPolicy = safeTargetPolicy;
        this.jdbcTemplate = jdbcTemplate;
        this.limits = new MonitorLimits(maxPerOwner, maxTotal, minIntervalSeconds, maxTimeoutMs);
    }

    /** The limits this deployment enforces, so clients can offer only choices that will be accepted. */
    public MonitorLimits limits() {
        return limits;
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
        if (limits.maxTotal() > 0) {
            jdbcTemplate.queryForList("SELECT pg_advisory_xact_lock(?, ?)", CAPACITY_LOCK, 0);
            Long total = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM monitors", Long.class);
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
                "SELECT COUNT(*) FROM monitors WHERE owner_subject = ?",
                Long.class, ownerSubject
        );
        if (existing != null && existing >= limits.maxPerOwner()) {
            throw new MonitorQuotaExceededException(limits.maxPerOwner());
        }

        Monitor monitor = Monitor.create(
                ownerSubject,
                request.name().trim(),
                normalizedTarget,
                request.checkIntervalSeconds(),
                request.timeoutMs(),
                databaseNow()
        );

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

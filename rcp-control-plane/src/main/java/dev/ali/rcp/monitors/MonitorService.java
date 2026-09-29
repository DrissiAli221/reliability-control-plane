package dev.ali.rcp.monitors;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.beans.factory.annotation.Value;
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
    private final JdbcTemplate jdbcTemplate;
    private final int maxPerOwner;

    public MonitorService(
            MonitorRepository monitorRepository,
            SafeTargetPolicy safeTargetPolicy,
            JdbcTemplate jdbcTemplate,
            @Value("${rcp.monitors.max-per-owner:25}") int maxPerOwner
    ) {
        if (maxPerOwner < 1) {
            throw new IllegalArgumentException("maxPerOwner must be positive");
        }
        this.monitorRepository = monitorRepository;
        this.safeTargetPolicy = safeTargetPolicy;
        this.jdbcTemplate = jdbcTemplate;
        this.maxPerOwner = maxPerOwner;
    }

    @Transactional
    public MonitorResponse create(
            String ownerSubject,
            CreateMonitorRequest request
    ) {
        String normalizedTarget = safeTargetPolicy.validateAndNormalize(
                request.targetUrl()
        );

        // Serialize creations for this subject across all control-plane instances.
        // Hash collisions merely serialize unrelated subjects; the count still uses
        // the full subject. The transaction-scoped lock releases on commit/rollback.
        jdbcTemplate.queryForList("SELECT pg_advisory_xact_lock(?, ?)",
                0x5243504d, ownerSubject.hashCode());
        Long existing = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM monitors WHERE owner_subject = ?",
                Long.class, ownerSubject
        );
        if (existing != null && existing >= maxPerOwner) {
            throw new MonitorQuotaExceededException(maxPerOwner);
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

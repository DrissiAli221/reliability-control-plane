package dev.ali.rcp.monitors;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "monitors")
public class Monitor {

    @Id
    @Column(name = "monitor_id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "owner_subject", nullable = false, updatable = false)
    private String ownerSubject;

    @Column(name = "name", nullable = false, length = 120)
    private String name;

    @Column(name = "target_url", nullable = false, columnDefinition = "text")
    private String targetUrl;

    @Column(name = "check_interval_seconds", nullable = false)
    private int checkIntervalSeconds;

    @Column(name = "timeout_ms", nullable = false)
    private int timeoutMs;

    @Column(name = "enabled", nullable = false)
    private boolean enabled;

    @Column(name = "next_check_at")
    private Instant nextCheckAt;

    @Column(name = "behavior_version", nullable = false)
    private long behaviorVersion;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected Monitor() {
        // Required by JPA
    }

    private Monitor(
            UUID id,
            String ownerSubject,
            String name,
            String targetUrl,
            int checkIntervalSeconds,
            int timeoutMs,
            Instant now
    ) {
        this.id = id;
        this.ownerSubject = ownerSubject;
        this.name = name;
        this.targetUrl = targetUrl;
        this.checkIntervalSeconds = checkIntervalSeconds;
        this.timeoutMs = timeoutMs;
        this.enabled = true;
        this.nextCheckAt = now;
        this.behaviorVersion = 1;
        this.createdAt = now;
        this.updatedAt = now;
    }

    public static Monitor create(
            String ownerSubject,
            String name,
            String targetUrl,
            int checkIntervalSeconds,
            int timeoutMs,
            Instant now
    ) {
        return new Monitor(
                UUID.randomUUID(),
                ownerSubject,
                name,
                targetUrl,
                checkIntervalSeconds,
                timeoutMs,
                now
        );
    }

    public void changeEnabled(boolean requestedEnabled, Instant changedAt) {
        if (enabled == requestedEnabled) {
            return;
        }
        enabled = requestedEnabled;
        nextCheckAt = requestedEnabled ? changedAt : null;
        behaviorVersion++;
        updatedAt = changedAt;
    }

    public UUID getId() {
        return id;
    }

    public String getOwnerSubject() {
        return ownerSubject;
    }

    public String getName() {
        return name;
    }

    public String getTargetUrl() {
        return targetUrl;
    }

    public int getCheckIntervalSeconds() {
        return checkIntervalSeconds;
    }

    public int getTimeoutMs() {
        return timeoutMs;
    }

    public boolean isEnabled() {
        return enabled;
    }

    public Instant getNextCheckAt() {
        return nextCheckAt;
    }

    public long getBehaviorVersion() {
        return behaviorVersion;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}

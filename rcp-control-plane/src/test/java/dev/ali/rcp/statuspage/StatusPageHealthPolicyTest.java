package dev.ali.rcp.statuspage;

import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

class StatusPageHealthPolicyTest {
    private static final Instant NOW = Instant.parse("2026-09-26T12:00:00Z");

    @Test
    void currentUpVerdictIsFreshAtBoundaryThenBecomesStale() {
        assertThat(status(NOW.minusSeconds(125), 1L, 1L)).isEqualTo("OPERATIONAL");
        assertThat(status(NOW.minusSeconds(126), 1L, 1L)).isEqualTo("STALE");
    }

    @Test
    void resumeNeedsNewEvidenceEvenWhenOldUpVerdictIsRecent() {
        assertThat(status(NOW.minusSeconds(10), 2L, 1L)).isEqualTo("UNKNOWN");
    }

    @Test
    void knownOpenIncidentRemainsVisibleWhenMonitoringIsPaused() {
        assertThat(StatusPageHealthPolicy.componentStatus(
                false, "OPEN", "DOWN", NOW.minusSeconds(10), 2L, 1L, 60, 5_000, NOW
        )).isEqualTo("OUTAGE");
    }

    @Test
    void openIncidentWinsOverStaleOrOldVersionEvidence() {
        assertThat(StatusPageHealthPolicy.componentStatus(
                true, "OPEN", "DOWN", NOW.minusSeconds(500), 2L, 1L, 60, 5_000, NOW
        )).isEqualTo("OUTAGE");
    }

    @Test
    void pausedMonitorWithoutOpenIncidentIsNotOperational() {
        assertThat(StatusPageHealthPolicy.componentStatus(
                false, "HEALTHY", "UP", NOW.minusSeconds(10), 2L, 1L, 60, 5_000, NOW
        )).isEqualTo("PAUSED");
    }

    @Test
    void unexpectedVerdictNeverDefaultsToOperational() {
        assertThat(StatusPageHealthPolicy.componentStatus(
                true, "HEALTHY", "FUTURE_VERDICT", NOW.minusSeconds(10),
                1L, 1L, 60, 5_000, NOW
        )).isEqualTo("UNKNOWN");
    }

    private String status(Instant latestScheduledAt, long currentVersion, long resultVersion) {
        return StatusPageHealthPolicy.componentStatus(
                true, "HEALTHY", "UP", latestScheduledAt,
                currentVersion, resultVersion, 60, 5_000, NOW
        );
    }
}

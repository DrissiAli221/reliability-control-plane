package dev.ali.rcp.incidents;

import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

class IncidentPolicyTest {

    private static final Instant START =
            Instant.parse("2026-08-16T12:00:00Z");

    private final IncidentPolicy policy =
            IncidentPolicy.initialPolicy();

    @Test
    void opensAfterTwoConsecutiveDownExecutions() {
        IncidentDecision first = policy.evaluate(
                IncidentState.healthy(),
                ExecutionVerdict.DOWN,
                time(0)
        );

        assertThat(first.state().isOpen()).isFalse();
        assertThat(first.state().consecutiveDown()).isEqualTo(1);
        assertThat(first.transition())
                .isEqualTo(IncidentDecision.Transition.NONE);

        IncidentDecision second = policy.evaluate(
                first.state(),
                ExecutionVerdict.DOWN,
                time(1)
        );

        assertThat(second.state().isOpen()).isTrue();
        assertThat(second.state().openedAt()).isEqualTo(time(1));
        assertThat(second.transition())
                .isEqualTo(IncidentDecision.Transition.OPENED);
    }

    @Test
    void disagreementBreaksFailureStreak() {
        IncidentDecision firstDown = policy.evaluate(
                IncidentState.healthy(),
                ExecutionVerdict.DOWN,
                time(0)
        );

        IncidentDecision disagreement = policy.evaluate(
                firstDown.state(),
                ExecutionVerdict.DISAGREEMENT,
                time(1)
        );

        IncidentDecision nextDown = policy.evaluate(
                disagreement.state(),
                ExecutionVerdict.DOWN,
                time(2)
        );

        assertThat(nextDown.state().isOpen()).isFalse();
        assertThat(nextDown.state().consecutiveDown()).isEqualTo(1);
    }

    @Test
    void resolvesAfterTwoConsecutiveUpExecutions() {
        IncidentState open = openIncident();

        IncidentDecision firstUp = policy.evaluate(
                open,
                ExecutionVerdict.UP,
                time(2)
        );

        assertThat(firstUp.state().isOpen()).isTrue();
        assertThat(firstUp.state().consecutiveUp()).isEqualTo(1);

        IncidentDecision secondUp = policy.evaluate(
                firstUp.state(),
                ExecutionVerdict.UP,
                time(3)
        );

        assertThat(secondUp.state().isOpen()).isFalse();
        assertThat(secondUp.transition())
                .isEqualTo(IncidentDecision.Transition.RESOLVED);
    }

    @Test
    void healthyMonitorCannotResolveAnIncidentThatNeverOpened() {
        IncidentDecision firstUp = policy.evaluate(
                IncidentState.healthy(),
                ExecutionVerdict.UP,
                time(0)
        );

        IncidentDecision secondUp = policy.evaluate(
                firstUp.state(),
                ExecutionVerdict.UP,
                time(1)
        );

        assertThat(secondUp.state().isOpen()).isFalse();
        assertThat(secondUp.transition())
                .isEqualTo(IncidentDecision.Transition.NONE);
    }

    @Test
    void noDataCannotResolveOpenIncident() {
        IncidentDecision decision = policy.evaluate(
                openIncident(),
                ExecutionVerdict.NO_DATA,
                time(2)
        );

        assertThat(decision.state().isOpen()).isTrue();
        assertThat(decision.transition())
                .isEqualTo(IncidentDecision.Transition.NONE);
    }

    @Test
    void duplicateAndOlderEvidenceAreIgnored() {
        IncidentDecision first = policy.evaluate(
                IncidentState.healthy(),
                ExecutionVerdict.DOWN,
                time(1)
        );

        IncidentDecision duplicate = policy.evaluate(
                first.state(),
                ExecutionVerdict.DOWN,
                time(1)
        );

        IncidentDecision older = policy.evaluate(
                duplicate.state(),
                ExecutionVerdict.DOWN,
                time(0)
        );

        assertThat(duplicate.transition())
                .isEqualTo(
                        IncidentDecision.Transition.IGNORED_STALE
                );

        assertThat(older.transition())
                .isEqualTo(
                        IncidentDecision.Transition.IGNORED_STALE
                );

        assertThat(older.state()).isEqualTo(first.state());
    }

    private IncidentState openIncident() {
        IncidentDecision first = policy.evaluate(
                IncidentState.healthy(),
                ExecutionVerdict.DOWN,
                time(0)
        );

        return policy.evaluate(
                first.state(),
                ExecutionVerdict.DOWN,
                time(1)
        ).state();
    }

    private Instant time(long minutes) {
        return START.plusSeconds(minutes * 60);
    }
}
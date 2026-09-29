package dev.ali.rcp.incidents;

import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

/** Exhausts every seven-verdict trace under the initial 2-DOWN/2-UP policy. */
class IncidentPolicyStateMachineTest {
    private static final ExecutionVerdict[] VERDICTS = ExecutionVerdict.values();
    private static final Instant START = Instant.parse("2026-09-01T00:00:00Z");
    private final IncidentPolicy policy = IncidentPolicy.initialPolicy();

    @Test
    void everyShortTraceRespectsTransitionAndOrderingInvariants() {
        int traceCount = (int) Math.pow(VERDICTS.length, 7);
        for (int encoded = 0; encoded < traceCount; encoded++) {
            checkTrace(encoded);
        }
    }

    private void checkTrace(int encoded) {
        IncidentState actual = IncidentState.healthy();
        ReferenceState expected = new ReferenceState();
        int remaining = encoded;
        int opens = 0;
        int resolutions = 0;

        for (int step = 0; step < 7; step++) {
            ExecutionVerdict verdict = VERDICTS[remaining % VERDICTS.length];
            remaining /= VERDICTS.length;
            Instant scheduledAt = START.plusSeconds(step * 60L);

            IncidentDecision decision = policy.evaluate(actual, verdict, scheduledAt);
            IncidentDecision.Transition expectedTransition = expected.apply(verdict, scheduledAt);
            assertThat(decision.transition())
                    .as("trace %s step %s verdict %s", encoded, step, verdict)
                    .isEqualTo(expectedTransition);
            assertThat(decision.state().isOpen()).isEqualTo(expected.open);
            assertThat(decision.state().consecutiveDown()).isEqualTo(expected.downStreak);
            assertThat(decision.state().consecutiveUp()).isEqualTo(expected.upStreak);
            assertThat(decision.state().openedAt()).isEqualTo(expected.openedAt);
            assertThat(decision.state().lastEvaluatedAt()).isEqualTo(scheduledAt);

            if (decision.transition() == IncidentDecision.Transition.OPENED) {
                opens++;
            } else if (decision.transition() == IncidentDecision.Transition.RESOLVED) {
                resolutions++;
            }
            assertThat(resolutions).isLessThanOrEqualTo(opens);
            assertThat(opens - resolutions).isEqualTo(decision.state().isOpen() ? 1 : 0);

            // A redelivery or late result must never produce another incident event.
            assertThat(policy.evaluate(decision.state(), verdict, scheduledAt))
                    .isEqualTo(new IncidentDecision(
                            decision.state(), IncidentDecision.Transition.IGNORED_STALE));
            assertThat(policy.evaluate(decision.state(), verdict, scheduledAt.minusSeconds(1)))
                    .isEqualTo(new IncidentDecision(
                            decision.state(), IncidentDecision.Transition.IGNORED_STALE));
            actual = decision.state();
        }
    }

    /** Small independent specification: streaks are updated before transitions. */
    private static final class ReferenceState {
        private boolean open;
        private int downStreak;
        private int upStreak;
        private Instant openedAt;

        IncidentDecision.Transition apply(ExecutionVerdict verdict, Instant scheduledAt) {
            switch (verdict) {
                case DOWN -> {
                    downStreak++;
                    upStreak = 0;
                    if (!open && downStreak == 2) {
                        open = true;
                        openedAt = scheduledAt;
                        return IncidentDecision.Transition.OPENED;
                    }
                }
                case UP -> {
                    downStreak = 0;
                    if (open) {
                        upStreak++;
                        if (upStreak == 2) {
                            open = false;
                            upStreak = 0;
                            openedAt = null;
                            return IncidentDecision.Transition.RESOLVED;
                        }
                    } else {
                        upStreak = 0;
                    }
                }
                case DISAGREEMENT, NO_DATA -> {
                    downStreak = 0;
                    upStreak = 0;
                }
            }
            return IncidentDecision.Transition.NONE;
        }
    }
}

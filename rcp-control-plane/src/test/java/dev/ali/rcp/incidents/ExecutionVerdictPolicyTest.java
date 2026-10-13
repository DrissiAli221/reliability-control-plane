package dev.ali.rcp.incidents;

import dev.ali.rcp.probes.ProbeOutcome;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class ExecutionVerdictPolicyTest {
    private final ExecutionVerdictPolicy policy = new ExecutionVerdictPolicy();

    @Test
    void allSuccessfulRegionsAreUp() {
        assertThat(policy.evaluate(2, false, List.of(http("eu", 200), http("us", 302))))
                .contains(ExecutionVerdict.UP);
    }

    @Test
    void allFailedRegionsAreDown() {
        assertThat(policy.evaluate(2, false, List.of(http("eu", 503), timeout("us"))))
                .contains(ExecutionVerdict.DOWN);
    }

    @Test
    void mixedRegionalEvidenceIsDisagreement() {
        assertThat(policy.evaluate(2, false, List.of(http("eu", 200), http("us", 503))))
                .contains(ExecutionVerdict.DISAGREEMENT);
    }

    @Test
    void incompleteEvidenceWaitsBeforeDeadline() {
        assertThat(policy.evaluate(2, false, List.of(http("eu", 503))))
                .isEmpty();
    }

    @Test
    void incompleteEvidenceAfterDeadlineIsDisagreement() {
        assertThat(policy.evaluate(2, true, List.of(http("eu", 503))))
                .contains(ExecutionVerdict.DISAGREEMENT);
    }

    @Test
    void absentEvidenceAfterDeadlineIsNoData() {
        assertThat(policy.evaluate(2, true, List.of()))
                .contains(ExecutionVerdict.NO_DATA);
    }

    @Test
    void allSecurityRejectionsAreNoDataNotTargetDown() {
        assertThat(policy.evaluate(2, false, List.of(
                failure("eu", ProbeOutcome.UNSAFE_TARGET),
                failure("us", ProbeOutcome.UNSAFE_TARGET)
        ))).contains(ExecutionVerdict.NO_DATA);
    }

    @Test
    void securityRejectionCannotJoinTargetFailuresToOpenAnIncident() {
        assertThat(policy.evaluate(2, false, List.of(
                failure("eu", ProbeOutcome.UNSAFE_TARGET),
                http("us", 503)
        ))).contains(ExecutionVerdict.DISAGREEMENT);
    }

    @Test
    void internalWorkerFailureDoesNotCountAsTargetDown() {
        assertThat(policy.evaluate(2, false, List.of(
                failure("eu", ProbeOutcome.INTERNAL_ERROR),
                failure("us", ProbeOutcome.INTERRUPTED)
        ))).contains(ExecutionVerdict.NO_DATA);
    }

    @Test
    void challengedRegionsInBothPlacesAreNoData() {
        assertThat(policy.evaluate(2, false, List.of(challenged("eu", 403, null), challenged("us", 403, null))))
                .contains(ExecutionVerdict.NO_DATA);
    }

    @Test
    void oneChallengedRegionAndOneRealAnswerIsDisagreement() {
        assertThat(policy.evaluate(2, false, List.of(challenged("eu", 403, null), http("us", 200))))
                .contains(ExecutionVerdict.DISAGREEMENT);
        assertThat(policy.evaluate(2, false, List.of(challenged("eu", 403, null), http("us", 503))))
                .contains(ExecutionVerdict.DISAGREEMENT);
    }

    @Test
    void acceptedChallengeStatusOverridesAndStaysUp() {
        List<Integer> accepted = List.of(200, 403);
        assertThat(policy.evaluate(2, false, List.of(challenged("eu", 403, accepted), challenged("us", 403, accepted))))
                .contains(ExecutionVerdict.UP);
    }

    @Test
    void plainForbiddenWithoutChallengeHeaderStaysDown() {
        assertThat(policy.evaluate(2, false, List.of(http("eu", 403), http("us", 403))))
                .contains(ExecutionVerdict.DOWN);
    }

    @Test
    void challengeFactIsNotTargetEvidenceUnlessAccepted() {
        assertThat(challenged("eu", 403, null).isTargetEvidence()).isFalse();
        assertThat(challenged("eu", 403, List.of(403)).isTargetEvidence()).isTrue();
        assertThat(http("eu", 403).isTargetEvidence()).isTrue();
    }

    private RegionalProbeFact challenged(String region, int status, List<Integer> accepted) {
        return new RegionalProbeFact(region, ProbeOutcome.HTTP_RESPONSE, status, accepted, "CLOUDFLARE_CHALLENGE");
    }

    private RegionalProbeFact http(String region, int status) {
        return new RegionalProbeFact(region, ProbeOutcome.HTTP_RESPONSE, status);
    }

    private RegionalProbeFact timeout(String region) {
        return new RegionalProbeFact(region, ProbeOutcome.REQUEST_TIMEOUT, null);
    }

    private RegionalProbeFact failure(String region, ProbeOutcome outcome) {
        return new RegionalProbeFact(region, outcome, null);
    }
}

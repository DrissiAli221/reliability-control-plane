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

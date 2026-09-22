package dev.ali.rcp.incidents;

import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ExecutionFinalizerTest {
    @Test
    void trustsDatabaseDeadlineDecisionInsteadOfApplicationClock() {
        ExecutionFinalizationRepository repository = mock(ExecutionFinalizationRepository.class);
        UUID executionId = UUID.randomUUID();
        Instant futureToApplicationClock = Instant.parse("2099-01-01T00:00:00Z");
        FinalizableExecution execution = new FinalizableExecution(
                executionId,
                UUID.randomUUID(),
                futureToApplicationClock.minusSeconds(60),
                futureToApplicationClock,
                true,
                2
        );
        when(repository.findAndLockFinalizable(50)).thenReturn(List.of(execution));
        when(repository.findFacts(executionId)).thenReturn(List.of());

        assertThat(new ExecutionFinalizer(repository).finalizeBatch()).isEqualTo(1);
        verify(repository).finalizeExecution(executionId, ExecutionVerdict.NO_DATA);
    }
}

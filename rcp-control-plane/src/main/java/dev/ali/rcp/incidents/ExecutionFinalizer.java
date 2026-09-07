package dev.ali.rcp.incidents;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.Clock;
import java.util.List;
import java.util.Objects;

@Service
public class ExecutionFinalizer {
    private static final int BATCH_SIZE = 50;

    private final ExecutionFinalizationRepository repository;
    private final ExecutionVerdictPolicy verdictPolicy;
    private final Clock clock;

    @Autowired
    public ExecutionFinalizer(ExecutionFinalizationRepository repository) {
        this(repository, new ExecutionVerdictPolicy(), Clock.systemUTC());
    }

    ExecutionFinalizer(
            ExecutionFinalizationRepository repository,
            ExecutionVerdictPolicy verdictPolicy,
            Clock clock
    ) {
        this.repository = Objects.requireNonNull(repository);
        this.verdictPolicy = Objects.requireNonNull(verdictPolicy);
        this.clock = Objects.requireNonNull(clock);
    }

    @Transactional
    public int finalizeBatch() {
        List<FinalizableExecution> executions = repository.findAndLockFinalizable(BATCH_SIZE);
        for (FinalizableExecution execution : executions) {
            List<RegionalProbeFact> facts = repository.findFacts(execution.executionId());
            ExecutionVerdict verdict = verdictPolicy.evaluate(
                    execution.expectedRegionCount(),
                    !clock.instant().isBefore(execution.resultDeadlineAt()),
                    facts
            ).orElseThrow(() -> new IllegalStateException(
                    "repository returned an execution that is not finalizable: " + execution.executionId()
            ));
            repository.finalizeExecution(execution.executionId(), verdict);
        }
        return executions.size();
    }
}

package dev.ali.rcp.incidents;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Objects;

@Service
public class ExecutionFinalizer {
    private static final Logger LOG = LoggerFactory.getLogger(ExecutionFinalizer.class);
    private static final int BATCH_SIZE = 50;

    private final ExecutionFinalizationRepository repository;
    private final ExecutionVerdictPolicy verdictPolicy;

    @Autowired
    public ExecutionFinalizer(ExecutionFinalizationRepository repository) {
        this(repository, new ExecutionVerdictPolicy());
    }

    ExecutionFinalizer(
            ExecutionFinalizationRepository repository,
            ExecutionVerdictPolicy verdictPolicy
    ) {
        this.repository = Objects.requireNonNull(repository);
        this.verdictPolicy = Objects.requireNonNull(verdictPolicy);
    }

    @Transactional
    public int finalizeBatch() {
        List<FinalizableExecution> executions = repository.findAndLockFinalizable(BATCH_SIZE);
        for (FinalizableExecution execution : executions) {
            List<RegionalProbeFact> facts = repository.findFacts(execution.executionId());
            ExecutionVerdict verdict = verdictPolicy.evaluate(
                    execution.expectedRegionCount(),
                    execution.deadlineElapsed(),
                    facts
            ).orElseThrow(() -> new IllegalStateException(
                    "repository returned an execution that is not finalizable: " + execution.executionId()
            ));
            repository.finalizeExecution(execution.executionId(), verdict);
            LOG.atInfo()
                    .addKeyValue("executionId", execution.executionId())
                    .addKeyValue("monitorId", execution.monitorId())
                    .addKeyValue("receivedRegionCount", facts.size())
                    .addKeyValue("expectedRegionCount", execution.expectedRegionCount())
                    .addKeyValue("verdict", verdict)
                    .log("probe execution finalized");
        }
        return executions.size();
    }
}

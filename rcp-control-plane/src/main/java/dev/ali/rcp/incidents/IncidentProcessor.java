package dev.ali.rcp.incidents;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Objects;
import java.util.UUID;

@Service
public class IncidentProcessor {
    private static final Logger LOG = LoggerFactory.getLogger(IncidentProcessor.class);
    private static final int BATCH_SIZE = 50;

    private final IncidentRepository repository;
    private final IncidentPolicy policy;

    public IncidentProcessor(IncidentRepository repository) {
        this.repository = Objects.requireNonNull(repository);
        this.policy = IncidentPolicy.initialPolicy();
    }

    @Transactional
    public int processBatch() {
        List<FinalizedExecution> executions = repository.findAndLockNextUnevaluated(BATCH_SIZE);
        for (FinalizedExecution execution : executions) {
            process(execution);
        }
        return executions.size();
    }

    private void process(FinalizedExecution execution) {
        PersistedIncidentState current = repository.findState(execution.monitorId());
        IncidentDecision decision = policy.evaluate(
                current.state(),
                execution.verdict(),
                execution.scheduledAt()
        );

        UUID openIncidentId = current.openIncidentId();
        if (decision.transition() == IncidentDecision.Transition.OPENED) {
            openIncidentId = UUID.randomUUID();
            repository.openIncident(openIncidentId, execution);
            repository.insertEvent(
                    UUID.randomUUID(), openIncidentId, execution, decision.transition()
            );
        } else if (decision.transition() == IncidentDecision.Transition.RESOLVED) {
            if (openIncidentId == null) {
                throw new IllegalStateException("cannot resolve without an open incident");
            }
            repository.resolveIncident(openIncidentId, execution);
            repository.insertEvent(
                    UUID.randomUUID(), openIncidentId, execution, decision.transition()
            );
            openIncidentId = null;
        }

        if (decision.transition() != IncidentDecision.Transition.IGNORED_STALE) {
            repository.saveState(execution.monitorId(), decision.state(), openIncidentId);
        }
        repository.recordEvaluation(execution, decision.transition());

        LOG.atInfo()
                .addKeyValue("executionId", execution.executionId())
                .addKeyValue("monitorId", execution.monitorId())
                .addKeyValue("verdict", execution.verdict())
                .addKeyValue("incidentTransition", decision.transition())
                .addKeyValue("resultingIncidentStatus", decision.state().status())
                .log("incident policy evaluated");
    }
}

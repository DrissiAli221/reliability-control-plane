package dev.ali.rcp.pipeline;

import dev.ali.rcp.incidents.IncidentPolicy;
import dev.ali.rcp.monitors.MonitorNotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Objects;
import java.util.UUID;

@Service
public class PipelineService {
    static final int ACTIVITY_WINDOW_SECONDS = 300;

    // The processor evaluates with the same policy, so the thresholds shown are the thresholds applied.
    private static final IncidentPolicy POLICY = IncidentPolicy.initialPolicy();

    private final PipelineRepository repository;

    public PipelineService(PipelineRepository repository) {
        this.repository = Objects.requireNonNull(repository);
    }

    @Transactional(readOnly = true)
    public ExecutionTrace trace(String ownerSubject, UUID monitorId, UUID executionId) {
        requireOwned(ownerSubject, monitorId);
        return repository.findTrace(monitorId, executionId).orElseThrow(ExecutionNotFoundException::new);
    }

    @Transactional(readOnly = true)
    public IncidentStateView incidentState(String ownerSubject, UUID monitorId) {
        requireOwned(ownerSubject, monitorId);
        return repository.incidentState(monitorId, POLICY.failuresToOpen(), POLICY.successesToResolve());
    }

    @Transactional(readOnly = true)
    public PipelineSnapshot snapshot(String ownerSubject) {
        Objects.requireNonNull(ownerSubject, "ownerSubject must not be null");
        return repository.snapshot(ownerSubject, repository.databaseNow(), ACTIVITY_WINDOW_SECONDS);
    }

    private void requireOwned(String ownerSubject, UUID monitorId) {
        Objects.requireNonNull(ownerSubject, "ownerSubject must not be null");
        if (!repository.ownsMonitor(ownerSubject, monitorId)) {
            throw new MonitorNotFoundException();
        }
    }
}

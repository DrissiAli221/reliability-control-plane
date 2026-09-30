package dev.ali.rcp.pipeline;

import dev.ali.rcp.incidents.IncidentPolicy;
import dev.ali.rcp.monitors.MonitorNotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.stream.IntStream;

@Service
public class PipelineService {
    static final int ACTIVITY_WINDOW_SECONDS = 300;
    static final int EVENT_WINDOW_SECONDS = 900;
    static final int EVENT_LIMIT = 40;
    static final int OVERVIEW_BUCKETS = 48;
    static final int OVERVIEW_BUCKET_SECONDS = 1800;
    static final int INCIDENT_WINDOW_DAYS = 7;
    static final int INCIDENT_LIMIT = 50;

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

    @Transactional(readOnly = true)
    public List<PipelineEvent> recentEvents(String ownerSubject) {
        Objects.requireNonNull(ownerSubject, "ownerSubject must not be null");
        return repository.recentEvents(ownerSubject, repository.databaseNow().minusSeconds(EVENT_WINDOW_SECONDS), EVENT_LIMIT);
    }

    @Transactional(readOnly = true)
    public FleetOverview overview(String ownerSubject) {
        Objects.requireNonNull(ownerSubject, "ownerSubject must not be null");
        Instant now = repository.databaseNow();
        // Buckets end on a boundary so they stay stable between refreshes; the newest one is still filling.
        long step = OVERVIEW_BUCKET_SECONDS;
        Instant to = Instant.ofEpochSecond((now.getEpochSecond() / step + 1) * step);
        Instant from = to.minusSeconds(step * OVERVIEW_BUCKETS);
        Map<Integer, FleetOverview.Bucket> counted = repository.verdictBuckets(ownerSubject, from, to, OVERVIEW_BUCKET_SECONDS);
        List<FleetOverview.Bucket> buckets = IntStream.range(0, OVERVIEW_BUCKETS)
                .mapToObj(index -> counted.getOrDefault(index, FleetOverview.Bucket.EMPTY))
                .toList();
        Instant incidentsFrom = now.minus(Duration.ofDays(INCIDENT_WINDOW_DAYS));
        return new FleetOverview(from, to, OVERVIEW_BUCKET_SECONDS, buckets, incidentsFrom,
                repository.incidentSpans(ownerSubject, incidentsFrom, INCIDENT_LIMIT));
    }

    private void requireOwned(String ownerSubject, UUID monitorId) {
        Objects.requireNonNull(ownerSubject, "ownerSubject must not be null");
        if (!repository.ownsMonitor(ownerSubject, monitorId)) {
            throw new MonitorNotFoundException();
        }
    }
}

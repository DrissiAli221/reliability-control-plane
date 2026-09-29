package dev.ali.rcp.statuspage;

import dev.ali.rcp.monitors.DailyEvidence;
import dev.ali.rcp.monitors.MonitorHistoryRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

@Service
public class StatusPageService {
    private static final int PUBLIC_HISTORY_DAYS = 45;

    private final StatusPageRepository repository;
    private final MonitorHistoryRepository historyRepository;

    public StatusPageService(StatusPageRepository repository, MonitorHistoryRepository historyRepository) {
        this.repository = Objects.requireNonNull(repository);
        this.historyRepository = Objects.requireNonNull(historyRepository);
    }

    @Transactional
    public StatusPageResponse create(String ownerSubject, CreateStatusPageRequest request) {
        List<UUID> monitorIds = List.copyOf(request.monitorIds());
        if (new HashSet<>(monitorIds).size() != monitorIds.size()) {
            throw new IllegalArgumentException("monitorIds must not contain duplicates");
        }
        if (repository.countOwnedMonitors(ownerSubject, monitorIds) != monitorIds.size()) {
            throw new IllegalArgumentException("every status-page monitor must be owned by the caller");
        }

        UUID pageId = UUID.randomUUID();
        boolean published = Boolean.TRUE.equals(request.published());
        repository.insertPage(
                pageId,
                ownerSubject,
                request.name().trim(),
                request.slug(),
                published
        );
        for (int index = 0; index < monitorIds.size(); index++) {
            repository.insertMonitor(pageId, monitorIds.get(index), index);
        }
        return new StatusPageResponse(
                pageId, request.name().trim(), request.slug(), published, monitorIds
        );
    }

    @Transactional(readOnly = true)
    public PublicStatusPage findPublic(String slug) {
        StoredStatusPage page = repository.findPublishedPage(slug)
                .orElseThrow(StatusPageNotFoundException::new);
        // Probe scheduling uses PostgreSQL time; assess freshness on the same clock.
        var asOf = repository.databaseNow();
        List<StatusComponentSnapshot> snapshots = repository.findComponentSnapshots(page.id(), asOf);
        LocalDate today = asOf.atOffset(ZoneOffset.UTC).toLocalDate();
        Map<UUID, List<DailyEvidence>> history = historyRepository.dailyEvidence(
                snapshots.stream().map(StatusComponentSnapshot::monitorId).toList(),
                today.minusDays(PUBLIC_HISTORY_DAYS - 1L),
                today
        );
        List<PublicStatusComponent> components = snapshots.stream()
                .map(snapshot -> {
                    List<DailyEvidence> days = history.getOrDefault(snapshot.monitorId(), List.of());
                    return new PublicStatusComponent(
                            snapshot.name(),
                            snapshot.status(),
                            snapshot.latestVerdict(),
                            snapshot.latestCheckedAt(),
                            DailyEvidence.measuredUptimePercent(days),
                            days
                    );
                })
                .toList();
        return new PublicStatusPage(
                page.name(),
                page.slug(),
                StatusPageHealthPolicy.overallStatus(components),
                asOf,
                components
        );
    }
}

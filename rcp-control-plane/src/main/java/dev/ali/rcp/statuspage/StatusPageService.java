package dev.ali.rcp.statuspage;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

@Service
public class StatusPageService {
    private final StatusPageRepository repository;

    public StatusPageService(StatusPageRepository repository) {
        this.repository = Objects.requireNonNull(repository);
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
        List<PublicStatusComponent> components = repository.findPublicComponents(page.id(), asOf);
        return new PublicStatusPage(
                page.name(),
                page.slug(),
                StatusPageHealthPolicy.overallStatus(components),
                asOf,
                components
        );
    }
}

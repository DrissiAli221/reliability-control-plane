package dev.ali.rcp.monitors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Objects;

@Service
public class MonitorQueryService {
    private final MonitorReadRepository repository;

    public MonitorQueryService(MonitorReadRepository repository) {
        this.repository = Objects.requireNonNull(repository);
    }

    @Transactional(readOnly = true)
    public List<MonitorOverview> listForOwner(String ownerSubject) {
        Objects.requireNonNull(ownerSubject, "ownerSubject must not be null");
        return repository.findAllForOwner(ownerSubject);
    }
}

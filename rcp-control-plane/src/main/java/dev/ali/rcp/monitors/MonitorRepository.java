package dev.ali.rcp.monitors;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface MonitorRepository extends JpaRepository<Monitor, UUID> {

    Optional<Monitor> findByIdAndOwnerSubject(
            UUID id,
            String ownerSubject
    );
}
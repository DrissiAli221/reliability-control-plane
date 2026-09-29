package dev.ali.rcp.monitors;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import jakarta.persistence.LockModeType;

import java.util.Optional;
import java.util.UUID;

public interface MonitorRepository extends JpaRepository<Monitor, UUID> {

    Optional<Monitor> findByIdAndOwnerSubject(
            UUID id,
            String ownerSubject
    );

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select monitor from Monitor monitor where monitor.id = :id and monitor.ownerSubject = :owner")
    Optional<Monitor> findOwnedForUpdate(@Param("id") UUID id, @Param("owner") String ownerSubject);
}

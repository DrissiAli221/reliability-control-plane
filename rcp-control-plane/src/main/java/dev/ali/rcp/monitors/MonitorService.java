package dev.ali.rcp.monitors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;

@Service
public class MonitorService {

    private final MonitorRepository monitorRepository;
    private final SafeTargetPolicy safeTargetPolicy;

    public MonitorService(
            MonitorRepository monitorRepository,
            SafeTargetPolicy safeTargetPolicy
    ) {
        this.monitorRepository = monitorRepository;
        this.safeTargetPolicy = safeTargetPolicy;
    }

    @Transactional
    public MonitorResponse create(
            String ownerSubject,
            CreateMonitorRequest request
    ) {
        String normalizedTarget = safeTargetPolicy.validateAndNormalize(
                request.targetUrl()
        );

        Monitor monitor = Monitor.create(
                ownerSubject,
                request.name().trim(),
                normalizedTarget,
                request.checkIntervalSeconds(),
                request.timeoutMs(),
                Instant.now()
        );

        Monitor saved = monitorRepository.save(monitor);

        return MonitorResponse.from(saved);
    }
}
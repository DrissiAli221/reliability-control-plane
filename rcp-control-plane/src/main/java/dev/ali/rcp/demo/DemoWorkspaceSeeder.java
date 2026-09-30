package dev.ali.rcp.demo;

import dev.ali.rcp.monitors.CreateMonitorRequest;
import dev.ali.rcp.monitors.MonitorQueryService;
import dev.ali.rcp.monitors.MonitorService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Gives the read-only demo account something to look at: when it owns no monitors, the configured ones are created
 * on startup, through the same validation as any other monitor. After that the demo's history simply accumulates.
 */
@Component
@ConditionalOnProperty(prefix = "rcp.demo", name = {"owner-subject", "monitors"})
class DemoWorkspaceSeeder implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(DemoWorkspaceSeeder.class);

    private final MonitorService monitorService;
    private final MonitorQueryService monitorQueryService;
    private final String ownerSubject;
    private final String monitors;

    DemoWorkspaceSeeder(
            MonitorService monitorService,
            MonitorQueryService monitorQueryService,
            @Value("${rcp.demo.owner-subject}") String ownerSubject,
            @Value("${rcp.demo.monitors}") String monitors
    ) {
        this.monitorService = monitorService;
        this.monitorQueryService = monitorQueryService;
        this.ownerSubject = ownerSubject;
        this.monitors = monitors;
    }

    @Override
    public void run(ApplicationArguments arguments) {
        if (ownerSubject.isBlank() || !monitorQueryService.listForOwner(ownerSubject).isEmpty()) return;
        List<CreateMonitorRequest> requests = DemoMonitors.parse(monitors, monitorService.limits());
        for (CreateMonitorRequest request : requests) {
            monitorService.create(ownerSubject, request);
        }
        log.info("Seeded the demo workspace with {} monitors", requests.size());
    }
}

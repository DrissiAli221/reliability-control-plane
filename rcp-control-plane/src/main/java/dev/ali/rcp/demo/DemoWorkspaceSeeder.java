package dev.ali.rcp.demo;

import dev.ali.rcp.monitors.CreateMonitorRequest;
import dev.ali.rcp.monitors.MonitorCapacityReachedException;
import dev.ali.rcp.monitors.MonitorOverview;
import dev.ali.rcp.monitors.MonitorQueryService;
import dev.ali.rcp.monitors.MonitorQuotaExceededException;
import dev.ali.rcp.monitors.MonitorService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Gives the read-only demo account something to look at: on startup, every configured monitor the account does not
 * have yet (matched by name) is created through the same validation as any other monitor. Adding an entry to
 * rcp.demo.monitors therefore adds it to a running demo on the next restart, without touching existing history.
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
        if (ownerSubject.isBlank()) return;
        Set<String> existing = monitorQueryService.listForOwner(ownerSubject).stream()
                .map(MonitorOverview::name)
                .collect(Collectors.toSet());
        List<CreateMonitorRequest> missing = DemoMonitors.parse(monitors, monitorService.limits()).stream()
                .filter(request -> !existing.contains(request.name()))
                .toList();
        int created = 0;
        for (CreateMonitorRequest request : missing) {
            try {
                monitorService.create(ownerSubject, request);
                created++;
            } catch (MonitorQuotaExceededException | MonitorCapacityReachedException exception) {
                // A full deployment must not stop the application from starting; the demo just shows fewer monitors.
                log.warn("Could not add demo monitor {}: {}", request.name(), exception.getMessage());
            }
        }
        if (created > 0) log.info("Added {} configured monitors to the demo workspace", created);
    }
}

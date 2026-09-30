package dev.ali.rcp.monitors;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/monitors")
public class MonitorController {

    private final MonitorService monitorService;

    private final MonitorQueryService monitorQueryService;

    private final MonitorHistoryService monitorHistoryService;

    public MonitorController(
            MonitorService monitorService,
            MonitorQueryService monitorQueryService,
            MonitorHistoryService monitorHistoryService
    ) {
        this.monitorService = monitorService;
        this.monitorQueryService = monitorQueryService;
        this.monitorHistoryService = monitorHistoryService;
    }

    @GetMapping
    public List<MonitorOverview> list(Authentication authentication) {
        return monitorQueryService.listForOwner(authentication.getName());
    }

    @PostMapping
    public ResponseEntity<MonitorResponse> create(
            @Valid @RequestBody CreateMonitorRequest request,
            Authentication authentication
    ) {
        MonitorResponse response = monitorService.create(
                authentication.getName(),
                request
        );

        URI location = URI.create(
                "/api/monitors/" + response.id()
        );

        return ResponseEntity.created(location).body(response);
    }

    @GetMapping("/{monitorId}")
    public MonitorResponse get(@PathVariable UUID monitorId, Authentication authentication) {
        return monitorService.get(authentication.getName(), monitorId);
    }

    @GetMapping("/{monitorId}/history")
    public MonitorHistory history(
            @PathVariable UUID monitorId,
            @RequestParam(defaultValue = "45") @Min(1) @Max(90) int days,
            Authentication authentication
    ) {
        return monitorHistoryService.forOwner(authentication.getName(), monitorId, days);
    }

    @GetMapping("/{monitorId}/latency-heatmap")
    public LatencyHeatmap latencyHeatmap(
            @PathVariable UUID monitorId,
            @RequestParam(defaultValue = "24") @Min(1) @Max(168) int hours,
            Authentication authentication
    ) {
        return monitorHistoryService.latencyHeatmap(authentication.getName(), monitorId, hours);
    }

    @PatchMapping("/{monitorId}/enabled")
    public MonitorResponse setEnabled(
            @PathVariable UUID monitorId,
            @Valid @RequestBody SetMonitorEnabledRequest request,
            Authentication authentication
    ) {
        return monitorService.setEnabled(authentication.getName(), monitorId, request.enabled());
    }
}

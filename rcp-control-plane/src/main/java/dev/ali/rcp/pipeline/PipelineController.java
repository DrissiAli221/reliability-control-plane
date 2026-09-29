package dev.ali.rcp.pipeline;

import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
public class PipelineController {
    private final PipelineService service;

    public PipelineController(PipelineService service) {
        this.service = service;
    }

    @GetMapping("/api/monitors/{monitorId}/incident-state")
    public IncidentStateView incidentState(@PathVariable UUID monitorId, Authentication authentication) {
        return service.incidentState(authentication.getName(), monitorId);
    }

    @GetMapping("/api/monitors/{monitorId}/executions/{executionId}/trace")
    public ExecutionTrace trace(
            @PathVariable UUID monitorId,
            @PathVariable UUID executionId,
            Authentication authentication
    ) {
        return service.trace(authentication.getName(), monitorId, executionId);
    }
}

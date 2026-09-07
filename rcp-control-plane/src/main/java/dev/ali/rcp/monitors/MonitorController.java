package dev.ali.rcp.monitors;

import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;
import java.util.List;

@RestController
@RequestMapping("/api/monitors")
public class MonitorController {

    private final MonitorService monitorService;

    private final MonitorQueryService monitorQueryService;

    public MonitorController(
            MonitorService monitorService,
            MonitorQueryService monitorQueryService
    ) {
        this.monitorService = monitorService;
        this.monitorQueryService = monitorQueryService;
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
}

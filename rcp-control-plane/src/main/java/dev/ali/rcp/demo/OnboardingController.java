package dev.ali.rcp.demo;

import dev.ali.rcp.monitors.MonitorQueryService;
import dev.ali.rcp.monitors.MonitorService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * A brand-new account starts with one example monitor instead of an empty screen, so charts begin filling within a
 * minute. Offered once per identity: the onboarding row is claimed first, so repeated or concurrent calls never
 * create a second example, and an owner who already has monitors is simply marked as onboarded.
 */
@RestController
class OnboardingController {
    private final JdbcTemplate jdbcTemplate;
    private final MonitorService monitorService;
    private final MonitorQueryService monitorQueryService;
    private final String exampleUrl;

    OnboardingController(
            JdbcTemplate jdbcTemplate,
            MonitorService monitorService,
            MonitorQueryService monitorQueryService,
            @Value("${rcp.demo.example-monitor-url:}") String exampleUrl
    ) {
        this.jdbcTemplate = jdbcTemplate;
        this.monitorService = monitorService;
        this.monitorQueryService = monitorQueryService;
        this.exampleUrl = exampleUrl.trim();
    }

    @PostMapping("/api/onboarding")
    @Transactional
    public ResponseEntity<Void> onboard(@AuthenticationPrincipal Jwt jwt) {
        String owner = jwt.getSubject();
        if (exampleUrl.isEmpty()) return ResponseEntity.noContent().build();
        int claimed = jdbcTemplate.update(
                "INSERT INTO owner_onboarding (owner_subject) VALUES (?) ON CONFLICT (owner_subject) DO NOTHING", owner);
        if (claimed == 0 || !monitorQueryService.listForOwner(owner).isEmpty()) return ResponseEntity.noContent().build();
        monitorService.create(owner, DemoMonitors.request("Example", exampleUrl, monitorService.limits()));
        return ResponseEntity.status(201).build();
    }
}

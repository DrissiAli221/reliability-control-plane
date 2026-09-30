package dev.ali.rcp.identity;

import dev.ali.rcp.monitors.MonitorLimits;
import dev.ali.rcp.monitors.MonitorService;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** Who the caller is to this deployment: whether they may change anything, and the limits their monitors must fit. */
@RestController
public class SessionController {
    private final ReadOnlyAccess readOnlyAccess;
    private final MonitorService monitorService;

    public SessionController(ReadOnlyAccess readOnlyAccess, MonitorService monitorService) {
        this.readOnlyAccess = readOnlyAccess;
        this.monitorService = monitorService;
    }

    @GetMapping("/api/me")
    public Session me(@AuthenticationPrincipal Jwt jwt) {
        return new Session(jwt.getSubject(), readOnlyAccess.isReadOnly(jwt), monitorService.limits());
    }

    public record Session(String subject, boolean readOnly, MonitorLimits limits) {
    }
}

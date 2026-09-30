package dev.ali.rcp.identity;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.authorization.AuthorizationDecision;
import org.springframework.security.authorization.AuthorizationManager;
import org.springframework.security.authorization.AuthorizationResult;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.security.web.access.intercept.RequestAuthorizationContext;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.function.Supplier;

/**
 * Members of the configured Cognito group (the public demo account) may read everything they own but change nothing.
 * Enforced on every mutating API request in the security filter chain, so hiding buttons in the dashboard is only
 * a courtesy, never the control.
 */
@Component
public class ReadOnlyAccess {
    static final String GROUPS_CLAIM = "cognito:groups";

    private final String readOnlyGroup;

    public ReadOnlyAccess(@Value("${rcp.identity.read-only-group:demo}") String readOnlyGroup) {
        this.readOnlyGroup = readOnlyGroup.trim();
    }

    public boolean isReadOnly(Jwt jwt) {
        List<String> groups = jwt.getClaimAsStringList(GROUPS_CLAIM);
        return !readOnlyGroup.isEmpty() && groups != null && groups.contains(readOnlyGroup);
    }

    boolean isReadOnly(Authentication authentication) {
        return authentication instanceof JwtAuthenticationToken token && isReadOnly(token.getToken());
    }

    /** Grants a mutating request only to authenticated callers outside the read-only group. */
    AuthorizationManager<RequestAuthorizationContext> writable() {
        return new AuthorizationManager<>() {
            @Override
            public AuthorizationResult authorize(Supplier<? extends Authentication> authentication, RequestAuthorizationContext context) {
                Authentication current = authentication.get();
                boolean authenticated = current instanceof JwtAuthenticationToken && current.isAuthenticated();
                return new AuthorizationDecision(authenticated && !isReadOnly(current));
            }
        };
    }
}

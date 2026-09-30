package dev.ali.rcp.demo;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.List;

/** Local stand-in for the Cognito demo login: a development token for the demo subject in the read-only group. */
@Component
@Profile("local")
class LocalDemoSessionIssuer implements DemoSessionIssuer {
    private static final long LIFETIME_SECONDS = 3_600;

    private final JwtEncoder jwtEncoder;
    private final String subject;
    private final String group;

    LocalDemoSessionIssuer(
            JwtEncoder jwtEncoder,
            @Value("${rcp.demo.owner-subject:local-demo}") String subject,
            @Value("${rcp.identity.read-only-group:demo}") String group
    ) {
        this.jwtEncoder = jwtEncoder;
        this.subject = subject;
        this.group = group;
    }

    @Override
    public DemoSession issue() {
        Instant now = Instant.now();
        JwtClaimsSet claims = JwtClaimsSet.builder()
                .issuer("rcp-local")
                .subject(subject)
                .issuedAt(now)
                .expiresAt(now.plusSeconds(LIFETIME_SECONDS))
                .claim("cognito:groups", List.of(group))
                .build();
        String token = jwtEncoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims)).getTokenValue();
        return new DemoSession(token, null, LIFETIME_SECONDS);
    }
}

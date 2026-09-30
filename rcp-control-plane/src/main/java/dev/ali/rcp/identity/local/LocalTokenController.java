package dev.ali.rcp.identity.local;

import org.springframework.context.annotation.Profile;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.List;

@Profile("local")
@RestController
@RequestMapping("/local")
public class LocalTokenController {
    private final JwtEncoder jwtEncoder;

    public LocalTokenController(JwtEncoder jwtEncoder) {
        this.jwtEncoder = jwtEncoder;
    }

    @PostMapping("/token")
    LocalTokenResponse token(
            @RequestParam(defaultValue = "local-user") String subject,
            @RequestParam(required = false) String group
    ) {
        if (subject.isBlank() || subject.length() > 120) {
            throw new IllegalArgumentException("subject must contain 1 to 120 characters");
        }
        if (group != null && (group.isBlank() || group.length() > 64)) {
            throw new IllegalArgumentException("group must contain 1 to 64 characters");
        }

        Instant issuedAt = Instant.now();
        long expiresInSeconds = 3_600;
        JwtClaimsSet.Builder claims = JwtClaimsSet.builder()
                .issuer("rcp-local")
                .subject(subject)
                .issuedAt(issuedAt)
                .expiresAt(issuedAt.plusSeconds(expiresInSeconds));
        // Mirrors the Cognito claim, so group-based rules such as the read-only demo behave the same locally.
        if (group != null) claims.claim("cognito:groups", List.of(group));
        String token = jwtEncoder.encode(JwtEncoderParameters.from(
                JwsHeader.with(MacAlgorithm.HS256).build(),
                claims.build()
        )).getTokenValue();

        return new LocalTokenResponse(token, "Bearer", expiresInSeconds);
    }

    record LocalTokenResponse(
            String accessToken,
            String tokenType,
            long expiresInSeconds
    ) {
    }
}

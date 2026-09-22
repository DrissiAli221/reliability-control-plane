package dev.ali.rcp.identity;

import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.Jwt;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

class CognitoAccessTokenValidatorTest {

    private final CognitoAccessTokenValidator validator =
            new CognitoAccessTokenValidator("dashboard-client-123");

    @Test
    void acceptsAccessTokenForConfiguredClient() {
        assertThat(validator.validate(jwt("access", "dashboard-client-123")).hasErrors())
                .isFalse();
    }

    @Test
    void rejectsAccessTokenForAnotherClient() {
        assertThat(validator.validate(jwt("access", "another-client")).hasErrors())
                .isTrue();
    }

    @Test
    void rejectsIdTokenEvenWhenAudienceClientWouldMatch() {
        assertThat(validator.validate(jwt("id", "dashboard-client-123")).hasErrors())
                .isTrue();
    }

    @Test
    void rejectsTokenMissingCognitoUsageClaims() {
        Jwt jwt = Jwt.withTokenValue("token")
                .header("alg", "RS256")
                .subject("operator-123")
                .issuedAt(Instant.now())
                .expiresAt(Instant.now().plusSeconds(300))
                .build();

        assertThat(validator.validate(jwt).hasErrors()).isTrue();
    }

    private Jwt jwt(String tokenUse, String clientId) {
        return Jwt.withTokenValue("token")
                .header("alg", "RS256")
                .subject("operator-123")
                .claim("token_use", tokenUse)
                .claim("client_id", clientId)
                .issuedAt(Instant.now())
                .expiresAt(Instant.now().plusSeconds(300))
                .build();
    }
}

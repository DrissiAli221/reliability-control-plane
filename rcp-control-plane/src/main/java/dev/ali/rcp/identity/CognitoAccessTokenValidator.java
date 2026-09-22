package dev.ali.rcp.identity;

import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jwt.Jwt;

import java.util.Objects;

final class CognitoAccessTokenValidator implements OAuth2TokenValidator<Jwt> {

    private static final OAuth2Error INVALID_TOKEN = new OAuth2Error(
            "invalid_token",
            "Token must be a Cognito access token issued for the configured dashboard client",
            null
    );

    private final String expectedClientId;

    CognitoAccessTokenValidator(String expectedClientId) {
        this.expectedClientId = Objects.requireNonNull(expectedClientId, "expectedClientId must not be null");
    }

    @Override
    public OAuth2TokenValidatorResult validate(Jwt jwt) {
        boolean isAccessToken = "access".equals(jwt.getClaimAsString("token_use"));
        boolean hasExpectedClient = expectedClientId.equals(jwt.getClaimAsString("client_id"));

        return isAccessToken && hasExpectedClient
                ? OAuth2TokenValidatorResult.success()
                : OAuth2TokenValidatorResult.failure(INVALID_TOKEN);
    }
}

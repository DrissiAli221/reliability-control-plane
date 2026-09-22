package dev.ali.rcp.identity;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;

@Configuration
@Profile("!local")
@ConditionalOnProperty(prefix = "rcp.identity", name = {"issuer-uri", "client-id"})
class CognitoJwtConfiguration {

    @Bean
    JwtDecoder cognitoJwtDecoder(
            @Value("${rcp.identity.issuer-uri}") String issuerUri,
            @Value("${rcp.identity.client-id}") String clientId
    ) {
        String normalizedIssuer = issuerUri.endsWith("/")
                ? issuerUri.substring(0, issuerUri.length() - 1)
                : issuerUri;
        NimbusJwtDecoder decoder = NimbusJwtDecoder
                .withJwkSetUri(normalizedIssuer + "/.well-known/jwks.json")
                .build();
        decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<Jwt>(
                JwtValidators.createDefaultWithIssuer(normalizedIssuer),
                new CognitoAccessTokenValidator(clientId)
        ));
        return decoder;
    }
}

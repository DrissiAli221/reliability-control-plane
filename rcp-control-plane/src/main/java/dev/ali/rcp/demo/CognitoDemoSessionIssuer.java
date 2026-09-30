package dev.ali.rcp.demo;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.cognitoidentityprovider.CognitoIdentityProviderClient;
import software.amazon.awssdk.services.cognitoidentityprovider.model.AdminInitiateAuthRequest;
import software.amazon.awssdk.services.cognitoidentityprovider.model.AuthFlowType;
import software.amazon.awssdk.services.cognitoidentityprovider.model.AuthenticationResultType;

import java.net.URI;
import java.util.Map;
import java.util.Objects;

/**
 * Signs in as the demo user on the server with AdminInitiateAuth, so the demo password never reaches a browser.
 * The pool and region come from the same issuer URI the resource server trusts, so the tokens always verify.
 */
@Component
@Profile("!local")
@ConditionalOnProperty(prefix = "rcp.demo", name = {"username", "password"})
class CognitoDemoSessionIssuer implements DemoSessionIssuer, AutoCloseable {
    private final CognitoIdentityProviderClient cognito;
    private final String userPoolId;
    private final String clientId;
    private final String username;
    private final String password;

    CognitoDemoSessionIssuer(
            @Value("${rcp.identity.issuer-uri}") String issuerUri,
            @Value("${rcp.identity.client-id}") String clientId,
            @Value("${rcp.demo.username}") String username,
            @Value("${rcp.demo.password}") String password
    ) {
        this(clientFor(issuerUri), issuerUri, clientId, username, password);
    }

    CognitoDemoSessionIssuer(CognitoIdentityProviderClient cognito, String issuerUri, String clientId, String username, String password) {
        this.cognito = Objects.requireNonNull(cognito);
        this.userPoolId = userPoolId(issuerUri);
        this.clientId = Objects.requireNonNull(clientId);
        this.username = Objects.requireNonNull(username);
        this.password = Objects.requireNonNull(password);
    }

    @Override
    public DemoSession issue() {
        AuthenticationResultType result = cognito.adminInitiateAuth(AdminInitiateAuthRequest.builder()
                .userPoolId(userPoolId)
                .clientId(clientId)
                .authFlow(AuthFlowType.ADMIN_USER_PASSWORD_AUTH)
                .authParameters(Map.of("USERNAME", username, "PASSWORD", password))
                .build()).authenticationResult();
        if (result == null) {
            throw new IllegalStateException("Cognito asked for a challenge; the demo user must not require MFA or a password change");
        }
        return new DemoSession(result.accessToken(), result.idToken(), result.expiresIn());
    }

    /** https://cognito-idp.eu-west-1.amazonaws.com/eu-west-1_AbC123 → eu-west-1_AbC123 */
    static String userPoolId(String issuerUri) {
        String path = URI.create(issuerUri.endsWith("/") ? issuerUri.substring(0, issuerUri.length() - 1) : issuerUri).getPath();
        return path.substring(path.lastIndexOf('/') + 1);
    }

    static Region region(String issuerUri) {
        String host = URI.create(issuerUri).getHost();
        return Region.of(host.substring("cognito-idp.".length(), host.indexOf(".amazonaws.com")));
    }

    private static CognitoIdentityProviderClient clientFor(String issuerUri) {
        return CognitoIdentityProviderClient.builder().region(region(issuerUri)).build();
    }

    @Override
    public void close() {
        cognito.close();
    }
}

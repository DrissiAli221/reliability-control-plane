package dev.ali.rcp.demo;

import org.junit.jupiter.api.Test;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.cognitoidentityprovider.CognitoIdentityProviderClient;
import software.amazon.awssdk.services.cognitoidentityprovider.model.AdminInitiateAuthRequest;
import software.amazon.awssdk.services.cognitoidentityprovider.model.AdminInitiateAuthResponse;
import software.amazon.awssdk.services.cognitoidentityprovider.model.AuthFlowType;
import software.amazon.awssdk.services.cognitoidentityprovider.model.AuthenticationResultType;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class CognitoDemoSessionIssuerTest {
    private static final String ISSUER = "https://cognito-idp.eu-west-1.amazonaws.com/eu-west-1_AbC123";

    @Test
    void derivesThePoolAndRegionFromTheTrustedIssuer() {
        assertThat(CognitoDemoSessionIssuer.userPoolId(ISSUER)).isEqualTo("eu-west-1_AbC123");
        assertThat(CognitoDemoSessionIssuer.userPoolId(ISSUER + "/")).isEqualTo("eu-west-1_AbC123");
        assertThat(CognitoDemoSessionIssuer.region(ISSUER)).isEqualTo(Region.EU_WEST_1);
    }

    @Test
    void signsInServerSideWithoutReturningARefreshToken() {
        CognitoIdentityProviderClient cognito = mock(CognitoIdentityProviderClient.class);
        when(cognito.adminInitiateAuth(any(AdminInitiateAuthRequest.class))).thenReturn(AdminInitiateAuthResponse.builder()
                .authenticationResult(AuthenticationResultType.builder()
                        .accessToken("access").idToken("id").refreshToken("refresh").expiresIn(3600).build())
                .build());

        DemoSession session = new CognitoDemoSessionIssuer(cognito, ISSUER, "client", "demo@example.com", "secret").issue();

        assertThat(session).isEqualTo(new DemoSession("access", "id", 3600));
        verify(cognito).adminInitiateAuth(AdminInitiateAuthRequest.builder()
                .userPoolId("eu-west-1_AbC123").clientId("client").authFlow(AuthFlowType.ADMIN_USER_PASSWORD_AUTH)
                .authParameters(java.util.Map.of("USERNAME", "demo@example.com", "PASSWORD", "secret")).build());
    }

    @Test
    void refusesToHandOutAChallengeInsteadOfTokens() {
        CognitoIdentityProviderClient cognito = mock(CognitoIdentityProviderClient.class);
        when(cognito.adminInitiateAuth(any(AdminInitiateAuthRequest.class))).thenReturn(AdminInitiateAuthResponse.builder().challengeName("NEW_PASSWORD_REQUIRED").build());

        assertThatThrownBy(() -> new CognitoDemoSessionIssuer(cognito, ISSUER, "client", "demo", "secret").issue())
                .isInstanceOf(IllegalStateException.class);
    }
}

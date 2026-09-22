package dev.ali.rcp.identity;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThatCode;

class CognitoJwtConfigurationTest {

    @Test
    void createsDecoderWithoutCallingCognitoDiscovery() {
        CognitoJwtConfiguration configuration = new CognitoJwtConfiguration();

        assertThatCode(() -> configuration.cognitoJwtDecoder(
                "https://cognito-idp.eu-west-1.amazonaws.com/eu-west-1_example/",
                "dashboard-client-123"
        )).doesNotThrowAnyException();
    }
}

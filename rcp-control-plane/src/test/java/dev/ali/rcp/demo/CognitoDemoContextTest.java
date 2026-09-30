package dev.ali.rcp.demo;

import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.core.env.MapPropertySource;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The other demo tests run under the local profile and never let Spring build this issuer, so a wiring mistake
 * only showed up when the aws profile started. Builds the SDK client but never calls Cognito.
 */
class CognitoDemoContextTest {
    @Test
    void springBuildsTheIssuerWhenDemoCredentialsAreConfigured() {
        try (var context = new AnnotationConfigApplicationContext()) {
            context.getEnvironment().setActiveProfiles("aws");
            context.getEnvironment().getPropertySources().addFirst(new MapPropertySource("demo", Map.of(
                    "rcp.identity.issuer-uri", "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_TestPool",
                    "rcp.identity.client-id", "test-client",
                    "rcp.demo.username", "demo@example.invalid",
                    "rcp.demo.password", "not-a-real-password"
            )));
            context.register(CognitoDemoSessionIssuer.class);
            context.refresh();

            assertThat(context.getBean(DemoSessionIssuer.class)).isInstanceOf(CognitoDemoSessionIssuer.class);
        }
    }
}

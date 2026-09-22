package dev.ali.rcp.identity;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class SecurityConfigurationTest {

    private final SecurityConfiguration configuration = new SecurityConfiguration();

    @Test
    void allowsOnlyAnExplicitDashboardOriginForApiRequests() {
        CorsConfiguration cors = apiConfiguration(List.of("https://dashboard.example.test"));

        assertThat(cors.checkOrigin("https://dashboard.example.test"))
                .isEqualTo("https://dashboard.example.test");
        assertThat(cors.checkOrigin("https://attacker.example"))
                .isNull();
        assertThat(cors.getAllowedOrigins()).doesNotContain("*");
        assertThat(cors.getAllowCredentials()).isFalse();
    }

    @Test
    void rejectsCrossOriginApiCallsWhenNoOriginIsConfigured() {
        CorsConfiguration cors = apiConfiguration(List.of(""));

        assertThat(cors.checkOrigin("https://dashboard.example.test")).isNull();
    }

    @Test
    void doesNotApplyApiPolicyToUnrelatedPaths() {
        CorsConfigurationSource source = configuration.corsConfigurationSource(
                List.of("https://dashboard.example.test")
        );
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/actuator/health");

        assertThat(source.getCorsConfiguration(request)).isNull();
    }

    private CorsConfiguration apiConfiguration(List<String> origins) {
        CorsConfigurationSource source = configuration.corsConfigurationSource(origins);
        MockHttpServletRequest request = new MockHttpServletRequest("OPTIONS", "/api/monitors");
        CorsConfiguration cors = source.getCorsConfiguration(request);
        assertThat(cors).isNotNull();
        return cors;
    }
}

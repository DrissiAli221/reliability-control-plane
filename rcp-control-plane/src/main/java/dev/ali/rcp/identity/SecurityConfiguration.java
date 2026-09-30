package dev.ali.rcp.identity;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.core.annotation.Order;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.List;

@Configuration
public class SecurityConfiguration {

    @Bean
    @Order(2)
    SecurityFilterChain securityFilterChain(
            HttpSecurity http,
            ReadOnlyAccess readOnlyAccess
    ) throws Exception {
        http
                .csrf(csrf -> csrf.disable())
                .cors(Customizer.withDefaults())
                .sessionManagement(session -> session
                        .sessionCreationPolicy(
                                SessionCreationPolicy.STATELESS
                        )
                )
                .authorizeHttpRequests(authorize -> authorize
                        .requestMatchers(
                                HttpMethod.GET,
                                "/actuator/health",
                                "/actuator/health/readiness",
                                "/actuator/health/liveness",
                                "/status/**"
                        ).permitAll()
                        // "Try the live demo" is how an anonymous visitor gets a (read-only) session in the first place.
                        .requestMatchers(HttpMethod.POST, "/api/demo/session").permitAll()
                        // Reads stay open to every signed-in caller; changes are refused for the read-only group.
                        .requestMatchers(HttpMethod.POST, "/api/**").access(readOnlyAccess.writable())
                        .requestMatchers(HttpMethod.PUT, "/api/**").access(readOnlyAccess.writable())
                        .requestMatchers(HttpMethod.PATCH, "/api/**").access(readOnlyAccess.writable())
                        .requestMatchers(HttpMethod.DELETE, "/api/**").access(readOnlyAccess.writable())
                        .anyRequest().authenticated()
                )
                .exceptionHandling(exceptions -> exceptions.accessDeniedHandler((request, response, denied) -> {
                    response.setStatus(403);
                    response.setContentType("application/problem+json");
                    response.getWriter().write("""
                            {"type":"about:blank","title":"Read-only account","status":403,\
                            "detail":"This demo account can look at everything but cannot change anything. \
                            Create your own account to add monitors."}""");
                }))
                .oauth2ResourceServer(resourceServer ->
                        resourceServer.jwt(Customizer.withDefaults())
                );

        return http.build();
    }

    @Bean
    CorsConfigurationSource corsConfigurationSource(
            @Value("${rcp.identity.allowed-origins:}") List<String> configuredOrigins
    ) {
        List<String> allowedOrigins = configuredOrigins.stream()
                .map(String::trim)
                .filter(origin -> !origin.isEmpty())
                .toList();

        CorsConfiguration configuration = new CorsConfiguration();
        configuration.setAllowedOrigins(allowedOrigins);
        configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        configuration.setAllowedHeaders(List.of("Authorization", "Content-Type", "Accept"));
        configuration.setExposedHeaders(List.of("Location"));
        configuration.setAllowCredentials(false);
        configuration.setMaxAge(3_600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/**", configuration);
        source.registerCorsConfiguration("/status/**", configuration);
        return source;
    }
}

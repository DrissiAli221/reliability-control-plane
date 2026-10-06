package dev.ali.rcp.identity;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;

/**
 * With a separate management port (management.server.port), metrics are scraped there without a token. Actuator
 * endpoints then exist only on that port, which is reachable inside the deployment's private network and never
 * through the public reverse proxy; on the public port the same path does not exist. The public API keeps requiring
 * sign-in for everything except its documented open routes.
 */
@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty("management.server.port")
class InternalMetricsSecurityConfiguration {

    // Ahead of the API chain (order 2), which matches every request and would otherwise ask for a token.
    @Bean
    @Order(1)
    SecurityFilterChain internalMetricsSecurityFilterChain(HttpSecurity http) throws Exception {
        return http
                .securityMatcher("/actuator/prometheus")
                .authorizeHttpRequests(authorize -> authorize.anyRequest().permitAll())
                .csrf(csrf -> csrf.disable())
                .build();
    }
}

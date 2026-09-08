package dev.ali.rcp.identity.local;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.core.annotation.Order;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;

@Profile("local")
@Configuration(proxyBeanMethods = false)
public class LocalMetricsSecurityConfiguration {

    @Bean
    @Order(1)
    SecurityFilterChain localPrometheusSecurityFilterChain(HttpSecurity http) throws Exception {
        return http
                .securityMatcher("/actuator/prometheus")
                .authorizeHttpRequests(authorize -> authorize.anyRequest().permitAll())
                .csrf(csrf -> csrf.disable())
                .build();
    }
}

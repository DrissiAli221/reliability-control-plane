package dev.ali.rcp.identity;

import org.springframework.boot.autoconfigure.condition.ConditionOutcome;
import org.springframework.boot.autoconfigure.condition.SpringBootCondition;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.ConditionContext;
import org.springframework.context.annotation.Conditional;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.core.annotation.Order;
import org.springframework.core.env.Environment;
import org.springframework.core.type.AnnotatedTypeMetadata;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;

/**
 * With a genuinely separate management port, metrics are scraped there without a token. Actuator endpoints then
 * exist only on that port, which is reachable inside the deployment's private network and never through the public
 * reverse proxy; on the API port the same path does not exist. If the management port equals the API port, this
 * stays off and metrics keep requiring sign-in. The local profile opens metrics through its own rule instead.
 */
@Configuration(proxyBeanMethods = false)
@Profile("!local")
@Conditional(InternalMetricsSecurityConfiguration.SeparateManagementPort.class)
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

    /** Matches only when management.server.port is set and differs from the API port (0 means "any free port"). */
    static final class SeparateManagementPort extends SpringBootCondition {
        static final int DEFAULT_SERVER_PORT = 8080;

        @Override
        public ConditionOutcome getMatchOutcome(ConditionContext context, AnnotatedTypeMetadata metadata) {
            return separate(context.getEnvironment())
                    ? ConditionOutcome.match("management.server.port is a separate port")
                    : ConditionOutcome.noMatch("management.server.port is unset, disabled or the API port");
        }

        static boolean separate(Environment environment) {
            Integer management = environment.getProperty("management.server.port", Integer.class);
            if (management == null || management < 0) return false;
            if (management == 0) return true;
            return management.intValue() != environment.getProperty("server.port", Integer.class, DEFAULT_SERVER_PORT);
        }
    }
}

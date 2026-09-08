package dev.ali.rcp.identity.local;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.context.annotation.Profile;
import org.springframework.core.annotation.Order;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.security.web.SecurityFilterChain;

import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import java.util.Base64;

@Profile("local")
@Configuration(proxyBeanMethods = false)
public class LocalIdentityConfiguration {

    @Bean
    SecretKey localJwtKey(@Value("${rcp.local-identity.secret}") String encodedSecret) {
        byte[] keyBytes;
        try {
            keyBytes = Base64.getDecoder().decode(encodedSecret);
        } catch (IllegalArgumentException exception) {
            throw new IllegalStateException("RCP_LOCAL_JWT_SECRET must be valid Base64", exception);
        }
        if (keyBytes.length < 32) {
            throw new IllegalStateException("RCP_LOCAL_JWT_SECRET must decode to at least 32 bytes");
        }
        return new SecretKeySpec(keyBytes, "HmacSHA256");
    }

    @Bean
    @Primary
    JwtDecoder localJwtDecoder(SecretKey localJwtKey) {
        return NimbusJwtDecoder.withSecretKey(localJwtKey)
                .macAlgorithm(MacAlgorithm.HS256)
                .build();
    }

    @Bean
    JwtEncoder localJwtEncoder(SecretKey localJwtKey) {
        return NimbusJwtEncoder.withSecretKey(localJwtKey)
                .algorithm(MacAlgorithm.HS256)
                .build();
    }

    @Bean
    @Order(1)
    SecurityFilterChain localTokenSecurityFilterChain(HttpSecurity http) throws Exception {
        return http
                .securityMatcher("/local/**")
                .csrf(csrf -> csrf.disable())
                .authorizeHttpRequests(authorize -> authorize.anyRequest().permitAll())
                .build();
    }
}

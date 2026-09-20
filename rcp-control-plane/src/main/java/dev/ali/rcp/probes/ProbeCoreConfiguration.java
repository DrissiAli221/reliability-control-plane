package dev.ali.rcp.probes;

import dev.ali.rcp.monitors.SafeTargetPolicy;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import tools.jackson.databind.ObjectMapper;

@Configuration(proxyBeanMethods = false)
class ProbeCoreConfiguration {

    @Bean
    SafeTargetPolicy safeTargetPolicy() {
        return new SafeTargetPolicy();
    }

    @Bean
    ProbeMessageCodec probeMessageCodec(ObjectMapper objectMapper) {
        return new ProbeMessageCodec(objectMapper);
    }
}

package dev.ali.rcp;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
class HealthProbeApiTest {
    @Autowired MockMvc mockMvc;

    @Test
    void albReadinessPathIsReachableWithoutUserToken() throws Exception {
        mockMvc.perform(get("/actuator/health/readiness"))
                .andExpect(status().isOk());
        mockMvc.perform(get("/actuator/health/liveness"))
                .andExpect(status().isOk());
        mockMvc.perform(get("/actuator/health/db"))
                .andExpect(status().isUnauthorized());
    }
}

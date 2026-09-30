package dev.ali.rcp;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
class DemoUnavailableApiTest {
    @Autowired MockMvc mockMvc;

    @Test
    void aDeploymentWithoutDemoCredentialsSaysSoInsteadOfRequiringSignIn() throws Exception {
        mockMvc.perform(post("/api/demo/session"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.title").value("Demo unavailable"));
    }
}

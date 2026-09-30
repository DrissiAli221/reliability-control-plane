package dev.ali.rcp;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.ObjectMapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ActiveProfiles("local")
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = {
        "rcp.runtime.enabled=false",
        "rcp.local-worker.enabled=false",
        "rcp.local-identity.secret=bG9jYWwtdGVzdC1rZXktMzItYnl0ZXMtbWluaW11bS1sZW5ndGghISE="
})
@AutoConfigureMockMvc
class DemoSessionApiTest {
    @Autowired MockMvc mockMvc;
    @Autowired ObjectMapper objectMapper;

    @Test
    void anAnonymousVisitorBecomesTheReadOnlyDemoAccount() throws Exception {
        String body = mockMvc.perform(post("/api/demo/session"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.expiresInSeconds").value(3600))
                .andReturn().getResponse().getContentAsString();
        String token = objectMapper.readTree(body).get("accessToken").asText();

        mockMvc.perform(get("/api/me").header("Authorization", "Bearer " + token))
                .andExpect(jsonPath("$.subject").value("local-demo"))
                .andExpect(jsonPath("$.readOnly").value(true));
        mockMvc.perform(post("/api/monitors").header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"Blocked","targetUrl":"https://1.1.1.1","checkIntervalSeconds":60,"timeoutMs":5000}
                                """))
                .andExpect(status().isForbidden());
    }

    @Test
    void demoSignInsAreRateLimitedAcrossTheDeployment() throws Exception {
        int limitedAt = -1;
        for (int attempt = 1; attempt <= 40 && limitedAt < 0; attempt++) {
            if (mockMvc.perform(post("/api/demo/session")).andReturn().getResponse().getStatus() == 429) limitedAt = attempt;
        }
        assertThat(limitedAt).isBetween(1, 31);
    }
}

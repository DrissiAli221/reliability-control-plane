package dev.ali.rcp;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ActiveProfiles("local")
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = {
        "rcp.runtime.enabled=false",
        "rcp.local-worker.enabled=false",
        "rcp.local-identity.secret=bG9jYWwtdGVzdC1rZXktMzItYnl0ZXMtbWluaW11bS1sZW5ndGghISE="
})
@AutoConfigureMockMvc
class LocalIdentityTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    void localProfileIssuesARealJwtAcceptedByTheResourceServer() throws Exception {
        String tokenResponse = mockMvc.perform(post("/local/token"))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString();
        JsonNode body = objectMapper.readTree(tokenResponse);
        String accessToken = body.get("accessToken").asText();

        mockMvc.perform(post("/api/monitors")
                        .header("Authorization", "Bearer " + accessToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "name": "Local identity proof",
                                  "targetUrl": "https://1.1.1.1",
                                  "checkIntervalSeconds": 60,
                                  "timeoutMs": 5000
                                }
                                """))
                .andExpect(status().isCreated());
    }
}

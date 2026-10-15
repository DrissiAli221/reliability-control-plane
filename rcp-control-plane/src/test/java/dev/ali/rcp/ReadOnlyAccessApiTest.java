package dev.ali.rcp;

import tools.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = {"rcp.monitors.min-interval-seconds=60", "rcp.monitors.max-timeout-ms=5000", "rcp.monitors.max-per-owner=3"})
@AutoConfigureMockMvc
@Transactional
class ReadOnlyAccessApiTest {
    private static final String BODY = """
            {"name":"Portfolio","targetUrl":"https://1.1.1.1","checkIntervalSeconds":60,"timeoutMs":5000}
            """;

    @Autowired MockMvc mockMvc;
    @Autowired ObjectMapper objectMapper;

    private static RequestPostProcessor demo(String subject) {
        return jwt().jwt(token -> token.subject(subject).claim("cognito:groups", List.of("demo")));
    }

    @Test
    void theDemoGroupCanReadButNotChangeAnything() throws Exception {
        String subject = UUID.randomUUID().toString();

        mockMvc.perform(patch("/api/monitors/{id}",UUID.randomUUID()).with(demo(subject)).contentType(MediaType.APPLICATION_JSON).content("{\"acceptedHttpStatuses\":[403]}")).andExpect(status().isForbidden());
        mockMvc.perform(delete("/api/monitors/{id}", UUID.randomUUID()).with(demo(subject))).andExpect(status().isForbidden());
        mockMvc.perform(get("/api/monitors").with(demo(subject))).andExpect(status().isOk());
        mockMvc.perform(get("/api/pipeline").with(demo(subject))).andExpect(status().isOk());
        mockMvc.perform(post("/api/monitors").with(demo(subject)).contentType(MediaType.APPLICATION_JSON).content(BODY))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.title").value("Read-only account"));
        mockMvc.perform(patch("/api/monitors/{id}/enabled", UUID.randomUUID()).with(demo(subject))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"enabled\":false}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void otherGroupsAndPlainAccountsStillWrite() throws Exception {
        mockMvc.perform(post("/api/monitors")
                        .with(jwt().jwt(token -> token.subject(UUID.randomUUID().toString()).claim("cognito:groups", List.of("operators"))))
                        .contentType(MediaType.APPLICATION_JSON).content(BODY))
                .andExpect(status().isCreated());
        mockMvc.perform(post("/api/monitors").with(jwt().jwt(token -> token.subject(UUID.randomUUID().toString())))
                        .contentType(MediaType.APPLICATION_JSON).content(BODY))
                .andExpect(status().isCreated());
    }

    @Test
    void anonymousWritesAreStillUnauthenticatedNotForbidden() throws Exception {
        mockMvc.perform(post("/api/monitors").contentType(MediaType.APPLICATION_JSON).content(BODY))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void meDescribesTheSessionAndTheDeploymentLimits() throws Exception {
        mockMvc.perform(get("/api/me").with(demo("demo-subject")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.subject").value("demo-subject"))
                .andExpect(jsonPath("$.readOnly").value(true))
                .andExpect(jsonPath("$.limits.minIntervalSeconds").value(60))
                .andExpect(jsonPath("$.limits.maxTimeoutMs").value(5000))
                .andExpect(jsonPath("$.limits.maxPerOwner").value(3))
                .andExpect(jsonPath("$.usage.ownedMonitors").isNumber())
                .andExpect(jsonPath("$.usage.totalMonitors").isNumber());
        mockMvc.perform(get("/api/me").with(jwt().jwt(token -> token.subject("someone"))))
                .andExpect(jsonPath("$.readOnly").value(false));
    }

    @Test
    void meReportsLiveUsageThatIgnoresDeletedMonitorsAndScopesOwnedToTheCaller() throws Exception {
        String subject = UUID.randomUUID().toString();
        RequestPostProcessor me = jwt().jwt(token -> token.subject(subject));
        long totalBefore = objectMapper.readTree(mockMvc.perform(get("/api/me").with(me)).andReturn().getResponse().getContentAsString())
                .at("/usage/totalMonitors").asLong();
        String first = objectMapper.readTree(mockMvc.perform(post("/api/monitors").with(me).contentType(MediaType.APPLICATION_JSON).content(BODY))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asText();
        mockMvc.perform(post("/api/monitors").with(me).contentType(MediaType.APPLICATION_JSON).content(BODY)).andExpect(status().isCreated());
        mockMvc.perform(post("/api/monitors").with(jwt().jwt(token -> token.subject(UUID.randomUUID().toString())))
                .contentType(MediaType.APPLICATION_JSON).content(BODY)).andExpect(status().isCreated());

        mockMvc.perform(get("/api/me").with(me))
                .andExpect(jsonPath("$.usage.ownedMonitors").value(2))
                .andExpect(jsonPath("$.usage.totalMonitors").value(totalBefore + 3));

        mockMvc.perform(delete("/api/monitors/{id}", first).with(me)).andExpect(status().isNoContent());
        mockMvc.perform(get("/api/me").with(me))
                .andExpect(jsonPath("$.usage.ownedMonitors").value(1))
                .andExpect(jsonPath("$.usage.totalMonitors").value(totalBefore + 2));
    }
}

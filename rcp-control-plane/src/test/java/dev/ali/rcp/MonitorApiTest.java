package dev.ali.rcp;

import dev.ali.rcp.monitors.MonitorRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class MonitorApiTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private MonitorRepository monitorRepository;

    @Test
    void authenticatedOwnerCanCreateMonitor() throws Exception {
        mockMvc.perform(post("/api/monitors")
                        .with(jwt().jwt(jwt ->
                                jwt.subject("ali-subject")
                        ))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "name": "Portfolio",
                                  "targetUrl": "https://1.1.1.1",
                                  "checkIntervalSeconds": 60,
                                  "timeoutMs": 5000
                                }
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.name").value("Portfolio"))
                .andExpect(jsonPath("$.targetUrl")
                        .value("https://1.1.1.1/"))
                .andExpect(jsonPath("$.enabled").value(true));

        assertThat(monitorRepository.findAll())
                .singleElement()
                .satisfies(monitor -> {
                    assertThat(monitor.getOwnerSubject())
                            .isEqualTo("ali-subject");
                    assertThat(monitor.getName())
                            .isEqualTo("Portfolio");
                });
    }

    @Test
    void unauthenticatedUserCannotCreateMonitor() throws Exception {
        mockMvc.perform(post("/api/monitors")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "name": "Portfolio",
                                  "targetUrl": "https://1.1.1.1",
                                  "checkIntervalSeconds": 60,
                                  "timeoutMs": 5000
                                }
                                """))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void privateTargetIsRejected() throws Exception {
        mockMvc.perform(post("/api/monitors")
                        .with(jwt().jwt(jwt ->
                                jwt.subject("ali-subject")
                        ))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "name": "Internal service",
                                  "targetUrl": "http://127.0.0.1",
                                  "checkIntervalSeconds": 60,
                                  "timeoutMs": 5000
                                }
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.title")
                        .value("Unsafe monitoring target"));

        assertThat(monitorRepository.count()).isZero();
    }

    @Test
    void targetQueryIsRejectedBeforePersistence() throws Exception {
        mockMvc.perform(post("/api/monitors")
                        .with(jwt().jwt(jwt -> jwt.subject("ali-subject")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "name": "Secret-bearing URL",
                                  "targetUrl": "https://1.1.1.1/health?token=secret",
                                  "checkIntervalSeconds": 60,
                                  "timeoutMs": 5000
                                }
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.title").value("Unsafe monitoring target"));

        assertThat(monitorRepository.count()).isZero();
    }

    @Test
    void createdResourceLocationIsReadableOnlyByItsOwner() throws Exception {
        var created = mockMvc.perform(post("/api/monitors")
                        .with(jwt().jwt(jwt -> jwt.subject("ali-subject")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "name": "Readable monitor",
                                  "targetUrl": "https://1.1.1.1/",
                                  "checkIntervalSeconds": 60,
                                  "timeoutMs": 5000
                                }
                                """))
                .andExpect(status().isCreated())
                .andReturn();

        String location = created.getResponse().getHeader("Location");
        assertThat(location).startsWith("/api/monitors/");

        mockMvc.perform(get(location).with(jwt().jwt(jwt -> jwt.subject("ali-subject"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Readable monitor"));
        mockMvc.perform(get(location).with(jwt().jwt(jwt -> jwt.subject("other-subject"))))
                .andExpect(status().isNotFound());
        mockMvc.perform(get(location)).andExpect(status().isUnauthorized());
    }
}

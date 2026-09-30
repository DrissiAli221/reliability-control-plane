package dev.ali.rcp;

import dev.ali.rcp.monitors.MonitorQueryService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "rcp.demo.example-monitor-url=https://1.1.1.1")
@AutoConfigureMockMvc
@Transactional
class OnboardingApiTest {
    @Autowired MockMvc mockMvc;
    @Autowired MonitorQueryService monitors;

    @Test
    void aNewAccountGetsOneExampleMonitorExactlyOnce() throws Exception {
        String owner = UUID.randomUUID().toString();

        mockMvc.perform(post("/api/onboarding").with(jwt().jwt(token -> token.subject(owner)))).andExpect(status().isCreated());
        mockMvc.perform(post("/api/onboarding").with(jwt().jwt(token -> token.subject(owner)))).andExpect(status().isNoContent());

        assertThat(monitors.listForOwner(owner)).singleElement()
                .satisfies(monitor -> assertThat(monitor.name()).isEqualTo("Example"));
    }

    @Test
    void anAccountThatAlreadyHasMonitorsIsLeftAlone() throws Exception {
        String owner = UUID.randomUUID().toString();
        mockMvc.perform(post("/api/monitors").with(jwt().jwt(token -> token.subject(owner)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"Mine","targetUrl":"https://1.0.0.1","checkIntervalSeconds":60,"timeoutMs":5000}
                                """))
                .andExpect(status().isCreated());

        mockMvc.perform(post("/api/onboarding").with(jwt().jwt(token -> token.subject(owner)))).andExpect(status().isNoContent());

        assertThat(monitors.listForOwner(owner)).extracting(monitor -> monitor.name()).containsExactly("Mine");
    }

    @Test
    void theReadOnlyDemoAccountIsNotOnboarded() throws Exception {
        mockMvc.perform(post("/api/onboarding").with(jwt().jwt(token -> token.subject("demo").claim("cognito:groups", List.of("demo")))))
                .andExpect(status().isForbidden());
    }
}

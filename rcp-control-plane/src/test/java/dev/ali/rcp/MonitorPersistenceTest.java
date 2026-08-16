package dev.ali.rcp;

import dev.ali.rcp.monitors.Monitor;
import dev.ali.rcp.monitors.MonitorRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
@Transactional
class MonitorPersistenceTest {

    @Autowired
    private MonitorRepository monitorRepository;

    @Test
    void savesAndLoadsMonitor() {
        Instant now = Instant.parse("2026-08-16T12:00:00Z");

        Monitor monitor = Monitor.create(
                "ali-subject",
                "Portfolio",
                "https://example.com",
                60,
                5_000,
                now
        );

        Monitor saved = monitorRepository.saveAndFlush(monitor);
        Monitor loaded = monitorRepository.findById(saved.getId()).orElseThrow();

        assertThat(loaded.getName()).isEqualTo("Portfolio");
        assertThat(loaded.getTargetUrl()).isEqualTo("https://example.com");
        assertThat(loaded.isEnabled()).isTrue();
        assertThat(loaded.getNextCheckAt()).isEqualTo(now);
    }
}
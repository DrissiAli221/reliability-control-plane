package dev.ali.rcp;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.AnnotatedBeanDefinition;
import org.springframework.context.annotation.ClassPathScanningCandidateComponentProvider;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.support.PropertiesLoaderUtils;
import org.springframework.scheduling.annotation.Scheduled;

import java.io.IOException;
import java.util.Properties;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Every @Scheduled loop needs its own thread: with fewer, a loop that blocks (the 20 s SQS long poll) delays the
 * others. Spring's default pool is one thread, which once slowed the demo's 1 s loops to about one run every 6.5 s.
 */
class SchedulingPoolSizeTest {

    @Test
    void schedulerPoolHasAThreadForEveryScheduledLoop() throws IOException {
        Properties properties = PropertiesLoaderUtils.loadProperties(new ClassPathResource("application.properties"));
        int poolSize = Integer.parseInt(properties.getProperty("spring.task.scheduling.pool.size", "1"));

        assertThat(poolSize).isGreaterThanOrEqualTo(scheduledMethodCount());
    }

    private int scheduledMethodCount() {
        ClassPathScanningCandidateComponentProvider scanner = new ClassPathScanningCandidateComponentProvider(false) {
            @Override
            protected boolean isCandidateComponent(AnnotatedBeanDefinition definition) {
                return true;
            }
        };
        scanner.addIncludeFilter((reader, factory) ->
                reader.getAnnotationMetadata().hasAnnotatedMethods(Scheduled.class.getName()));
        int count = scanner.findCandidateComponents("dev.ali.rcp").stream()
                .map(definition -> (AnnotatedBeanDefinition) definition)
                .mapToInt(definition -> definition.getMetadata().getAnnotatedMethods(Scheduled.class.getName()).size())
                .sum();
        // Guards the scan itself: an empty result would make the assertion above pass vacuously.
        assertThat(count).isGreaterThanOrEqualTo(7);
        return count;
    }
}

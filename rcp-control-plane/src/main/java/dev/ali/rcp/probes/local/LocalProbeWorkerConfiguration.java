package dev.ali.rcp.probes.local;

import dev.ali.rcp.monitors.SafeTargetPolicy;
import dev.ali.rcp.probes.JdkProbeHttpClient;
import dev.ali.rcp.probes.ProbeEngine;
import dev.ali.rcp.probes.ProbeMessageCodec;
import dev.ali.rcp.probes.ProbeResultTransport;
import dev.ali.rcp.probes.ProbeWorker;
import dev.ali.rcp.probes.SafeTargetProbePolicy;
import dev.ali.rcp.probes.sqs.SqsProbeResultTransport;
import dev.ali.rcp.probes.sqs.SqsProbeWorkerPoller;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.sqs.SqsClient;

import java.time.Duration;
import java.util.List;

@Profile("local")
@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(LocalProbeWorkerProperties.class)
@ConditionalOnProperty(prefix = "rcp.local-worker", name = "enabled", havingValue = "true")
public class LocalProbeWorkerConfiguration {

    @Bean(destroyMethod = "close")
    SqsClient localWorkerSqsClient(LocalProbeWorkerProperties properties) {
        return SqsClient.builder()
                .region(Region.of(properties.getAwsRegion()))
                .endpointOverride(properties.getSqsEndpoint())
                .credentialsProvider(StaticCredentialsProvider.create(
                        AwsBasicCredentials.create("local", "local")
                ))
                .build();
    }

    @Bean
    LocalProbeWorkerLoops localProbeWorkerLoops(
            SqsClient localWorkerSqsClient,
            LocalProbeWorkerProperties properties,
            ProbeMessageCodec codec,
            SafeTargetPolicy safeTargetPolicy,
            LocalProbeFaults faults,
            MeterRegistry meterRegistry
    ) {
        ProbeEngine engine = new ProbeEngine(
                new SafeTargetProbePolicy(safeTargetPolicy),
                new FaultInjectingProbeHttpClient(
                        new JdkProbeHttpClient(Duration.ofSeconds(3)),
                        faults
                )
        );
        ProbeResultTransport resultTransport = new SqsProbeResultTransport(
                localWorkerSqsClient,
                properties.getResultQueueUrl()
        );

        List<SqsProbeWorkerPoller> pollers = properties.getJobQueueUrls().entrySet().stream()
                .sorted(java.util.Map.Entry.comparingByKey())
                .map(entry -> new SqsProbeWorkerPoller(
                        entry.getKey(),
                        localWorkerSqsClient,
                        entry.getValue(),
                        new ProbeWorker(entry.getKey(), codec, engine, resultTransport),
                        properties.getWaitTimeSeconds(),
                        properties.getVisibilityTimeoutSeconds()
                ))
                .toList();

        if (pollers.isEmpty()) {
            throw new IllegalStateException("at least one local worker queue must be configured");
        }
        return new LocalProbeWorkerLoops(pollers, meterRegistry);
    }
}

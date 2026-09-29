package dev.ali.rcp.scheduling.runtime;

import dev.ali.rcp.incidents.ExecutionFinalizer;
import dev.ali.rcp.incidents.IncidentProcessor;
import dev.ali.rcp.probes.ProbeResultIngestionService;
import dev.ali.rcp.probes.sqs.SqsProbeResultConsumer;
import dev.ali.rcp.scheduling.DueMonitorScheduler;
import dev.ali.rcp.scheduling.outbox.OutboxPublisher;
import dev.ali.rcp.scheduling.outbox.OutboxRepository;
import dev.ali.rcp.scheduling.outbox.ProbeJobTransport;
import dev.ali.rcp.scheduling.outbox.sqs.SqsProbeJobTransport;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.sqs.SqsClient;
import software.amazon.awssdk.services.sqs.SqsClientBuilder;

import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

@Configuration(proxyBeanMethods = false)
@EnableScheduling
@EnableConfigurationProperties(RcpRuntimeProperties.class)
@ConditionalOnProperty(prefix = "rcp.runtime", name = "enabled", havingValue = "true")
public class RcpRuntimeConfiguration {

    @Bean(destroyMethod = "close")
    SqsClient resultSqsClient(RcpRuntimeProperties properties) {
        return sqsClient(properties, properties.getProbeResultQueueRegion());
    }

    @Bean(destroyMethod = "close")
    RegionalSqsClients probeJobSqsClients(RcpRuntimeProperties properties) {
        Map<String, SqsClient> clients = properties.getProbeJobQueueUrls().keySet().stream()
                .collect(Collectors.toUnmodifiableMap(
                        Function.identity(),
                        region -> sqsClient(properties, region)
                ));
        return new RegionalSqsClients(clients);
    }

    private SqsClient sqsClient(RcpRuntimeProperties properties, String region) {
        SqsClientBuilder builder = SqsClient.builder()
                .region(Region.of(region));
        if (properties.getSqsEndpoint() != null) {
            builder.endpointOverride(properties.getSqsEndpoint())
                    .credentialsProvider(StaticCredentialsProvider.create(
                            AwsBasicCredentials.create("local", "local")
                    ));
        }
        return builder.build();
    }

    @Bean
    ProbeJobTransport probeJobTransport(RegionalSqsClients clients, RcpRuntimeProperties properties) {
        requireQueueForEveryScheduledRegion(properties.getProbeJobQueueUrls().keySet());
        return new SqsProbeJobTransport(clients.asMap(), properties.getProbeJobQueueUrls());
    }

    // A region mismatch would otherwise leave outbox events retrying forever and
    // every execution short of evidence, so refuse to start instead.
    static void requireQueueForEveryScheduledRegion(Set<String> configuredQueueRegions) {
        Set<String> scheduledRegions = DueMonitorScheduler.probeRegions();
        if (!scheduledRegions.equals(configuredQueueRegions)) {
            throw new IllegalStateException(
                    "Probe-job queue regions " + configuredQueueRegions
                            + " must match scheduled probe regions " + scheduledRegions
            );
        }
    }

    @Bean
    OutboxPublisher runtimeOutboxPublisher(
            OutboxRepository repository,
            ProbeJobTransport transport
    ) {
        return new OutboxPublisher(repository, transport);
    }

    @Bean
    SqsProbeResultConsumer probeResultConsumer(
            SqsClient resultSqsClient,
            RcpRuntimeProperties properties,
            ProbeResultIngestionService ingestionService
    ) {
        return new SqsProbeResultConsumer(
                resultSqsClient,
                properties.getProbeResultQueueUrl(),
                ingestionService,
                properties.getResultWaitTimeSeconds(),
                properties.getResultVisibilityTimeoutSeconds()
        );
    }

    @Bean
    ControlPlaneProcessingLoops controlPlaneProcessingLoops(
            DueMonitorScheduler scheduler,
            OutboxPublisher outboxPublisher,
            SqsProbeResultConsumer resultConsumer,
            ExecutionFinalizer finalizer,
            IncidentProcessor incidentProcessor,
            MeterRegistry meterRegistry
    ) {
        return new ControlPlaneProcessingLoops(
                scheduler,
                outboxPublisher,
                resultConsumer,
                finalizer,
                incidentProcessor,
                meterRegistry
        );
    }
}

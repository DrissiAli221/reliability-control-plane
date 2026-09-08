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

@Configuration(proxyBeanMethods = false)
@EnableScheduling
@EnableConfigurationProperties(RcpRuntimeProperties.class)
@ConditionalOnProperty(prefix = "rcp.runtime", name = "enabled", havingValue = "true")
public class RcpRuntimeConfiguration {

    @Bean
    SqsClient runtimeSqsClient(RcpRuntimeProperties properties) {
        SqsClientBuilder builder = SqsClient.builder()
                .region(Region.of(properties.getAwsRegion()));
        if (properties.getSqsEndpoint() != null) {
            builder.endpointOverride(properties.getSqsEndpoint())
                    .credentialsProvider(StaticCredentialsProvider.create(
                            AwsBasicCredentials.create("local", "local")
                    ));
        }
        return builder.build();
    }

    @Bean
    ProbeJobTransport probeJobTransport(SqsClient runtimeSqsClient, RcpRuntimeProperties properties) {
        return new SqsProbeJobTransport(runtimeSqsClient, properties.getProbeJobQueueUrls());
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
            SqsClient runtimeSqsClient,
            RcpRuntimeProperties properties,
            ProbeResultIngestionService ingestionService
    ) {
        return new SqsProbeResultConsumer(
                runtimeSqsClient,
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

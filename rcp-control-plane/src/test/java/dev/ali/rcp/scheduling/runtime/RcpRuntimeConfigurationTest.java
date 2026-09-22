package dev.ali.rcp.scheduling.runtime;

import org.junit.jupiter.api.Test;
import software.amazon.awssdk.services.sqs.SqsClient;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class RcpRuntimeConfigurationTest {

    @Test
    void buildsClientsInTheRegionsThatOwnTheirQueues() {
        RcpRuntimeProperties properties = new RcpRuntimeProperties();
        properties.setProbeResultQueueRegion("eu-west-1");
        properties.setProbeJobQueueUrls(Map.of(
                "eu-west-1", "https://sqs.eu-west-1.amazonaws.com/123/europe",
                "us-east-1", "https://sqs.us-east-1.amazonaws.com/123/virginia"
        ));
        RcpRuntimeConfiguration configuration = new RcpRuntimeConfiguration();

        try (SqsClient resultClient = configuration.resultSqsClient(properties);
             RegionalSqsClients jobClients = configuration.probeJobSqsClients(properties)) {
            assertThat(resultClient.serviceClientConfiguration().region().id())
                    .isEqualTo("eu-west-1");
            assertThat(jobClients.asMap())
                    .extractingByKeys("eu-west-1", "us-east-1")
                    .extracting(client -> client.serviceClientConfiguration().region().id())
                    .containsExactly("eu-west-1", "us-east-1");
        }
    }
}

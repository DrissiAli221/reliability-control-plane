package dev.ali.rcp;

import dev.ali.rcp.scheduling.outbox.sqs.SqsProbeJobTransport;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.sqs.SqsClient;
import software.amazon.awssdk.services.sqs.model.CreateQueueRequest;
import software.amazon.awssdk.services.sqs.model.Message;
import software.amazon.awssdk.services.sqs.model.ReceiveMessageRequest;

import java.net.URI;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

@Testcontainers
class ElasticMqProbeJobTransportTest {

    private static final String EUROPE = "eu-west-1";
    private static final String VIRGINIA = "us-east-1";

    @Container
    private static final GenericContainer<?> ELASTIC_MQ =
            new GenericContainer<>(
                    DockerImageName.parse(
                            "softwaremill/elasticmq-native:1.7.1"
                    )
            ).withExposedPorts(9324);

    private static SqsClient sqsClient;
    private static URI endpoint;
    private static Map<String, String> queueUrls;

    @BeforeAll
    static void createQueues() {
        endpoint = URI.create(
                "http://"
                        + ELASTIC_MQ.getHost()
                        + ":"
                        + ELASTIC_MQ.getMappedPort(9324)
        );

        sqsClient = SqsClient.builder()
                .endpointOverride(endpoint)
                .region(Region.US_EAST_1)
                .credentialsProvider(
                        StaticCredentialsProvider.create(
                                AwsBasicCredentials.create("test", "test")
                        )
                )
                .build();

        queueUrls = Map.of(
                EUROPE,
                createQueue("rcp-probe-jobs-eu-west-1"),
                VIRGINIA,
                createQueue("rcp-probe-jobs-us-east-1")
        );
    }

    @AfterAll
    static void closeClient() {
        if (sqsClient != null) {
            sqsClient.close();
        }
    }

    @Test
    void sendsPayloadToTheQueueConfiguredForItsRegion() {
        SqsProbeJobTransport transport = new SqsProbeJobTransport(
                sqsClient,
                queueUrls
        );

        transport.send(EUROPE, "{\"jobId\":\"job-123\"}");

        List<Message> messages = sqsClient.receiveMessage(
                ReceiveMessageRequest.builder()
                        .queueUrl(queueUrls.get(EUROPE))
                        .maxNumberOfMessages(1)
                        .waitTimeSeconds(1)
                        .build()
        ).messages();

        assertThat(messages)
                .singleElement()
                .extracting(Message::body)
                .isEqualTo("{\"jobId\":\"job-123\"}");

        assertThat(receiveFrom(VIRGINIA)).isEmpty();
    }

    private static String createQueue(String queueName) {
        String elasticMqQueueUrl = sqsClient.createQueue(
                CreateQueueRequest.builder()
                        .queueName(queueName)
                        .build()
        ).queueUrl();

        return endpoint.resolve(
                URI.create(elasticMqQueueUrl).getRawPath()
        ).toString();
    }

    private List<Message> receiveFrom(String region) {
        return sqsClient.receiveMessage(
                ReceiveMessageRequest.builder()
                        .queueUrl(queueUrls.get(region))
                        .maxNumberOfMessages(1)
                        .waitTimeSeconds(1)
                        .build()
        ).messages();
    }
}

package dev.ali.rcp.probes.local;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.net.URI;
import java.util.HashMap;
import java.util.Map;

@ConfigurationProperties("rcp.local-worker")
public class LocalProbeWorkerProperties {
    private String awsRegion = "us-east-1";
    private URI sqsEndpoint;
    private Map<String, String> jobQueueUrls = new HashMap<>();
    private String resultQueueUrl;
    private int waitTimeSeconds;
    private int visibilityTimeoutSeconds = 60;

    public String getAwsRegion() {
        return awsRegion;
    }

    public void setAwsRegion(String awsRegion) {
        this.awsRegion = awsRegion;
    }

    public URI getSqsEndpoint() {
        return sqsEndpoint;
    }

    public void setSqsEndpoint(URI sqsEndpoint) {
        this.sqsEndpoint = sqsEndpoint;
    }

    public Map<String, String> getJobQueueUrls() {
        return jobQueueUrls;
    }

    public void setJobQueueUrls(Map<String, String> jobQueueUrls) {
        this.jobQueueUrls = new HashMap<>(jobQueueUrls);
    }

    public String getResultQueueUrl() {
        return resultQueueUrl;
    }

    public void setResultQueueUrl(String resultQueueUrl) {
        this.resultQueueUrl = resultQueueUrl;
    }

    public int getWaitTimeSeconds() {
        return waitTimeSeconds;
    }

    public void setWaitTimeSeconds(int waitTimeSeconds) {
        this.waitTimeSeconds = waitTimeSeconds;
    }

    public int getVisibilityTimeoutSeconds() {
        return visibilityTimeoutSeconds;
    }

    public void setVisibilityTimeoutSeconds(int visibilityTimeoutSeconds) {
        this.visibilityTimeoutSeconds = visibilityTimeoutSeconds;
    }
}

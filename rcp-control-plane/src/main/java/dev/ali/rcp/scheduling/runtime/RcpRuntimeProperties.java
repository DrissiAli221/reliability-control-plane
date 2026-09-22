package dev.ali.rcp.scheduling.runtime;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.net.URI;
import java.util.HashMap;
import java.util.Map;

@ConfigurationProperties("rcp.runtime")
public class RcpRuntimeProperties {
    private String probeResultQueueRegion = "us-east-1";
    private URI sqsEndpoint;
    private Map<String, String> probeJobQueueUrls = new HashMap<>();
    private String probeResultQueueUrl;
    private int resultWaitTimeSeconds = 10;
    private int resultVisibilityTimeoutSeconds = 60;

    public String getProbeResultQueueRegion() {
        return probeResultQueueRegion;
    }

    public void setProbeResultQueueRegion(String probeResultQueueRegion) {
        this.probeResultQueueRegion = probeResultQueueRegion;
    }

    public URI getSqsEndpoint() {
        return sqsEndpoint;
    }

    public void setSqsEndpoint(URI sqsEndpoint) {
        this.sqsEndpoint = sqsEndpoint;
    }

    public Map<String, String> getProbeJobQueueUrls() {
        return probeJobQueueUrls;
    }

    public void setProbeJobQueueUrls(Map<String, String> probeJobQueueUrls) {
        this.probeJobQueueUrls = new HashMap<>(probeJobQueueUrls);
    }

    public String getProbeResultQueueUrl() {
        return probeResultQueueUrl;
    }

    public void setProbeResultQueueUrl(String probeResultQueueUrl) {
        this.probeResultQueueUrl = probeResultQueueUrl;
    }

    public int getResultWaitTimeSeconds() {
        return resultWaitTimeSeconds;
    }

    public void setResultWaitTimeSeconds(int resultWaitTimeSeconds) {
        this.resultWaitTimeSeconds = resultWaitTimeSeconds;
    }

    public int getResultVisibilityTimeoutSeconds() {
        return resultVisibilityTimeoutSeconds;
    }

    public void setResultVisibilityTimeoutSeconds(int resultVisibilityTimeoutSeconds) {
        this.resultVisibilityTimeoutSeconds = resultVisibilityTimeoutSeconds;
    }
}

package dev.ali.rcp.probes;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

public final class JdkProbeHttpClient implements ProbeHttpClient {
    private final HttpClient client;

    public JdkProbeHttpClient(Duration connectTimeout) {
        this.client = HttpClient.newBuilder()
                .connectTimeout(connectTimeout)
                .followRedirects(HttpClient.Redirect.NEVER)
                .build();
    }

    @Override
    public ProbeHttpResponse get(String normalizedUrl, Duration timeout, int maximumBodyBytes)
            throws IOException, InterruptedException {
        HttpRequest request = HttpRequest.newBuilder(URI.create(normalizedUrl))
                .timeout(timeout)
                .header("Accept", "*/*")
                .GET()
                .build();

        HttpResponse<InputStream> response = client.send(request, HttpResponse.BodyHandlers.ofInputStream());
        try (InputStream body = response.body()) {
            long responseBytes = readWithLimit(body, maximumBodyBytes);
            return new ProbeHttpResponse(response.statusCode(), responseBytes);
        }
    }

    static long readWithLimit(InputStream body, int maximumBodyBytes) throws IOException {
        byte[] buffer = new byte[8_192];
        long total = 0;
        int read;

        while ((read = body.read(buffer)) != -1) {
            total += read;
            if (total > maximumBodyBytes) {
                throw new ResponseTooLargeException(maximumBodyBytes);
            }
        }
        return total;
    }
}

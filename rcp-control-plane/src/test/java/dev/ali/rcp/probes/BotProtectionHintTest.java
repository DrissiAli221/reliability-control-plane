package dev.ali.rcp.probes;

import com.sun.net.httpserver.HttpServer;
import dev.ali.rcp.monitors.SafeTargetPolicy;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;
import java.net.*;
import java.time.*;
import java.util.UUID;
import static org.assertj.core.api.Assertions.*;

class BotProtectionHintTest {
    @Test void onlyTheKnownHeaderMarkerIsRecordedEvenWhenTheBodyHitsItsCap() throws Exception {
        InetAddress loopback = InetAddress.getLoopbackAddress();
        HttpServer server = HttpServer.create(new InetSocketAddress(loopback,0),0);
        server.createContext("/challenge",exchange -> {
            try (exchange) {
                exchange.getResponseHeaders().set("Cf-Mitigated","Challenge");
                byte[] body = new byte[1024]; exchange.sendResponseHeaders(403,body.length); exchange.getResponseBody().write(body);
            }
        });
        server.createContext("/plain403",exchange -> {
            try (exchange) { exchange.getResponseHeaders().set("Server","cloudflare"); exchange.sendResponseHeaders(403,-1); }
        });
        server.createContext("/other",exchange -> {
            try (exchange) { exchange.getResponseHeaders().set("cf-mitigated","other"); exchange.sendResponseHeaders(403,-1); }
        });
        server.start();
        SafeTargetPolicy fixture = new SafeTargetPolicy(host -> new InetAddress[]{loopback}) {
            @Override public InetAddress[] resolvePublicAddresses(String host) { return new InetAddress[]{loopback}; }
        };
        ValidatedProbeHttpClient client = new ValidatedProbeHttpClient(fixture,Duration.ofSeconds(1));
        String root = "http://127.0.0.1:"+server.getAddress().getPort();
        try {
            ProbeHttpResponse challenge = client.get(root+"/challenge",Duration.ofSeconds(2),32);
            assertThat(challenge.statusCode()).isEqualTo(403);
            assertThat(challenge.responseBytes()).isGreaterThan(32);
            assertThat(challenge.botProtection()).isEqualTo("CLOUDFLARE_CHALLENGE");
            assertThat(client.get(root+"/plain403",Duration.ofSeconds(2),32).botProtection()).isNull();
            assertThat(client.get(root+"/other",Duration.ofSeconds(2),32).botProtection()).isNull();
        } finally { server.stop(0); }
    }

    @Test void resultCodecAcceptsOldMessagesAndRoundTripsOnlyTheAllowlistedHint() {
        ProbeMessageCodec codec = new ProbeMessageCodec(new ObjectMapper());
        Instant at = Instant.parse("2026-10-09T12:00:00Z");
        ProbeResult old = new ProbeResult(UUID.randomUUID(),UUID.randomUUID(),UUID.randomUUID(),"eu-west-1",at,at,at.plusMillis(25),ProbeOutcome.HTTP_RESPONSE,403,25,12,null,1);
        String oldPayload = codec.encodeResult(old);
        assertThat(oldPayload).doesNotContain("botProtection");
        assertThat(codec.decodeResult(oldPayload)).isEqualTo(old);
        ProbeResult hint = new ProbeResult(old.jobId(),old.executionId(),old.monitorId(),old.probeRegion(),at,at,old.completedAt(),old.outcome(),403,25,12,null,1,"CLOUDFLARE_CHALLENGE");
        assertThat(codec.decodeResult(codec.encodeResult(hint))).isEqualTo(hint);
        assertThat(codec.decodeResult(oldPayload.substring(0,oldPayload.length()-1)+",\"futureOptionalMetadata\":true}")).isEqualTo(old);
        assertThatThrownBy(() -> codec.decodeResult(codec.encodeResult(hint).replace("CLOUDFLARE_CHALLENGE","UNKNOWN"))).isInstanceOf(IllegalArgumentException.class);
    }
}

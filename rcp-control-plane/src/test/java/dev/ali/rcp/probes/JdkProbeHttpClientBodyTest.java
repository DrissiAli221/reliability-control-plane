package dev.ali.rcp.probes;

import org.junit.jupiter.api.Test;

import java.io.ByteArrayInputStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class JdkProbeHttpClientBodyTest {

    @Test
    void countsTheResponseWithoutRetainingIt() throws Exception {
        long bytes = JdkProbeHttpClient.readWithLimit(
                new ByteArrayInputStream("healthy".getBytes()),
                64
        );

        assertThat(bytes).isEqualTo(7);
    }

    @Test
    void stopsWhenTheResponseExceedsTheLimit() {
        ByteArrayInputStream body = new ByteArrayInputStream(new byte[65]);

        assertThatThrownBy(() -> JdkProbeHttpClient.readWithLimit(body, 64))
                .isInstanceOf(ResponseTooLargeException.class);
    }
}

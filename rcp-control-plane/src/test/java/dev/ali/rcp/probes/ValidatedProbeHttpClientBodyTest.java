package dev.ali.rcp.probes;

import org.junit.jupiter.api.Test;

import java.io.ByteArrayInputStream;

import static org.assertj.core.api.Assertions.assertThat;

class ValidatedProbeHttpClientBodyTest {
    @Test
    void countsTheResponseWithoutRetainingIt() throws Exception {
        assertThat(ValidatedProbeHttpClient.countUpTo(
                new ByteArrayInputStream("healthy".getBytes()), 64
        )).isEqualTo(7);
    }

    @Test
    void stopsReadingOnceTheBodyPassesTheCap() throws Exception {
        ByteArrayInputStream body = new ByteArrayInputStream(new byte[100_000]);

        long counted = ValidatedProbeHttpClient.countUpTo(body, 64);

        assertThat(counted).isGreaterThan(64);
        assertThat(body.available()).isPositive();
    }
}

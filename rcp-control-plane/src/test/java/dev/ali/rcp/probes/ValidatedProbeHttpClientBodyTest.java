package dev.ali.rcp.probes;

import org.junit.jupiter.api.Test;

import java.io.ByteArrayInputStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ValidatedProbeHttpClientBodyTest {
    @Test
    void countsTheResponseWithoutRetainingIt() throws Exception {
        assertThat(ValidatedProbeHttpClient.readWithLimit(
                new ByteArrayInputStream("healthy".getBytes()), 64
        )).isEqualTo(7);
    }

    @Test
    void stopsWhenTheResponseExceedsTheLimit() {
        assertThatThrownBy(() -> ValidatedProbeHttpClient.readWithLimit(
                new ByteArrayInputStream(new byte[65]), 64
        )).isInstanceOf(ResponseTooLargeException.class);
    }
}

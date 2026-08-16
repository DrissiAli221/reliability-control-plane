package dev.ali.rcp.monitors;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record CreateMonitorRequest(

        @NotBlank
        @Size(max = 120)
        String name,

        @NotBlank
        @Size(max = 2_048)
        String targetUrl,

        @NotNull
        @Min(30)
        @Max(86_400)
        Integer checkIntervalSeconds,

        @NotNull
        @Min(100)
        @Max(30_000)
        Integer timeoutMs
) {
}
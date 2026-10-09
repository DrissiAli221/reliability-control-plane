package dev.ali.rcp.monitors;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.*;
import java.util.List;

public record UpdateMonitorStatusCodesRequest(
        @JsonProperty(value = "acceptedHttpStatuses", required = true)
        @Size(min = 1, max = 500) List<@NotNull @Min(100) @Max(599) Integer> acceptedHttpStatuses
) { }

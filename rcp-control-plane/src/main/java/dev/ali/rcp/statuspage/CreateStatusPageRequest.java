package dev.ali.rcp.statuspage;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.util.List;
import java.util.UUID;

public record CreateStatusPageRequest(
        @NotBlank @Size(max = 120) String name,
        @NotBlank @Size(max = 80)
        @Pattern(regexp = "^[a-z0-9]+(?:-[a-z0-9]+)*$") String slug,
        @NotEmpty @Size(max = 50) List<UUID> monitorIds,
        Boolean published
) {
}

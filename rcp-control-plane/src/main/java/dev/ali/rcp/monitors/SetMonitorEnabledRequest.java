package dev.ali.rcp.monitors;

import jakarta.validation.constraints.NotNull;

public record SetMonitorEnabledRequest(@NotNull Boolean enabled) {
}

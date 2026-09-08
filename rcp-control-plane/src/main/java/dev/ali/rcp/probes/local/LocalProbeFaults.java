package dev.ali.rcp.probes.local;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.util.Objects;
import java.util.concurrent.atomic.AtomicReference;

@Profile("local")
@Component
public class LocalProbeFaults {
    private final AtomicReference<LocalProbeFaultMode> mode =
            new AtomicReference<>(LocalProbeFaultMode.PASS_THROUGH);

    public LocalProbeFaultMode currentMode() {
        return mode.get();
    }

    public LocalProbeFaultMode changeMode(LocalProbeFaultMode newMode) {
        mode.set(Objects.requireNonNull(newMode));
        return newMode;
    }
}

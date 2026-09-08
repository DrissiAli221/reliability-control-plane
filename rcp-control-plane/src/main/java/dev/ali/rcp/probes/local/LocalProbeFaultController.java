package dev.ali.rcp.probes.local;

import org.springframework.context.annotation.Profile;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Objects;

@Profile("local")
@RestController
@RequestMapping("/api/local/probe-fault")
public class LocalProbeFaultController {
    private final LocalProbeFaults faults;

    public LocalProbeFaultController(LocalProbeFaults faults) {
        this.faults = Objects.requireNonNull(faults);
    }

    @GetMapping
    FaultModeResponse current() {
        return new FaultModeResponse(faults.currentMode());
    }

    @PutMapping
    FaultModeResponse change(@RequestBody ChangeFaultModeRequest request) {
        Objects.requireNonNull(request, "request must not be null");
        return new FaultModeResponse(faults.changeMode(request.mode()));
    }

    record ChangeFaultModeRequest(LocalProbeFaultMode mode) {
        ChangeFaultModeRequest {
            Objects.requireNonNull(mode, "mode must not be null");
        }
    }

    record FaultModeResponse(LocalProbeFaultMode mode) {
    }
}

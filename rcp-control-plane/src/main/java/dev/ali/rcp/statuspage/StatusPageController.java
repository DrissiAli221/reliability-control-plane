package dev.ali.rcp.statuspage;

import jakarta.validation.Valid;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;

@RestController
public class StatusPageController {
    private final StatusPageService service;

    public StatusPageController(StatusPageService service) {
        this.service = service;
    }

    @PostMapping("/api/status-pages")
    public ResponseEntity<StatusPageResponse> create(
            @Valid @RequestBody CreateStatusPageRequest request,
            Authentication authentication
    ) {
        StatusPageResponse response = service.create(authentication.getName(), request);
        return ResponseEntity.created(URI.create("/status/" + response.slug())).body(response);
    }

    @GetMapping("/status/{slug}")
    public ResponseEntity<PublicStatusPage> publicPage(@PathVariable String slug) {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(service.findPublic(slug));
    }
}

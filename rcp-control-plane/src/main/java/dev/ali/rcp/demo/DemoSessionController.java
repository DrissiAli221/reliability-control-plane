package dev.ali.rcp.demo;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Clock;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

/**
 * "Try the live demo": an anonymous visitor becomes the shared read-only demo account in one click.
 * A deployment-wide rate limit keeps the endpoint from being used to hammer Cognito.
 */
@RestController
class DemoSessionController {
    static final int SESSIONS_PER_MINUTE = 30;

    private final ObjectProvider<DemoSessionIssuer> issuer;
    private final Clock clock;
    private final AtomicLong windowStart = new AtomicLong();
    private final AtomicInteger issuedInWindow = new AtomicInteger();

    DemoSessionController(ObjectProvider<DemoSessionIssuer> issuer, ObjectProvider<Clock> clock) {
        this.issuer = issuer;
        this.clock = clock.getIfAvailable(Clock::systemUTC);
    }

    @PostMapping("/api/demo/session")
    ResponseEntity<?> session() {
        DemoSessionIssuer available = issuer.getIfAvailable();
        if (available == null) {
            return problem(HttpStatus.NOT_FOUND, "Demo unavailable", "This deployment does not offer a demo account.");
        }
        if (!admit()) {
            return problem(HttpStatus.TOO_MANY_REQUESTS, "Too many demo sign-ins", "Try again in a minute.");
        }
        return ResponseEntity.ok(available.issue());
    }

    // A fixed one-minute window shared by every caller: coarse, but it needs no state beyond two counters.
    private boolean admit() {
        long minute = clock.millis() / 60_000;
        if (windowStart.getAndSet(minute) != minute) issuedInWindow.set(0);
        return issuedInWindow.incrementAndGet() <= SESSIONS_PER_MINUTE;
    }

    private static ResponseEntity<ProblemDetail> problem(HttpStatus status, String title, String detail) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, detail);
        problem.setTitle(title);
        return ResponseEntity.status(status).body(problem);
    }
}

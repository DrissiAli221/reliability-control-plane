package dev.ali.rcp.availability;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice(assignableTypes = AvailabilityController.class)
public class AvailabilityExceptionHandler {

    @ExceptionHandler(AvailabilityMonitorNotFoundException.class)
    public ResponseEntity<ProblemDetail> handleNotFound() {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(
                HttpStatus.NOT_FOUND,
                "monitor not found"
        );
        problem.setTitle("Monitor not found");
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(problem);
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ProblemDetail> handleInvalidReportRequest(IllegalArgumentException exception) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(
                HttpStatus.BAD_REQUEST,
                exception.getMessage()
        );
        problem.setTitle("Invalid availability report request");
        return ResponseEntity.badRequest().body(problem);
    }
}

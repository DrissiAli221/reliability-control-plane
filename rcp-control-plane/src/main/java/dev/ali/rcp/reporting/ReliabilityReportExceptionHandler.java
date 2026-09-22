package dev.ali.rcp.reporting;

import dev.ali.rcp.availability.AvailabilityMonitorNotFoundException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice(assignableTypes = ReliabilityReportController.class)
public class ReliabilityReportExceptionHandler {
    @ExceptionHandler(AvailabilityMonitorNotFoundException.class)
    public ResponseEntity<ProblemDetail> notFound() {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, "monitor not found");
        problem.setTitle("Monitor not found");
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(problem);
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ProblemDetail> invalidRequest(IllegalArgumentException exception) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, exception.getMessage());
        problem.setTitle("Invalid reliability report request");
        return ResponseEntity.badRequest().body(problem);
    }
}

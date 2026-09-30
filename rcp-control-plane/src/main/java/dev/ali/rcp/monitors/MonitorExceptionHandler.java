package dev.ali.rcp.monitors;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class MonitorExceptionHandler {

    @ExceptionHandler(MonitorQuotaExceededException.class)
    public ResponseEntity<ProblemDetail> handleQuota(MonitorQuotaExceededException exception) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(
                HttpStatus.CONFLICT, exception.getMessage());
        problem.setTitle("Monitor quota reached");
        return ResponseEntity.status(HttpStatus.CONFLICT).body(problem);
    }

    @ExceptionHandler(MonitorCapacityReachedException.class)
    public ResponseEntity<ProblemDetail> handleCapacity(MonitorCapacityReachedException exception) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, exception.getMessage());
        problem.setTitle("Deployment monitor limit reached");
        return ResponseEntity.status(HttpStatus.CONFLICT).body(problem);
    }

    @ExceptionHandler(MonitorLimitException.class)
    public ResponseEntity<ProblemDetail> handleLimit(MonitorLimitException exception) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, exception.getMessage());
        problem.setTitle("Outside this deployment's limits");
        return ResponseEntity.badRequest().body(problem);
    }

    @ExceptionHandler(MonitorNotFoundException.class)
    public ResponseEntity<ProblemDetail> handleNotFound(MonitorNotFoundException exception) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, exception.getMessage());
        problem.setTitle("Monitor not found");
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(problem);
    }

    @ExceptionHandler(UnsafeTargetException.class)
    public ResponseEntity<ProblemDetail> handleUnsafeTarget(
            UnsafeTargetException exception
    ) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(
                HttpStatus.BAD_REQUEST,
                exception.getMessage()
        );

        problem.setTitle("Unsafe monitoring target");

        return ResponseEntity.badRequest().body(problem);
    }
}

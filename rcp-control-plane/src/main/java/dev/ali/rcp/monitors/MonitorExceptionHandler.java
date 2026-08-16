package dev.ali.rcp.monitors;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class MonitorExceptionHandler {

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
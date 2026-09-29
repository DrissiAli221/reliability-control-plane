package dev.ali.rcp.pipeline;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice(assignableTypes = PipelineController.class)
public class PipelineExceptionHandler {

    @ExceptionHandler(ExecutionNotFoundException.class)
    public ResponseEntity<ProblemDetail> executionNotFound(ExecutionNotFoundException exception) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, exception.getMessage());
        problem.setTitle("Execution not found");
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(problem);
    }
}

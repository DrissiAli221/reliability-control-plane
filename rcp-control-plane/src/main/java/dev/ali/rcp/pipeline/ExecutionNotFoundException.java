package dev.ali.rcp.pipeline;

final class ExecutionNotFoundException extends RuntimeException {
    ExecutionNotFoundException() {
        super("Execution not found");
    }
}

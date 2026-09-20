package dev.ali.rcp.monitors;

public class UnsafeTargetException extends RuntimeException {

    public UnsafeTargetException(String message) {
        super(message);
    }

    public UnsafeTargetException(String message, Throwable cause) {
        super(message, cause);
    }
}

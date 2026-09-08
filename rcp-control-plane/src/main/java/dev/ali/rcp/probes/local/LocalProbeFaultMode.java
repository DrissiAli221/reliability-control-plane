package dev.ali.rcp.probes.local;

public enum LocalProbeFaultMode {
    PASS_THROUGH,
    HTTP_503,
    CONNECTION_FAILURE,
    REQUEST_TIMEOUT,
    RESPONSE_TOO_LARGE
}

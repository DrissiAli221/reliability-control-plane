ALTER TABLE probe_jobs
    ADD CONSTRAINT probe_jobs_identity_for_result_fk
        UNIQUE (job_id, execution_id, probe_region);

CREATE TABLE probe_results
(
    job_id                  UUID PRIMARY KEY,
    execution_id            UUID                     NOT NULL,
    monitor_id              UUID                     NOT NULL,
    probe_region            VARCHAR(64)              NOT NULL,
    scheduled_at            TIMESTAMP WITH TIME ZONE NOT NULL,
    started_at              TIMESTAMP WITH TIME ZONE NOT NULL,
    completed_at            TIMESTAMP WITH TIME ZONE NOT NULL,
    outcome                 VARCHAR(32)              NOT NULL,
    http_status             INTEGER,
    latency_ms              BIGINT                   NOT NULL,
    response_bytes          BIGINT                   NOT NULL,
    error_type              VARCHAR(80),
    monitor_behavior_version BIGINT                  NOT NULL,
    received_at             TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT probe_results_job_identity_fk
        FOREIGN KEY (job_id, execution_id, probe_region)
            REFERENCES probe_jobs (job_id, execution_id, probe_region),

    CONSTRAINT probe_results_monitor_fk
        FOREIGN KEY (monitor_id)
            REFERENCES monitors (monitor_id),

    CONSTRAINT probe_results_region_not_blank
        CHECK (BTRIM(probe_region) <> ''),

    CONSTRAINT probe_results_time_order
        CHECK (completed_at >= started_at),

    CONSTRAINT probe_results_non_negative_measurements
        CHECK (latency_ms >= 0 AND response_bytes >= 0),

    CONSTRAINT probe_results_positive_behavior_version
        CHECK (monitor_behavior_version > 0),

    CONSTRAINT probe_results_outcome
        CHECK (outcome IN (
            'HTTP_RESPONSE',
            'EXPIRED',
            'UNSAFE_TARGET',
            'CONNECT_TIMEOUT',
            'REQUEST_TIMEOUT',
            'TLS_FAILURE',
            'CONNECTION_FAILURE',
            'RESPONSE_TOO_LARGE',
            'INTERRUPTED',
            'INTERNAL_ERROR'
        )),

    CONSTRAINT probe_results_http_status_range
        CHECK (http_status IS NULL OR http_status BETWEEN 100 AND 599),

    CONSTRAINT probe_results_http_fact_shape
        CHECK (
            (outcome = 'HTTP_RESPONSE' AND http_status IS NOT NULL)
                OR
            (outcome <> 'HTTP_RESPONSE' AND http_status IS NULL)
        )
);

CREATE INDEX probe_results_execution_idx
    ON probe_results (execution_id, probe_region);

CREATE INDEX probe_results_monitor_time_idx
    ON probe_results (monitor_id, scheduled_at);

CREATE TABLE processed_messages
(
    consumer_name VARCHAR(120)             NOT NULL,
    message_id    VARCHAR(255)             NOT NULL,
    processed_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT processed_messages_primary_key
        PRIMARY KEY (consumer_name, message_id),

    CONSTRAINT processed_messages_consumer_not_blank
        CHECK (BTRIM(consumer_name) <> ''),

    CONSTRAINT processed_messages_id_not_blank
        CHECK (BTRIM(message_id) <> '')
);

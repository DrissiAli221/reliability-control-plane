CREATE TABLE probe_executions
(
    execution_id             UUID PRIMARY KEY,
    monitor_id               UUID                     NOT NULL,
    scheduled_at             TIMESTAMP WITH TIME ZONE NOT NULL,
    result_deadline_at       TIMESTAMP WITH TIME ZONE NOT NULL,

    target_url_snapshot      TEXT                     NOT NULL,
    timeout_ms_snapshot      INTEGER                  NOT NULL,
    monitor_behavior_version BIGINT                   NOT NULL,
    incident_policy_version  BIGINT                   NOT NULL,

    expected_region_count    INTEGER                  NOT NULL,
    status                   VARCHAR(20)              NOT NULL DEFAULT 'PENDING',
    verdict                  VARCHAR(20),
    finalized_at             TIMESTAMP WITH TIME ZONE,
    created_at               TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT probe_executions_monitor_fk
        FOREIGN KEY (monitor_id)
            REFERENCES monitors (monitor_id),

    CONSTRAINT probe_executions_one_per_due_time
        UNIQUE (monitor_id, scheduled_at),

    CONSTRAINT probe_executions_deadline_after_schedule
        CHECK (result_deadline_at > scheduled_at),

    CONSTRAINT probe_executions_target_http_or_https
        CHECK (
            target_url_snapshot LIKE 'http://%'
                OR target_url_snapshot LIKE 'https://%'
            ),

    CONSTRAINT probe_executions_timeout_range
        CHECK (timeout_ms_snapshot BETWEEN 100 AND 30000),

    CONSTRAINT probe_executions_positive_versions
        CHECK (
            monitor_behavior_version > 0
                AND incident_policy_version > 0
            ),

    CONSTRAINT probe_executions_region_count
        CHECK (expected_region_count BETWEEN 1 AND 10),

    CONSTRAINT probe_executions_status
        CHECK (status IN ('PENDING', 'FINALIZED')),

    CONSTRAINT probe_executions_verdict
        CHECK (
            verdict IS NULL
                OR verdict IN ('UP', 'DOWN', 'DISAGREEMENT', 'NO_DATA')
            ),

    CONSTRAINT probe_executions_finalization_state
        CHECK (
            (
                status = 'PENDING'
                    AND verdict IS NULL
                    AND finalized_at IS NULL
                )
                OR
            (
                status = 'FINALIZED'
                    AND verdict IS NOT NULL
                    AND finalized_at IS NOT NULL
                )
            )
);

CREATE INDEX probe_executions_monitor_time_idx
    ON probe_executions (monitor_id, scheduled_at);


CREATE TABLE probe_jobs
(
    job_id        UUID PRIMARY KEY,
    execution_id  UUID                     NOT NULL,
    probe_region  VARCHAR(64)              NOT NULL,
    created_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT probe_jobs_execution_fk
        FOREIGN KEY (execution_id)
            REFERENCES probe_executions (execution_id),

    CONSTRAINT probe_jobs_region_not_blank
        CHECK (BTRIM(probe_region) <> ''),

    CONSTRAINT probe_jobs_one_per_execution_region
        UNIQUE (execution_id, probe_region)
);

CREATE INDEX probe_jobs_execution_idx
    ON probe_jobs (execution_id);


CREATE TABLE outbox_events
(
    event_id            UUID PRIMARY KEY,
    aggregate_type      VARCHAR(80)              NOT NULL,
    aggregate_id        UUID                     NOT NULL,
    event_type          VARCHAR(80)              NOT NULL,
    destination_region  VARCHAR(64)              NOT NULL,
    payload             JSONB                    NOT NULL,

    attempt_count       INTEGER                  NOT NULL DEFAULT 0,
    next_attempt_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    claimed_by          VARCHAR(120),
    claimed_until       TIMESTAMP WITH TIME ZONE,

    published_at        TIMESTAMP WITH TIME ZONE,
    failed_at           TIMESTAMP WITH TIME ZONE,
    last_error          TEXT,
    created_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT outbox_aggregate_type_not_blank
        CHECK (BTRIM(aggregate_type) <> ''),

    CONSTRAINT outbox_event_type_not_blank
        CHECK (BTRIM(event_type) <> ''),

    CONSTRAINT outbox_destination_not_blank
        CHECK (BTRIM(destination_region) <> ''),

    CONSTRAINT outbox_payload_is_object
        CHECK (JSONB_TYPEOF(payload) = 'object'),

    CONSTRAINT outbox_attempt_count_non_negative
        CHECK (attempt_count >= 0),

    CONSTRAINT outbox_claim_is_complete
        CHECK (
            (claimed_by IS NULL AND claimed_until IS NULL)
                OR
            (claimed_by IS NOT NULL AND claimed_until IS NOT NULL)
            ),

    CONSTRAINT outbox_one_terminal_state
        CHECK (
            NOT (
                published_at IS NOT NULL
                    AND failed_at IS NOT NULL
                )
            ),

    CONSTRAINT outbox_terminal_event_not_claimed
        CHECK (
            (
                published_at IS NULL
                    AND failed_at IS NULL
                )
                OR
            (
                claimed_by IS NULL
                    AND claimed_until IS NULL
                )
            ),

    CONSTRAINT outbox_one_intent_per_destination
        UNIQUE (event_type, aggregate_id, destination_region)
);

CREATE INDEX outbox_events_ready_idx
    ON outbox_events (next_attempt_at, created_at, event_id)
    WHERE published_at IS NULL
      AND failed_at IS NULL;

CREATE INDEX outbox_events_expired_claim_idx
    ON outbox_events (claimed_until)
    WHERE claimed_until IS NOT NULL
      AND published_at IS NULL
      AND failed_at IS NULL;
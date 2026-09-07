CREATE TABLE incidents
(
    incident_id             UUID PRIMARY KEY,
    monitor_id              UUID                     NOT NULL,
    status                  VARCHAR(20)              NOT NULL,
    opened_by_execution_id  UUID                     NOT NULL,
    opened_at               TIMESTAMP WITH TIME ZONE NOT NULL,
    resolved_by_execution_id UUID,
    resolved_at             TIMESTAMP WITH TIME ZONE,
    created_at              TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT incidents_monitor_fk
        FOREIGN KEY (monitor_id) REFERENCES monitors (monitor_id),

    CONSTRAINT incidents_open_execution_fk
        FOREIGN KEY (opened_by_execution_id) REFERENCES probe_executions (execution_id),

    CONSTRAINT incidents_resolve_execution_fk
        FOREIGN KEY (resolved_by_execution_id) REFERENCES probe_executions (execution_id),

    CONSTRAINT incidents_one_per_open_execution
        UNIQUE (opened_by_execution_id),

    CONSTRAINT incidents_one_per_resolve_execution
        UNIQUE (resolved_by_execution_id),

    CONSTRAINT incidents_status
        CHECK (status IN ('OPEN', 'RESOLVED')),

    CONSTRAINT incidents_resolution_state
        CHECK (
            (status = 'OPEN' AND resolved_by_execution_id IS NULL AND resolved_at IS NULL)
                OR
            (status = 'RESOLVED' AND resolved_by_execution_id IS NOT NULL AND resolved_at IS NOT NULL)
        ),

    CONSTRAINT incidents_time_order
        CHECK (resolved_at IS NULL OR resolved_at >= opened_at)
);

CREATE UNIQUE INDEX incidents_one_open_per_monitor_idx
    ON incidents (monitor_id)
    WHERE status = 'OPEN';

CREATE INDEX incidents_monitor_time_idx
    ON incidents (monitor_id, opened_at DESC);


CREATE TABLE monitor_incident_state
(
    monitor_id          UUID PRIMARY KEY,
    status              VARCHAR(20)              NOT NULL,
    consecutive_down    INTEGER                  NOT NULL,
    consecutive_up      INTEGER                  NOT NULL,
    last_evaluated_at   TIMESTAMP WITH TIME ZONE,
    open_incident_id    UUID,
    opened_at           TIMESTAMP WITH TIME ZONE,
    updated_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT monitor_incident_state_monitor_fk
        FOREIGN KEY (monitor_id) REFERENCES monitors (monitor_id),

    CONSTRAINT monitor_incident_state_open_incident_fk
        FOREIGN KEY (open_incident_id) REFERENCES incidents (incident_id),

    CONSTRAINT monitor_incident_state_status
        CHECK (status IN ('HEALTHY', 'OPEN')),

    CONSTRAINT monitor_incident_state_non_negative_streaks
        CHECK (consecutive_down >= 0 AND consecutive_up >= 0),

    CONSTRAINT monitor_incident_state_open_shape
        CHECK (
            (status = 'HEALTHY' AND open_incident_id IS NULL AND opened_at IS NULL)
                OR
            (status = 'OPEN' AND open_incident_id IS NOT NULL AND opened_at IS NOT NULL)
        )
);


CREATE TABLE incident_events
(
    event_id       UUID PRIMARY KEY,
    incident_id    UUID                     NOT NULL,
    execution_id   UUID                     NOT NULL,
    event_type     VARCHAR(20)              NOT NULL,
    occurred_at    TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT incident_events_incident_fk
        FOREIGN KEY (incident_id) REFERENCES incidents (incident_id),

    CONSTRAINT incident_events_execution_fk
        FOREIGN KEY (execution_id) REFERENCES probe_executions (execution_id),

    CONSTRAINT incident_events_type
        CHECK (event_type IN ('OPENED', 'RESOLVED')),

    CONSTRAINT incident_events_one_transition_per_execution
        UNIQUE (execution_id, event_type)
);

CREATE INDEX incident_events_incident_time_idx
    ON incident_events (incident_id, occurred_at);


CREATE TABLE incident_evaluations
(
    execution_id  UUID                     PRIMARY KEY,
    monitor_id    UUID                     NOT NULL,
    verdict       VARCHAR(20)              NOT NULL,
    transition    VARCHAR(20)              NOT NULL,
    evaluated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT incident_evaluations_execution_fk
        FOREIGN KEY (execution_id) REFERENCES probe_executions (execution_id),

    CONSTRAINT incident_evaluations_monitor_fk
        FOREIGN KEY (monitor_id) REFERENCES monitors (monitor_id),

    CONSTRAINT incident_evaluations_verdict
        CHECK (verdict IN ('UP', 'DOWN', 'DISAGREEMENT', 'NO_DATA')),

    CONSTRAINT incident_evaluations_transition
        CHECK (transition IN ('NONE', 'OPENED', 'RESOLVED', 'IGNORED_STALE'))
);

CREATE INDEX incident_evaluations_monitor_idx
    ON incident_evaluations (monitor_id, evaluated_at);

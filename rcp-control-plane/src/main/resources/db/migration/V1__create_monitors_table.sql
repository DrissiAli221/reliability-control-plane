CREATE TABLE monitors
(
    monitor_id            UUID PRIMARY KEY,
    owner_subject         VARCHAR(255)             NOT NULL,
    name                  VARCHAR(120)             NOT NULL,
    target_url            TEXT                     NOT NULL,
    check_interval_seconds INTEGER                 NOT NULL,
    timeout_ms            INTEGER                  NOT NULL,
    enabled               BOOLEAN                  NOT NULL DEFAULT TRUE,
    next_check_at         TIMESTAMP WITH TIME ZONE,
    behavior_version      BIGINT                   NOT NULL DEFAULT 1,
    created_at            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT monitors_owner_not_blank
        CHECK (BTRIM(owner_subject) <> ''),

    CONSTRAINT monitors_name_not_blank
        CHECK (BTRIM(name) <> ''),

    CONSTRAINT monitors_target_http_or_https
        CHECK (
            target_url LIKE 'http://%'
                OR target_url LIKE 'https://%'
            ),

    CONSTRAINT monitors_interval_range
        CHECK (check_interval_seconds BETWEEN 30 AND 86400),

    CONSTRAINT monitors_timeout_range
        CHECK (timeout_ms BETWEEN 100 AND 30000),

    CONSTRAINT monitors_schedule_state
        CHECK (
            (enabled = TRUE AND next_check_at IS NOT NULL)
                OR
            (enabled = FALSE AND next_check_at IS NULL)
            )
);

CREATE INDEX monitors_due_check_idx
    ON monitors (next_check_at, monitor_id)
    WHERE enabled = TRUE;
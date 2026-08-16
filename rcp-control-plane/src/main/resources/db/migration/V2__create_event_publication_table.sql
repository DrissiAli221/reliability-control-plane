CREATE TABLE event_publication
(
    id                     UUID                     NOT NULL,
    publication_date       TIMESTAMP WITH TIME ZONE NOT NULL,
    listener_id            VARCHAR(255)             NOT NULL,
    serialized_event       VARCHAR(255)             NOT NULL,
    event_type             VARCHAR(255)             NOT NULL,
    completion_date        TIMESTAMP WITH TIME ZONE,
    last_resubmission_date TIMESTAMP WITH TIME ZONE,
    completion_attempts    INTEGER                  NOT NULL,
    status                 VARCHAR(255),

    CONSTRAINT event_publication_primary_key
        PRIMARY KEY (id),

    CONSTRAINT event_publication_status_valid
        CHECK (
            status IN (
                       'PUBLISHED',
                       'PROCESSING',
                       'COMPLETED',
                       'FAILED',
                       'RESUBMITTED'
                )
            )
);
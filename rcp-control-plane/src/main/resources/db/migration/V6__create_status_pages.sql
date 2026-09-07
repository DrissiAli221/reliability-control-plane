CREATE TABLE status_pages
(
    page_id        UUID PRIMARY KEY,
    owner_subject  VARCHAR(255)             NOT NULL,
    slug           VARCHAR(80)              NOT NULL,
    name           VARCHAR(120)             NOT NULL,
    published      BOOLEAN                  NOT NULL DEFAULT FALSE,
    created_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT status_pages_slug_unique UNIQUE (slug),
    CONSTRAINT status_pages_owner_not_blank CHECK (BTRIM(owner_subject) <> ''),
    CONSTRAINT status_pages_slug_format CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
    CONSTRAINT status_pages_name_not_blank CHECK (BTRIM(name) <> '')
);

CREATE TABLE status_page_monitors
(
    page_id      UUID    NOT NULL,
    monitor_id   UUID    NOT NULL,
    sort_order   INTEGER NOT NULL,

    CONSTRAINT status_page_monitors_primary_key PRIMARY KEY (page_id, monitor_id),
    CONSTRAINT status_page_monitors_page_fk
        FOREIGN KEY (page_id) REFERENCES status_pages (page_id) ON DELETE CASCADE,
    CONSTRAINT status_page_monitors_monitor_fk
        FOREIGN KEY (monitor_id) REFERENCES monitors (monitor_id),
    CONSTRAINT status_page_monitors_order_non_negative CHECK (sort_order >= 0),
    CONSTRAINT status_page_monitors_order_unique UNIQUE (page_id, sort_order)
);

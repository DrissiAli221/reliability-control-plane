-- Supports the owner-scoped registration cap and ordered monitor listing.
CREATE INDEX monitors_owner_name_idx
    ON monitors (owner_subject, name, monitor_id);

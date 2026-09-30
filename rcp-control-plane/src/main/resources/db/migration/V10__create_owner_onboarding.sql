-- One row per identity that has been offered the example monitor, so it is created at most once even if the
-- owner later removes or pauses it.
CREATE TABLE owner_onboarding
(
    owner_subject VARCHAR(255)             PRIMARY KEY,
    onboarded_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT owner_onboarding_owner_not_blank
        CHECK (BTRIM(owner_subject) <> '')
);

ALTER TABLE probe_results ADD COLUMN bot_protection VARCHAR(40);
ALTER TABLE probe_results ADD CONSTRAINT probe_results_known_bot_marker
    CHECK (bot_protection IS NULL OR (bot_protection = 'CLOUDFLARE_CHALLENGE' AND outcome = 'HTTP_RESPONSE'));

-- NULL preserves the historic rule: any status from 200 through 399.
ALTER TABLE monitors ADD COLUMN accepted_http_statuses INTEGER[];
ALTER TABLE probe_executions ADD COLUMN accepted_http_statuses_snapshot INTEGER[];
ALTER TABLE monitors ADD CONSTRAINT monitors_valid_accepted_statuses CHECK (
    accepted_http_statuses IS NULL OR (cardinality(accepted_http_statuses) BETWEEN 1 AND 500
    AND array_ndims(accepted_http_statuses) = 1 AND array_position(accepted_http_statuses, NULL) IS NULL
    AND 100 <= ALL(accepted_http_statuses) AND 599 >= ALL(accepted_http_statuses)));
ALTER TABLE probe_executions ADD CONSTRAINT executions_valid_accepted_statuses CHECK (
    accepted_http_statuses_snapshot IS NULL OR (cardinality(accepted_http_statuses_snapshot) BETWEEN 1 AND 500
    AND array_ndims(accepted_http_statuses_snapshot) = 1 AND array_position(accepted_http_statuses_snapshot, NULL) IS NULL
    AND 100 <= ALL(accepted_http_statuses_snapshot) AND 599 >= ALL(accepted_http_statuses_snapshot)));

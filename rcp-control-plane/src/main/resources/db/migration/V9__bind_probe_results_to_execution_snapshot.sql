-- A queue result must describe the immutable execution that produced its job.
-- The existing job/region FK alone does not bind monitor, scheduled time, or
-- behavior version; mismatched values could otherwise become incident evidence.
ALTER TABLE probe_executions
    ADD CONSTRAINT probe_executions_result_identity_unique
        UNIQUE (execution_id, monitor_id, scheduled_at, monitor_behavior_version);

ALTER TABLE probe_results
    ADD CONSTRAINT probe_results_execution_snapshot_fk
        FOREIGN KEY (execution_id, monitor_id, scheduled_at, monitor_behavior_version)
            REFERENCES probe_executions
                (execution_id, monitor_id, scheduled_at, monitor_behavior_version);

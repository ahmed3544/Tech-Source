-- 0005_activity_logs.sql — activity log (audit trail): who changed what.
-- Idempotent: safe to run multiple times (matches server/ensure-schema.ts).
-- No existing data is modified or dropped.

CREATE TABLE IF NOT EXISTS activity_logs (
    id text PRIMARY KEY,
    company_id text,
    actor_id text NOT NULL,
    actor_name text,
    actor_role text,
    action text NOT NULL,
    entity_type text,
    entity_id text,
    entity_label text,
    details text,
    created_at text NOT NULL
);

CREATE INDEX IF NOT EXISTS activity_logs_created_at_idx
    ON activity_logs (created_at);

CREATE INDEX IF NOT EXISTS activity_logs_action_idx
    ON activity_logs (action);

CREATE INDEX IF NOT EXISTS activity_logs_actor_idx
    ON activity_logs (actor_id);

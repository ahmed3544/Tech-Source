-- 0006: notifications.related_break_request_id
-- Links a notification to the break_change_requests row it is about so the
-- reviewer-side "new break change request" notification can be resolved
-- (deleted) as soon as the request is approved or rejected. Previously the
-- reviewer's notification stayed unread with "new request" wording forever,
-- so reviewed requests kept looking pending in the notification bell.
-- Idempotent: safe to run any number of times, never touches existing data.

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS related_break_request_id text;

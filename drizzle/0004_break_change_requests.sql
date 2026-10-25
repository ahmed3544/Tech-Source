-- 0004: break change requests (employee asks admin to move a break)
-- Idempotent: safe to run any number of times, never touches existing data.

CREATE TABLE IF NOT EXISTS break_change_requests (
  id text PRIMARY KEY,
  company_id text,
  employee_id text NOT NULL,
  date text NOT NULL,
  current_start_time text,
  current_end_time text,
  proposed_start_time text NOT NULL,
  proposed_end_time text NOT NULL,
  reason text,
  status text NOT NULL DEFAULT 'pending',
  requested_by text,
  reviewed_by text,
  reviewed_at text,
  review_notes text,
  created_at text NOT NULL,
  updated_at text NOT NULL
);

CREATE INDEX IF NOT EXISTS break_change_requests_employee_date_idx
  ON break_change_requests (employee_id, date);

CREATE INDEX IF NOT EXISTS break_change_requests_status_idx
  ON break_change_requests (status);

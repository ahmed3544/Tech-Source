-- 0003_employee_breaks.sql
-- 1) Adds employee-specific, date-specific planned breaks.
-- 2) Adds team-ownership columns used by the server-side permission guard
--    (they existed in the app types but never in the database).
-- Safe to apply multiple times (idempotent). No existing data is modified or
-- dropped: shift-level breaks in settings.shiftBreaks remain untouched and
-- continue to work as a fallback for employees/days without explicit rows.

CREATE TABLE IF NOT EXISTS employee_breaks (
  id text PRIMARY KEY,
  company_id text,
  employee_id text NOT NULL,
  date text NOT NULL,
  name text,
  name_ar text,
  name_en text,
  start_time text NOT NULL,
  end_time text NOT NULL,
  duration_minutes integer,
  created_at text NOT NULL,
  updated_at text NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS employee_breaks_employee_date_start_idx
  ON employee_breaks (employee_id, date, start_time);

ALTER TABLE employees ADD COLUMN IF NOT EXISTS team_leader_id text;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS team_id text;

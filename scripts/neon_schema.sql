-- TechSource / Neon fresh-database schema
-- SAFE: creates missing tables/indexes only. It does not delete or truncate data.
-- Generated from src/db/schema.ts.

CREATE TABLE IF NOT EXISTS employees (
  id text PRIMARY KEY,
  code text,
  name_ar text NOT NULL,
  name_en text NOT NULL,
  avatar text,
  email text,
  phone text,
  department text,
  job_title_ar text,
  job_title_en text,
  shift_id text,
  pin text,
  role text,
  joined_date text,
  status text,
  annual_leave_balance real,
  casual_leave_balance real,
  regular_leave_balance real,
  sick_leave_balance real,
  is_photo_removed boolean
);

CREATE TABLE IF NOT EXISTS attendance_records (
  id text PRIMARY KEY,
  employee_id text NOT NULL,
  date text NOT NULL,
  check_in text,
  check_out text,
  break_start text,
  break_end text,
  breaks jsonb,
  total_break_seconds integer,
  location text,
  device_info text,
  late_minutes integer DEFAULT 0,
  late_seconds integer DEFAULT 0,
  early_leave_minutes integer DEFAULT 0,
  work_hours real DEFAULT 0,
  overtime_hours real DEFAULT 0,
  minus_hours real DEFAULT 0,
  status text,
  leave_type text,
  notes text,
  verified_by_face boolean,
  is_excused boolean,
  excused_by text,
  excused_reason text,
  updated_at text,
  is_explicit_cancel_check_out boolean
);
CREATE UNIQUE INDEX IF NOT EXISTS employee_date_idx ON attendance_records (employee_id, date);

CREATE TABLE IF NOT EXISTS leave_requests (
  id text PRIMARY KEY,
  employee_id text NOT NULL,
  type text,
  start_date text,
  end_date text,
  reason text,
  status text,
  created_at text,
  hours integer,
  permission_slot text,
  attachment_url text,
  attachment_name text,
  reviewed_by text,
  review_notes text
);

CREATE TABLE IF NOT EXISTS overtime_requests (
  id text PRIMARY KEY,
  employee_id text NOT NULL,
  date text NOT NULL,
  type text NOT NULL,
  duration_seconds integer NOT NULL,
  reason text,
  status text DEFAULT 'pending',
  reviewed_by text,
  review_notes text,
  created_at text,
  updated_at text
);

CREATE TABLE IF NOT EXISTS settings (
  key text PRIMARY KEY,
  value jsonb
);

CREATE TABLE IF NOT EXISTS shifts (
  id text PRIMARY KEY,
  name text NOT NULL,
  start_time text NOT NULL,
  end_time text NOT NULL,
  duration_minutes integer NOT NULL,
  break_minutes integer DEFAULT 0,
  grace_period_minutes integer DEFAULT 0,
  overtime_enabled boolean DEFAULT false,
  is_overnight boolean DEFAULT false,
  created_at text,
  updated_at text
);

CREATE TABLE IF NOT EXISTS employee_shift_assignments (
  id text PRIMARY KEY,
  employee_id text NOT NULL,
  schedule_date text NOT NULL,
  shift_template_id text,
  custom_start_time text,
  custom_end_time text,
  duration_minutes integer DEFAULT 480,
  status text DEFAULT 'draft',
  created_at text NOT NULL,
  updated_at text NOT NULL,
  version integer DEFAULT 1
);
CREATE UNIQUE INDEX IF NOT EXISTS employee_shift_assignment_date_idx
  ON employee_shift_assignments (employee_id, schedule_date);

CREATE TABLE IF NOT EXISTS rotation_patterns (
  id text PRIMARY KEY,
  name text NOT NULL,
  shift_ids jsonb NOT NULL,
  created_by text,
  created_at text NOT NULL,
  updated_at text NOT NULL
);

CREATE TABLE IF NOT EXISTS rotation_pattern_items (
  id text PRIMARY KEY,
  pattern_id text NOT NULL,
  shift_id text NOT NULL,
  sequence integer NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS rotation_pattern_sequence_idx
  ON rotation_pattern_items (pattern_id, sequence);

CREATE TABLE IF NOT EXISTS notifications (
  id text PRIMARY KEY,
  recipient_id text NOT NULL,
  type text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  related_employee_id text,
  related_leave_id text,
  related_overtime_id text,
  related_shift_swap_id text,
  is_read boolean DEFAULT false,
  created_at text NOT NULL,
  updated_at text NOT NULL
);

CREATE TABLE IF NOT EXISTS notification_system_meta (
  key text PRIMARY KEY,
  value text NOT NULL
);

-- Helpful compatibility columns used by the current server where needed.
ALTER TABLE employees ADD COLUMN IF NOT EXISTS updated_at text;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS related_shift_swap_id text;

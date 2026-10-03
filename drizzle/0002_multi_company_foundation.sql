-- Multi-company foundation for TechSource.
-- Safe to run more than once: all DDL uses IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS companies (
  id text PRIMARY KEY,
  code text NOT NULL,
  name_ar text NOT NULL,
  name_en text NOT NULL,
  logo text,
  status text NOT NULL DEFAULT 'active',
  created_at text NOT NULL,
  updated_at text NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS companies_code_idx ON companies(code);

INSERT INTO companies (id, code, name_ar, name_en, status, created_at, updated_at)
VALUES ('tech-source', 'TECHSOURCE', 'شركة TECH SOURCE GDS', 'TECH SOURCE - GDS Global', 'active', NOW()::text, NOW()::text)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE employees ADD COLUMN IF NOT EXISTS company_id text;
UPDATE employees SET company_id = 'tech-source' WHERE company_id IS NULL;

ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS company_id text;
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS company_id text;
ALTER TABLE overtime_requests ADD COLUMN IF NOT EXISTS company_id text;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS company_id text;
ALTER TABLE employee_shift_assignments ADD COLUMN IF NOT EXISTS company_id text;
ALTER TABLE rotation_patterns ADD COLUMN IF NOT EXISTS company_id text;
ALTER TABLE rotation_pattern_items ADD COLUMN IF NOT EXISTS company_id text;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS company_id text;
ALTER TABLE login_audit ADD COLUMN IF NOT EXISTS company_id text;

UPDATE attendance_records a
SET company_id = e.company_id
FROM employees e
WHERE a.employee_id = e.id AND a.company_id IS NULL;

UPDATE leave_requests l
SET company_id = e.company_id
FROM employees e
WHERE l.employee_id = e.id AND l.company_id IS NULL;

UPDATE overtime_requests o
SET company_id = e.company_id
FROM employees e
WHERE o.employee_id = e.id AND o.company_id IS NULL;

UPDATE employee_shift_assignments s
SET company_id = e.company_id
FROM employees e
WHERE s.employee_id = e.id AND s.company_id IS NULL;

UPDATE notifications n
SET company_id = e.company_id
FROM employees e
WHERE n.recipient_id = e.id AND n.company_id IS NULL;

UPDATE login_audit a
SET company_id = e.company_id
FROM employees e
WHERE a.employee_id = e.id AND a.company_id IS NULL;

CREATE INDEX IF NOT EXISTS employees_company_id_idx ON employees(company_id);
CREATE INDEX IF NOT EXISTS attendance_company_id_idx ON attendance_records(company_id);
CREATE INDEX IF NOT EXISTS leave_company_id_idx ON leave_requests(company_id);
CREATE INDEX IF NOT EXISTS overtime_company_id_idx ON overtime_requests(company_id);
CREATE INDEX IF NOT EXISTS shifts_company_id_idx ON shifts(company_id);
CREATE INDEX IF NOT EXISTS employee_shift_company_id_idx ON employee_shift_assignments(company_id);
CREATE INDEX IF NOT EXISTS notifications_company_id_idx ON notifications(company_id);
CREATE INDEX IF NOT EXISTS login_audit_company_id_idx ON login_audit(company_id);

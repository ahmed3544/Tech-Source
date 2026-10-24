// Boots an isolated demo environment: embedded PostgreSQL + seeded data covering
// all five schedule statuses + the built production server. Keeps running until
// the process is killed.
import EmbeddedPostgres from 'embedded-postgres';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 54332;
const APP_PORT = 3112;

const pg = new EmbeddedPostgres({
  databaseDir: `/tmp/tech-source-ui-demo-pg-${Date.now()}`,
  user: 'postgres',
  password: 'demopass',
  port: PORT,
  persistent: false,
});

await pg.initialise();
await pg.start();
await pg.createDatabase('techsource_demo');
const client = pg.getPgClient('techsource_demo');
await client.connect();

const today = new Date();
const sunday = new Date(today); sunday.setHours(0,0,0,0); sunday.setDate(sunday.getDate() - sunday.getDay());
const d = (i) => { const x = new Date(sunday); x.setDate(x.getDate() + i); return x.toISOString().slice(0, 10); };
const WEEK = Array.from({ length: 7 }, (_, i) => d(i));
console.log('demo week:', WEEK[0], '→', WEEK[6]);

await client.query(`
  CREATE TABLE IF NOT EXISTS employees (id text PRIMARY KEY, company_id text, code text, name_ar text NOT NULL, name_en text NOT NULL,
    avatar text, email text, phone text, department text, job_title_ar text, job_title_en text, shift_id text, pin text,
    role text, joined_date text, status text, annual_leave_balance real, casual_leave_balance real, regular_leave_balance real,
    sick_leave_balance real, is_photo_removed boolean, updated_at text);
  CREATE TABLE IF NOT EXISTS leave_requests (id text PRIMARY KEY, company_id text, employee_id text NOT NULL, type text,
    start_date text, end_date text, reason text, status text, created_at text, hours integer, permission_slot text,
    attachment_url text, attachment_name text, reviewed_by text, review_notes text);
  CREATE TABLE IF NOT EXISTS settings (key text PRIMARY KEY, value jsonb);
  CREATE TABLE IF NOT EXISTS shifts (id text PRIMARY KEY, company_id text, name text NOT NULL, start_time text NOT NULL, end_time text NOT NULL,
    duration_minutes integer NOT NULL, break_minutes integer DEFAULT 0, grace_period_minutes integer DEFAULT 0,
    overtime_enabled boolean DEFAULT false, is_overnight boolean DEFAULT false, created_at text, updated_at text);
  CREATE TABLE IF NOT EXISTS attendance_records (id text PRIMARY KEY, company_id text, employee_id text NOT NULL, date text NOT NULL,
    check_in text, check_out text, break_start text, break_end text, breaks jsonb, total_break_seconds integer, location text,
    device_info text, late_minutes integer DEFAULT 0, late_seconds integer DEFAULT 0, early_leave_minutes integer DEFAULT 0,
    work_hours real DEFAULT 0, overtime_hours real DEFAULT 0, minus_hours real DEFAULT 0, status text, leave_type text,
    notes text, verified_by_face boolean, is_excused boolean, excused_by text, excused_reason text, updated_at text,
    is_explicit_cancel_check_out boolean);
  CREATE TABLE IF NOT EXISTS overtime_requests (id text PRIMARY KEY, company_id text, employee_id text NOT NULL, date text NOT NULL,
    type text NOT NULL, duration_seconds integer NOT NULL, reason text, status text DEFAULT 'pending', reviewed_by text,
    review_notes text, created_at text, updated_at text);
  CREATE TABLE IF NOT EXISTS notifications (id text PRIMARY KEY, company_id text, recipient_id text NOT NULL, type text NOT NULL,
    title text NOT NULL, message text NOT NULL, related_employee_id text, related_leave_id text, related_overtime_id text,
    related_shift_swap_id text, is_read boolean DEFAULT false, created_at text NOT NULL, updated_at text NOT NULL);
  CREATE TABLE IF NOT EXISTS login_audit (id text PRIMARY KEY, company_id text, employee_id text, login_identifier text NOT NULL,
    success boolean NOT NULL DEFAULT false, failure_reason text, ip_address text, user_agent text, created_at text NOT NULL);
  CREATE TABLE IF NOT EXISTS employee_shift_assignments (id text PRIMARY KEY, company_id text, employee_id text NOT NULL,
    schedule_date text NOT NULL, shift_template_id text, custom_start_time text, custom_end_time text, duration_minutes integer DEFAULT 480,
    status text DEFAULT 'draft', created_at text NOT NULL, updated_at text NOT NULL, version integer DEFAULT 1);
  CREATE TABLE IF NOT EXISTS rotation_patterns (id text PRIMARY KEY, company_id text, name text NOT NULL, shift_ids jsonb NOT NULL,
    created_by text, created_at text NOT NULL, updated_at text NOT NULL);
  CREATE TABLE IF NOT EXISTS rotation_pattern_items (id text PRIMARY KEY, company_id text, pattern_id text NOT NULL,
    shift_id text NOT NULL, sequence integer NOT NULL);
`);
await client.query(fs.readFileSync(path.join(ROOT, 'drizzle/0003_employee_breaks.sql'), 'utf8'));

// Seed: admin + leader + two same-shift agents
await client.query(`INSERT INTO employees (id, code, name_ar, name_en, pin, role, status, shift_id, company_id, team_leader_id) VALUES
  ('emp-002', 'EMP002', 'Ahmed Mahmoud', 'Ahmed Mahmoud', '1234', 'admin', 'active', 'shift-1', 'tech-source', NULL),
  ('emp-011', 'EMP011', 'قائد الفريق', 'Team Leader', 'leader123', 'leader', 'active', 'shift-1', 'tech-source', NULL),
  ('emp-101', 'EMP101', 'مروة السيد', 'Marwa Elsayed', '1234', 'employee', 'active', 'shift-1', 'tech-source', 'emp-011'),
  ('emp-102', 'EMP102', 'كريم عبد الله', 'Karim Abdullah', '1234', 'employee', 'active', 'shift-1', 'tech-source', 'emp-011')`);
await client.query(`INSERT INTO shifts (id, company_id, name, start_time, end_time, duration_minutes, break_minutes, grace_period_minutes)
  VALUES ('shift-1', 'tech-source', 'Morning Shift', '09:00', '17:00', 480, 0, 10)`);

// Weekly schedule: working days, Friday OFF for both agents
const assignments = [];
for (const [emp, offIdx] of [['emp-101', 5], ['emp-102', 5]]) {
  WEEK.forEach((date, i) => {
    assignments.push({ employeeId: emp, date, shiftId: i === offIdx ? '' : 'shift-1', isOffDay: i === offIdx, assignedBy: 'emp-002', updatedAt: new Date().toISOString() });
  });
}
await client.query(`INSERT INTO settings (key, value) VALUES ('dailyShiftAssignments', $1)`, [JSON.stringify(assignments)]);

// Shift-level default breaks (fallback): lunch 12:00-13:00
await client.query(`INSERT INTO settings (key, value) VALUES ('shiftBreaks', $1)`, [JSON.stringify({ 'shift-1': [{ id: 'brk-lunch', nameAr: 'استراحة الغداء', nameEn: 'Lunch', startTime: '12:00', endTime: '13:00', durationMinutes: 60 }] })]);

// EMPLOYEE-SPECIFIC breaks: emp-101 gets a DIFFERENT break on day 2; emp-102 gets two custom breaks on day 3
await client.query(`INSERT INTO employee_breaks (id, company_id, employee_id, date, name, name_ar, name_en, start_time, end_time, duration_minutes, created_at, updated_at) VALUES
  ('brk-101-a', 'tech-source', 'emp-101', $1, NULL, 'استراحة الصلاة', 'Prayer Break', '13:30', '13:50', 20, now()::text, now()::text),
  ('brk-102-a', 'tech-source', 'emp-102', $2, NULL, 'قهوة الصباح', 'Morning Coffee', '10:15', '10:30', 15, now()::text, now()::text),
  ('brk-102-b', 'tech-source', 'emp-102', $2, NULL, 'استراحة متأخرة', 'Late Break', '15:00', '15:20', 20, now()::text, now()::text)`, [WEEK[2], WEEK[3]]);

// Approved ANNUAL leave for emp-101 on day 1 → yellow
await client.query(`INSERT INTO leave_requests (id, company_id, employee_id, type, start_date, end_date, reason, status, created_at)
  VALUES ('lv-annual-1', 'tech-source', 'emp-101', 'annual', $1, $1, 'إجازة سنوية معتمدة', 'approved', now()::text)`, [WEEK[1]]);

// Official holiday on day 4 → red
await client.query(`INSERT INTO settings (key, value) VALUES ('officialHolidays', $1)`,
  [JSON.stringify([{ id: 'hol-1', nameAr: 'عطلة رسمية', nameEn: 'National Holiday', startDate: WEEK[4], endDate: WEEK[4], daysCount: 1, type: 'national' }])]);

process.env.DATABASE_URL = `postgres://postgres:demopass@localhost:${PORT}/techsource_demo`;
process.env.PORT = String(APP_PORT);
process.env.NODE_ENV = 'production';

const server = spawn('node', ['dist/server.js'], { cwd: ROOT, stdio: 'inherit' });
server.on('exit', async (code) => {
  console.log('server exited', code);
  try { await client.end(); await pg.stop(); } catch {}
  process.exit(code ?? 0);
});
const shutdown = async () => { try { server.kill(); } catch {} };
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
console.log(`DEMO READY → http://localhost:${APP_PORT} (login EMP002 / 1234)`);

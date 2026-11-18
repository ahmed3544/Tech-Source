// Quick isolation probe: boots ONLY an embedded postgres, then runs the
// swap-notification steps against a plain `tsx server.ts` Express process
// (no workerd). Purpose: determine whether the missing request notifications
// are an app-logic bug or a workerd-facade bug.
import EmbeddedPostgres from 'embedded-postgres';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PG_PORT = 54343;
const PORT = 3199;
const BASE = `http://127.0.0.1:${PORT}`;

let pg, server;
let passed = 0, failed = 0;
const check = (name, ok, extra = '') => {
  if (ok) { passed++; console.log(`  PASS ${name}${extra ? ` — ${extra}` : ''}`); }
  else { failed++; console.log(`  FAIL ${name}${extra ? ` — ${extra}` : ''}`); }
};

const today = new Date();
const sunday = new Date(today); sunday.setHours(0, 0, 0, 0); sunday.setDate(sunday.getDate() - sunday.getDay());
const d = (i) => { const x = new Date(sunday); x.setDate(x.getDate() + i); return x.toISOString().slice(0, 10); };
const WEEK = Array.from({ length: 7 }, (_, i) => d(i));
const D = WEEK[3];

pg = new EmbeddedPostgres({
  databaseDir: `/tmp/tech-source-iso-pg-${Date.now()}`,
  user: 'postgres', password: 'demopass', port: PG_PORT, persistent: false,
});
await pg.initialise();
await pg.start();
await pg.createDatabase('techsource_iso');
const client = pg.getPgClient('techsource_iso');
await client.connect();

await client.query(`
  CREATE TABLE IF NOT EXISTS employees (id text PRIMARY KEY, company_id text, code text, name_ar text NOT NULL, name_en text NOT NULL,
    avatar text, email text, phone text, department text, job_title_ar text, job_title_en text, shift_id text, pin text,
    role text, joined_date text, status text, annual_leave_balance real, casual_leave_balance real, regular_leave_balance real,
    sick_leave_balance real, is_photo_removed boolean, updated_at text, team_leader_id text, team_id text);
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
    related_shift_swap_id text, related_break_request_id text, is_read boolean DEFAULT false, created_at text NOT NULL, updated_at text NOT NULL);
  CREATE TABLE IF NOT EXISTS login_audit (id text PRIMARY KEY, company_id text, employee_id text, login_identifier text NOT NULL,
    success boolean NOT NULL DEFAULT false, failure_reason text, ip_address text, user_agent text, created_at text NOT NULL);
  CREATE TABLE IF NOT EXISTS employee_shift_assignments (id text PRIMARY KEY, company_id text, employee_id text NOT NULL,
    schedule_date text NOT NULL, shift_template_id text, custom_start_time text, custom_end_time text, duration_minutes integer DEFAULT 480,
    status text DEFAULT 'draft', created_at text NOT NULL, updated_at text NOT NULL, version integer DEFAULT 1);
  CREATE TABLE IF NOT EXISTS activity_logs (id text PRIMARY KEY, company_id text, actor_id text NOT NULL, actor_name text,
    action text NOT NULL, entity_type text NOT NULL, entity_id text, entity_label text, details jsonb, created_at text NOT NULL);
  CREATE TABLE IF NOT EXISTS break_change_requests (id text PRIMARY KEY, company_id text, employee_id text NOT NULL, date text NOT NULL,
    current_start_time text, current_end_time text, proposed_start_time text, proposed_end_time text, reason text,
    status text NOT NULL DEFAULT 'pending', requested_breaks jsonb NOT NULL, reviewed_by text, review_notes text,
    created_at text NOT NULL, updated_at text NOT NULL);
`);
await client.query(fs.readFileSync(path.join(ROOT, 'drizzle/0003_employee_breaks.sql'), 'utf8'));
await client.query(fs.readFileSync(path.join(ROOT, 'drizzle/0004_break_change_requests.sql'), 'utf8'));

await client.query(`INSERT INTO employees (id, code, name_ar, name_en, pin, role, status, shift_id, company_id, team_leader_id) VALUES
  ('emp-002', 'EMP002', 'Ahmed Mahmoud', 'Ahmed Mahmoud', '1234', 'admin', 'active', 'shift-1', 'tech-source', NULL),
  ('emp-011', 'EMP011', 'قائد الفريق', 'Team Leader', 'leader123', 'leader', 'active', 'shift-1', 'tech-source', NULL),
  ('emp-101', 'EMP101', 'مروة السيد', 'Marwa Elsayed', '1234', 'employee', 'active', 'shift-1', 'tech-source', 'emp-011'),
  ('emp-102', 'EMP102', 'كريم عبد الله', 'Karim Abdullah', '1234', 'employee', 'active', 'shift-1', 'tech-source', 'emp-011')`);
await client.query(`INSERT INTO shifts (id, company_id, name, start_time, end_time, duration_minutes, break_minutes, grace_period_minutes)
  VALUES ('shift-1', 'tech-source', 'Morning Shift', '09:00', '17:00', 480, 0, 10),
         ('shift-eve', 'tech-source', 'Evening Shift', '15:00', '23:00', 480, 0, 10)`);
const assignments = [];
for (const [emp, offIdx] of [['emp-101', 5], ['emp-102', 5]]) {
  WEEK.forEach((date, i) => {
    assignments.push({ employeeId: emp, date, shiftId: i === offIdx ? '' : 'shift-1', isOffDay: i === offIdx, assignedBy: 'emp-002', updatedAt: new Date().toISOString() });
  });
}
await client.query(`INSERT INTO settings (key, value) VALUES ('dailyShiftAssignments', $1)`, [JSON.stringify(assignments)]);

const DB_URL = `postgres://postgres:demopass@127.0.0.1:${PG_PORT}/techsource_iso`;
server = spawn('npx', ['tsx', 'server.ts'], {
  cwd: ROOT,
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, DATABASE_URL: DB_URL, PORT: String(PORT) },
});
server.stdout.on('data', (c) => process.stdout.write('[srv] ' + c));
server.stderr.on('data', (c) => process.stdout.write('[srv-err] ' + c));

async function waitForReady(timeoutMs = 120000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`server exited early`);
    try {
      const res = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(3000) });
      if (res.ok) return await res.json();
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('dev server not ready');
}

const shutdown = async (exitCode) => {
  try { server && server.kill('SIGTERM'); } catch {}
  try { client && await client.end(); } catch {}
  try { pg && await pg.stop(); } catch {}
  process.exit(exitCode);
};
process.on('SIGINT', () => shutdown(1));
process.on('SIGTERM', () => shutdown(1));

const j = (r) => r.json();
const auth = (id, pin) => ({ 'Content-Type': 'application/json', 'x-auth-employee-id': id, 'x-auth-pin': pin });
const post = (p, body, headers = {}) => fetch(BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) }).then(j);
const getNotifs = async (userId) => {
  const data = await fetch(`${BASE}/api/notifications?userId=${encodeURIComponent(userId)}`).then(j);
  return Array.isArray(data.notifications) ? data.notifications : [];
};
const types = (list) => list.map((n) => n.type).sort().join(',') || '(empty)';

try {
  await waitForReady();
  console.log(`\n== Isolation probe (plain tsx server.ts, port ${PORT}) ==`);

  const swapId = `swap-iso-${Date.now()}`;
  const swap = { id: swapId, requesterId: 'emp-101', targetEmployeeId: 'emp-102', date: D, requesterShiftId: 'shift-1', targetShiftId: 'shift-eve', requesterWasOff: false, targetWasOff: false, status: 'awaiting_target', createdAt: new Date().toISOString() };
  const subRes = await post('/api/sync', { shiftSwapRequests: [swap], notifications: [] });
  check('swap submit via /api/sync', subRes?.success === true);
  await new Promise((r) => setTimeout(r, 600));
  const targetNotifs1 = await getNotifs('emp-102');
  check('target got shift_swap_requested', targetNotifs1.some((n) => n.type === 'shift_swap_requested'), types(targetNotifs1));

  const swapPending = { ...swap, status: 'pending', reviewedAt: new Date().toISOString() };
  await post('/api/sync', { shiftSwapRequests: [swapPending], notifications: [] });
  await new Promise((r) => setTimeout(r, 600));
  const targetNotifs2 = await getNotifs('emp-102');
  check('target shift_swap_requested resolved after accept', !targetNotifs2.some((n) => n.type === 'shift_swap_requested'), types(targetNotifs2));
  const leaderNotifs2 = await getNotifs('emp-011');
  check('leader got shift_swap_accepted', leaderNotifs2.some((n) => n.type === 'shift_swap_accepted'), types(leaderNotifs2));

  const swapApproved = { ...swapPending, status: 'approved', reviewedBy: 'emp-002' };
  await post('/api/sync', { shiftSwapRequests: [swapApproved], notifications: [] });
  await new Promise((r) => setTimeout(r, 600));
  const leaderNotifs3 = await getNotifs('emp-011');
  check('leader reviewer notifs resolved after approval', !leaderNotifs3.some((n) => ['shift_swap_accepted', 'shift_swap_requested'].includes(n.type)), types(leaderNotifs3));
  const reqNotifs3 = await getNotifs('emp-101');
  check('requester got shift_changed', reqNotifs3.some((n) => n.type === 'shift_changed'), types(reqNotifs3));
  const targetNotifs3 = await getNotifs('emp-102');
  check('target got shift_changed', targetNotifs3.some((n) => n.type === 'shift_changed'), types(targetNotifs3));

  // DB ground truth
  const dbRows = await client.query('SELECT recipient_id, type, related_shift_swap_id FROM notifications ORDER BY created_at');
  console.log('  [db] notifications rows:', JSON.stringify(dbRows.rows));

  console.log(`\n== Isolation probe done: ${passed} passed, ${failed} failed ==`);
  await shutdown(failed ? 1 : 0);
} catch (error) {
  console.error('ISO PROBE ERROR:', error?.message || error);
  await shutdown(1);
}

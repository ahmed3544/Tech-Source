// Notification lifecycle probe: reproduces the full swap + break request
// flows against the REAL production path (workerd → cloudflare:node →
// Express → pg) and asserts that reviewer-side "pending review"
// notifications are resolved (deleted) the moment a request reaches a final
// state — plus the client resurrect path (NotificationsPage.respondToSwap
// re-emitting the original reviewer notification after the sync trigger
// deleted it).
//
// Usage: node scripts/notification-lifecycle-probe.mjs
import EmbeddedPostgres from 'embedded-postgres';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PG_PORT = 54341;
const WORKER_PORT = 8791;
const BASE = `http://127.0.0.1:${WORKER_PORT}`;
const DB_URL = `postgres://postgres:demopass@127.0.0.1:${PG_PORT}/techsource_probe`;

let pg;
let wrangler;
let passed = 0;
let failed = 0;
const check = (name, ok, extra = '') => {
  if (ok) { passed++; console.log(`  PASS ${name}${extra ? ` — ${extra}` : ''}`); }
  else { failed++; console.log(`  FAIL ${name}${extra ? ` — ${extra}` : ''}`); }
};

const today = new Date();
const sunday = new Date(today); sunday.setHours(0, 0, 0, 0); sunday.setDate(sunday.getDate() - sunday.getDay());
const d = (i) => { const x = new Date(sunday); x.setDate(x.getDate() + i); return x.toISOString().slice(0, 10); };
const WEEK = Array.from({ length: 7 }, (_, i) => d(i));
const D = WEEK[3]; // Thursday of the demo week

// ---------- 1. Embedded PostgreSQL + schema + seed (same as cloudflare-e2e) ----------
pg = new EmbeddedPostgres({
  databaseDir: `/tmp/tech-source-notif-probe-pg-${Date.now()}`,
  user: 'postgres',
  password: 'demopass',
  port: PG_PORT,
  persistent: false,
});
await pg.initialise();
await pg.start();
await pg.createDatabase('techsource_probe');
const client = pg.getPgClient('techsource_probe');
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
    status text NOT NULL DEFAULT 'pending', requested_by text, reviewed_by text, reviewed_at text, review_notes text,
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

// ---------- 2. Temp wrangler config ----------
const repoConfig = fs.readFileSync(path.join(ROOT, 'wrangler.jsonc'), 'utf8').replace(/^\s*\/\/.*$/gm, '');
const config = JSON.parse(repoConfig);
delete config.hyperdrive;
delete config.previews;
config.vars = { DATABASE_URL: DB_URL };
const configPath = path.join(ROOT, 'wrangler.notif-probe.jsonc');
fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

// ---------- 3. Start wrangler dev ----------
wrangler = spawn('npx', ['wrangler', 'dev', '--port', String(WORKER_PORT), '--config', configPath], {
  cwd: ROOT,
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, CI: '1', WRANGLER_SEND_METRICS: 'false', DATABASE_URL: DB_URL },
});
let bootLog = '';
wrangler.stdout.on('data', (c) => { bootLog += c; });
wrangler.stderr.on('data', (c) => { bootLog += c; });
wrangler.on('exit', (code) => { if (code !== null && code !== 0) console.log(`[wrangler exited code=${code}]`); });

async function waitForReady(timeoutMs = 240000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (wrangler.exitCode !== null) throw new Error(`wrangler exited early:\n${bootLog.slice(-3000)}`);
    try {
      const res = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(4000) });
      if (res.ok) return await res.json();
    } catch { /* not ready yet */ }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`wrangler dev not ready in ${timeoutMs}ms:\n${bootLog.slice(-3000)}`);
}

const shutdown = async (exitCode) => {
  try { wrangler && wrangler.kill('SIGTERM'); } catch {}
  try { client && await client.end(); } catch {}
  try { pg && await pg.stop(); } catch {}
  try { fs.unlinkSync(configPath); } catch {}
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
const types = (list) => list.map((n) => n.type).sort().join(',');

try {
  await waitForReady();
  console.log(`\n== Notification lifecycle probe (port ${WORKER_PORT}) ==`);

  // ============ SWAP FLOW ============
  // Step 1: emp-101 submits swap → emp-102 target (exactly ShiftSwapPanel.submit)
  const swapId = `swap-probe-${Date.now()}`;
  const now0 = new Date().toISOString();
  const swap = { id: swapId, requesterId: 'emp-101', targetEmployeeId: 'emp-102', date: D, requesterShiftId: 'shift-1', targetShiftId: 'shift-eve', requesterWasOff: false, targetWasOff: false, status: 'awaiting_target', createdAt: now0 };
  const subRes = await post('/api/sync', { shiftSwapRequests: [swap], notifications: [] });
  check('swap submit via /api/sync', subRes?.success === true, `status=${subRes?.success}`);
  await new Promise((r) => setTimeout(r, 800));
  const targetNotifs1 = await getNotifs('emp-102');
  check('target got shift_swap_requested', targetNotifs1.some((n) => n.type === 'shift_swap_requested' && (n.relatedShiftSwapId === swapId || !n.relatedShiftSwapId)), types(targetNotifs1));

  // Step 2: target accepts (NotificationsPage.respondToSwap path: sync first, THEN the
  // harmful re-emit of the original notification, then additions)
  const swapPending = { ...swap, status: 'pending', reviewedAt: new Date().toISOString() };
  const accRes = await post('/api/sync', { shiftSwapRequests: [swapPending], notifications: [] });
  check('target accept via /api/sync', accRes?.success === true);
  await new Promise((r) => setTimeout(r, 800));
  const targetNotifs2 = await getNotifs('emp-102');
  check('target shift_swap_requested resolved after accept', !targetNotifs2.some((n) => n.type === 'shift_swap_requested'), types(targetNotifs2));
  const leaderNotifs2 = await getNotifs('emp-011');
  check('leader got shift_swap_accepted', leaderNotifs2.some((n) => n.type === 'shift_swap_accepted'), types(leaderNotifs2));

  // Step 2b: REPRODUCE the client resurrect — respondToSwap re-emits the original
  // reviewer notification (isRead: true) AFTER the trigger deleted it. The read
  // sweep (listForUser) must keep such rows invisible regardless.
  const originalTargetNotif = targetNotifs1.find((n) => n.type === 'shift_swap_requested');
  if (originalTargetNotif) {
    const emitRes = await post('/api/notifications/emit', { notification: { ...originalTargetNotif, isRead: true, updatedAt: new Date().toISOString() } });
    check('resurrect emit accepted by API (repro precondition)', emitRes?.success === true);
    const targetNotifs2b = await getNotifs('emp-102');
    const resurrected = targetNotifs2b.some((n) => n.type === 'shift_swap_requested');
    check('resurrected reviewer row stays invisible (read sweep guard)', !resurrected, types(targetNotifs2b));
  }

  // Step 3a: leader approves (ShiftSwapPanel.review path — STAGE 2). No
  // schedule write: the request routes to Real Time Management (pending_rtm).
  const swapRtm = { ...swapPending, status: 'pending_rtm', reviewedBy: 'emp-011', leaderReviewedBy: 'emp-011', reviewedAt: new Date().toISOString() };
  const rtmRes = await post('/api/sync', { shiftSwapRequests: [swapRtm], notifications: [] });
  check('leader approval (pending_rtm) via /api/sync', rtmRes?.success === true);
  await new Promise((r) => setTimeout(r, 800));
  const leaderNotifs3a = await getNotifs('emp-011');
  check('leader shift_swap_accepted resolved after leader approval', !leaderNotifs3a.some((n) => n.type === 'shift_swap_accepted' || n.type === 'shift_swap_requested'), types(leaderNotifs3a));
  const adminNotifs3a = await getNotifs('emp-002');
  check('RTM got shift_swap_leader_approved', adminNotifs3a.some((n) => n.type === 'shift_swap_leader_approved'), types(adminNotifs3a));
  const reqNotifs3a = await getNotifs('emp-101');
  check('requester told the swap is with RTM', reqNotifs3a.some((n) => n.type === 'shift_swap_leader_approved'), types(reqNotifs3a));

  // Step 3b: RTM (emp-002) FINAL approval (ShiftSwapPanel.reviewRtm path):
  // schedule rows via /api/schedule-sync, then /api/sync 'approved'.
  const adminAuth = auth('emp-002', '1234');
  const dataNow = await fetch(`${BASE}/api/data`).then(j);
  const rowA = (dataNow.dailyShiftAssignments || []).find((x) => x.employeeId === 'emp-101' && x.date === D);
  const rowB = (dataNow.dailyShiftAssignments || []).find((x) => x.employeeId === 'emp-102' && x.date === D);
  const nextA = { ...rowA, shiftId: 'shift-eve', isOffDay: false, assignedBy: 'emp-002', updatedAt: new Date().toISOString() };
  const nextB = { ...rowB, shiftId: 'shift-1', isOffDay: false, assignedBy: 'emp-002', updatedAt: new Date().toISOString() };
  const swapApproved = { ...swapRtm, status: 'approved', rtmReviewedBy: 'emp-002', reviewedAt: new Date().toISOString() };
  const schedRes = await post('/api/schedule-sync', { dailyShiftAssignments: [nextA, nextB], syncTimestamp: new Date().toISOString(), source: 'shift-swap' }, adminAuth);
  check('RTM swap rows via /api/schedule-sync', schedRes?.success === true, `status=${schedRes?.success}`);
  const apprRes = await post('/api/sync', { shiftSwapRequests: [swapApproved], notifications: [] });
  check('RTM final approval via /api/sync', apprRes?.success === true);
  await new Promise((r) => setTimeout(r, 800));

  const leaderNotifs3 = await getNotifs('emp-011');
  check('leader reviewer copies resolved after final approval', !leaderNotifs3.some((n) => n.type === 'shift_swap_accepted' || n.type === 'shift_swap_requested' || n.type === 'shift_swap_leader_approved'), types(leaderNotifs3));
  const adminNotifs3b = await getNotifs('emp-002');
  check('RTM shift_swap_leader_approved resolved after final approval', !adminNotifs3b.some((n) => n.type === 'shift_swap_leader_approved'), types(adminNotifs3b));
  const reqNotifs3 = await getNotifs('emp-101');
  check('requester got shift_changed', reqNotifs3.some((n) => n.type === 'shift_changed'), types(reqNotifs3));
  const targetNotifs3 = await getNotifs('emp-102');
  check('target got shift_changed', targetNotifs3.some((n) => n.type === 'shift_changed'), types(targetNotifs3));
  check('no reviewer-type residue for target after approval', !targetNotifs3.some((n) => ['shift_swap_requested', 'shift_swap_accepted', 'shift_swap_leader_approved'].includes(n.type)), types(targetNotifs3));

  // ============ BREAK FLOW ============
  const brkAuth = auth('emp-101', '1234');
  const brkRes = await post('/api/break-request', {
    employeeId: 'emp-101', date: D, currentStartTime: '13:30', currentEndTime: '13:50',
    proposedStartTime: '14:00', proposedEndTime: '14:20', reason: 'probe',
  }, brkAuth);
  check('break request submitted', brkRes?.success === true, JSON.stringify(brkRes).slice(0, 120));
  await new Promise((r) => setTimeout(r, 800));
  const adminNotifs4 = await getNotifs('emp-002');
  // Recipients are the employee's TEAM LEADER (emp-011), not the admin pool —
  // emp-002 must NOT receive a copy.
  check('admin got NO break_request_requested (team-leader routing)', !adminNotifs4.some((n) => n.type === 'break_request_requested'), types(adminNotifs4));
  const leaderNotifs4 = await getNotifs('emp-011');
  check('leader got break_request_requested (team)', leaderNotifs4.some((n) => n.type === 'break_request_requested'), types(leaderNotifs4));

  const reviewRes = await post('/api/break-request-review', { id: brkRes.request?.id, action: 'approve' }, adminAuth);
  check('break request approved', reviewRes?.success === true, JSON.stringify(reviewRes).slice(0, 160));
  await new Promise((r) => setTimeout(r, 800));
  const adminNotifs5 = await getNotifs('emp-002');
  check('admin break_request_requested resolved after review', !adminNotifs5.some((n) => n.type === 'break_request_requested'), types(adminNotifs5));
  const leaderNotifs5 = await getNotifs('emp-011');
  check('leader break_request_requested resolved after review', !leaderNotifs5.some((n) => n.type === 'break_request_requested'), types(leaderNotifs5));
  const empNotifs5 = await getNotifs('emp-101');
  check('employee got break_request_approved', empNotifs5.some((n) => n.type === 'break_request_approved'), types(empNotifs5));

  console.log(`\n== Probe done: ${passed} passed, ${failed} failed ==`);
  await shutdown(failed ? 1 : 0);
} catch (error) {
  console.error('PROBE ERROR:', error?.message || error);
  console.error((bootLog || '').slice(-2000));
  await shutdown(1);
}

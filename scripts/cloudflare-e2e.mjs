// Cloudflare Workers end-to-end test: boots an embedded PostgreSQL, then runs
// the FULL Express backend inside a local workerd via `wrangler dev` with a
// Hyperdrive binding that points at the local database. This validates the
// exact production path: Worker → cloudflare:node → Express (bundled) →
// Hyperdrive → PostgreSQL.
//
// Usage: node scripts/cloudflare-e2e.mjs
// Exits 0 when every assertion passes.
import EmbeddedPostgres from 'embedded-postgres';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PG_PORT = 54333;
const WORKER_PORT = 8787;
const BASE = `http://127.0.0.1:${WORKER_PORT}`;
const DB_URL = `postgres://postgres:demopass@127.0.0.1:${PG_PORT}/techsource_e2e`;

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

// ---------- 1. Embedded PostgreSQL + schema + seed ----------
pg = new EmbeddedPostgres({
  databaseDir: `/tmp/tech-source-cf-e2e-pg-${Date.now()}`,
  user: 'postgres',
  password: 'demopass',
  port: PG_PORT,
  persistent: false,
});
await pg.initialise();
await pg.start();
await pg.createDatabase('techsource_e2e');
const client = pg.getPgClient('techsource_e2e');
await client.connect();

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
  CREATE TABLE IF NOT EXISTS activity_logs (id text PRIMARY KEY, company_id text, actor_id text NOT NULL, actor_name text,
    action text NOT NULL, entity_type text NOT NULL, entity_id text, entity_label text, details jsonb, created_at text NOT NULL);
  CREATE TABLE IF NOT EXISTS break_change_requests (id text PRIMARY KEY, company_id text, employee_id text NOT NULL, date text NOT NULL,
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
await client.query(`INSERT INTO employee_breaks (id, company_id, employee_id, date, name, name_ar, name_en, start_time, end_time, duration_minutes, created_at, updated_at) VALUES
  ('brk-101-a', 'tech-source', 'emp-101', $1, NULL, 'استراحة الصلاة', 'Prayer Break', '13:30', '13:50', 20, now()::text, now()::text)`, [WEEK[2]]);

// ---------- 2. Temp wrangler config in the repo root ----------
// wrangler resolves relative paths (main, assets.directory) against the
// config file location, so the temp config must live in the repo root.
// Wrangler 4 no longer accepts a hyperdrive "connectionString", and the
// local simulation cannot reach the embedded database through a real
// Hyperdrive binding anyway. cloudflare-worker-env.ts falls back to a plain
// DATABASE_URL variable when no HYPERDRIVE binding exists, which exercises
// the identical code path (Worker → cloudflare:node → Express → pg Pool).
const repoConfig = fs.readFileSync(path.join(ROOT, 'wrangler.jsonc'), 'utf8')
  .replace(/^\s*\/\/.*$/gm, '');
const config = JSON.parse(repoConfig);
delete config.hyperdrive;
delete config.previews;
config.vars = { DATABASE_URL: DB_URL };
const configPath = path.join(ROOT, 'wrangler.e2e.jsonc');
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

const j = (res) => res.json();
const authHeaders = (pin = '1234') => ({ 'Content-Type': 'application/json', 'x-auth-employee-id': 'emp-002', 'x-auth-pin': pin });

try {
  const health = await waitForReady();
  console.log('workerd ready:', JSON.stringify(health));
  console.log(`\n== Cloudflare Workers E2E (port ${WORKER_PORT}, pg ${PG_PORT}) ==`);

  // 1. Health reflects the Hyperdrive → PostgreSQL round-trip
  check('health: platform + database connected',
    health.status === 'ok' && health.platform === 'cloudflare-workers' && health.database === 'connected', JSON.stringify(health));

  // 2. Login via the full Express auth handler
  const loginRes = await fetch(`${BASE}/api/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: 'EMP002', password: '1234' }),
  }).then(j);
  check('login: EMP002/1234 succeeds', loginRes?.success === true && String(loginRes?.employee?.id) === 'emp-002',
    `role=${loginRes?.employee?.role}`);

  const badLogin = await fetch(`${BASE}/api/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: 'EMP002', password: '0000' }),
  });
  check('login: wrong pin rejected 401', badLogin.status === 401, `status=${badLogin.status}`);

  // 3. Data snapshot
  const dataRes = await fetch(`${BASE}/api/data`).then(j);
  check('data: snapshot complete',
    dataRes?.success === true && dataRes?.employees?.length === 4 && dataRes?.shifts?.length === 2
      && Array.isArray(dataRes?.notifications) && Array.isArray(dataRes?.officialHolidays)
      && dataRes?.officialHolidays?.length === 0,
    `employees=${dataRes?.employees?.length} shifts=${dataRes?.shifts?.length}`);
  check('data: pin never leaks', dataRes?.employees?.every((e) => !('pin' in e)) === true);

  // 4. Schedule sync GET (the polling endpoint)
  const syncGet = await fetch(`${BASE}/api/schedule-sync`).then(j);
  check('schedule-sync GET: 14 assignments incl. off day',
    syncGet?.success === true && syncGet?.dailyShiftAssignments?.length === 14
      && syncGet?.dailyShiftAssignments?.some((a) => a.isOffDay === true),
    `count=${syncGet?.dailyShiftAssignments?.length}`);

  // 5. Schedule sync POST (admin write)
  const modified = assignments.map((a) =>
    a.employeeId === 'emp-101' && a.date === WEEK[2] ? { ...a, shiftId: 'shift-eve', isOffDay: false, updatedAt: new Date().toISOString() } : a);
  const syncPost = await fetch(`${BASE}/api/schedule-sync`, {
    method: 'POST', headers: authHeaders(),
    body: JSON.stringify({ dailyShiftAssignments: modified }),
  }).then(j);
  const syncGet2 = await fetch(`${BASE}/api/schedule-sync`).then(j);
  const eve = syncGet2?.dailyShiftAssignments?.find((a) => a.employeeId === 'emp-101' && a.date === WEEK[2]);
  check('schedule-sync POST: admin can save, persisted',
    syncPost?.success === true && String(eve?.shiftId) === 'shift-eve', `persisted=${eve?.shiftId}`);

  const syncPostDenied = await fetch(`${BASE}/api/schedule-sync`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dailyShiftAssignments: [] }),
  });
  check('schedule-sync POST: unauthenticated rejected', syncPostDenied.status === 401, `status=${syncPostDenied.status}`);

  // 6. Attendance punch
  const punch = await fetch(`${BASE}/api/punch`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ employeeId: 'emp-102', action: 'check_in' }),
  }).then(j);
  check('punch: check_in accepted', punch?.success === true || punch?.record?.checkIn, JSON.stringify(punch).slice(0, 80));

  // 7. Employee-specific breaks (the endpoint that had the syntax error)
  const breaksGet = await fetch(`${BASE}/api/employee-breaks?employeeId=emp-101&from=${WEEK[0]}&to=${WEEK[6]}`).then(j);
  check('employee-breaks GET: seeded prayer break',
    breaksGet?.success === true && breaksGet?.breaksByDate?.[WEEK[2]]?.[0]?.startTime === '13:30',
    JSON.stringify(breaksGet?.breaksByDate || {}).slice(0, 60));

  const breaksPost = await fetch(`${BASE}/api/employee-breaks`, {
    method: 'POST', headers: authHeaders(),
    body: JSON.stringify({ employeeId: 'emp-102', date: WEEK[3], breaks: [{ nameAr: 'اختبار', nameEn: 'Test', startTime: '11:00', endTime: '11:30' }] }),
  }).then(j);
  const breaksGet2 = await fetch(`${BASE}/api/employee-breaks?employeeId=emp-102&from=${WEEK[3]}&to=${WEEK[3]}`).then(j);
  check('employee-breaks POST: saved + readable',
    breaksPost?.success === true && breaksGet2?.breaksByDate?.[WEEK[3]]?.[0]?.startTime === '11:00',
    JSON.stringify(breaksGet2?.breaksByDate || {}).slice(0, 60));

  // 8. Unmatched /api/* answers JSON 404 (not Express HTML)
  const missing = await fetch(`${BASE}/api/definitely-not-a-route`);
  const missingBody = await missing.json().catch(() => null);
  check('unmatched api: JSON 404 fallback',
    missing.status === 404 && missingBody?.error === 'not_found', `status=${missing.status} ct=${missing.headers.get('content-type')}`);

  // 9. Static assets served by the ASSETS binding
  const home = await fetch(`${BASE}/`);
  const homeHtml = await home.text();
  check('assets: SPA index served', home.status === 200 && homeHtml.includes('<div id="root">'), `status=${home.status} bytes=${homeHtml.length}`);

  console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.error('--- worker log tail (errors) ---');
    console.error(bootLog.split('\n').slice(-70).join('\n'));
  }
  await shutdown(failed === 0 ? 0 : 1);
} catch (error) {
  console.error('\nE2E ERROR:', error?.message || error);
  console.error('--- wrangler log tail ---');
  console.error(bootLog.slice(-4000));
  await shutdown(1);
}

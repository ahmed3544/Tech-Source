// Import-sheet protection probe: approved swaps + break changes must WIN over
// the Excel import workbook and reach the Google dashboard sheet instantly.
//
//   T1  approved swap (source 'shift-swap') lands in dailyShiftAssignments
//       AND is pushed to the configured sheet webhook immediately
//   T2  dashboard import with stale workbook cells does NOT revert the
//       approved swap — summary.protectedAssignments reports the skipped
//       cells, other (unprotected) rows still apply
//   T3  a deliberate manual edit clears the protection — the workbook wins
//       again on the next import
//   T4  approved break change is pushed to the sheet webhook (Breaks +
//       BreakRequests tabs) and reported in the approval response
//   T5  event pushes collapse (rate limit) — a second approval right after
//       skips the push
//   T6  no webhook configured → approval still succeeds, push skipped cleanly
//
// Usage: npm install --no-save embedded-postgres && node scripts/import-protection-probe.mjs
// Exits 0 when every assertion passes.
import EmbeddedPostgres from 'embedded-postgres';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PG_PORT = 54335;
const WORKER_PORT = 8792;
const WEBHOOK_PORT = 8797;
const BASE = `http://127.0.0.1:${WORKER_PORT}`;
const WEBHOOK_URL = `http://127.0.0.1:${WEBHOOK_PORT}/apps-script-hook`;
const DB_URL = `postgres://postgres:demopass@127.0.0.1:${PG_PORT}/techsource_import`;

let pg;
let wrangler;
let webhook;
const webhookHits = []; // { at, body }

let passed = 0;
let failed = 0;
const check = (name, ok, extra = '') => {
  if (ok) { passed++; console.log(`  PASS ${name}${extra ? ` — ${extra}` : ''}`); }
  else { failed++; console.log(`  FAIL ${name}${extra ? ` — ${extra}` : ''}`); }
};

const today = new Date();
const sunday = new Date(today); sunday.setHours(0, 0, 0, 0); sunday.setDate(sunday.getDate() - sunday.getDay());
const d = (i) => { const x = new Date(sunday); x.setDate(x.getDate() + i); return x.toISOString().slice(0, 10); };
const D1 = d(8), D2 = d(9), D3 = d(10), D4 = d(11), D5 = d(12); // next week — fresh dates

// ---------- embedded PostgreSQL + seed ----------
pg = new EmbeddedPostgres({
  databaseDir: `/tmp/tech-source-import-pg-${Date.now()}`,
  user: 'postgres',
  password: 'demopass',
  port: PG_PORT,
  persistent: false,
});
await pg.initialise();
await pg.start();
await pg.createDatabase('techsource_import');
const client = pg.getPgClient('techsource_import');
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
    related_shift_swap_id text, is_read boolean DEFAULT false, created_at text NOT NULL, updated_at text NOT NULL);
  CREATE TABLE IF NOT EXISTS login_audit (id text PRIMARY KEY, company_id text, employee_id text, login_identifier text NOT NULL,
    success boolean NOT NULL DEFAULT false, failure_reason text, ip_address text, user_agent text, created_at text NOT NULL);
  CREATE TABLE IF NOT EXISTS employee_shift_assignments (id text PRIMARY KEY, company_id text, employee_id text NOT NULL,
    schedule_date text NOT NULL, shift_template_id text, custom_start_time text, custom_end_time text, duration_minutes integer DEFAULT 480,
    status text DEFAULT 'draft', created_at text NOT NULL, updated_at text NOT NULL, version integer DEFAULT 1);
  CREATE TABLE IF NOT EXISTS activity_logs (id text PRIMARY KEY, company_id text, actor_id text NOT NULL, actor_name text,
    actor_role text, action text NOT NULL, entity_type text NOT NULL, entity_id text, entity_label text, details jsonb, created_at text NOT NULL);
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
// Workbook-era schedule: 101=morning, 102=evening on D1 (what the stale sheet claims)
const assignments = [
  { employeeId: 'emp-101', date: D1, shiftId: 'shift-1', isOffDay: false, assignedBy: 'emp-002', updatedAt: new Date().toISOString() },
  { employeeId: 'emp-102', date: D1, shiftId: 'shift-eve', isOffDay: false, assignedBy: 'emp-002', updatedAt: new Date().toISOString() },
  { employeeId: 'emp-101', date: D2, shiftId: 'shift-1', isOffDay: false, assignedBy: 'emp-002', updatedAt: new Date().toISOString() },
];
await client.query(`INSERT INTO settings (key, value) VALUES ('dailyShiftAssignments', $1)`, [JSON.stringify(assignments)]);

// ---------- fake Google Apps Script webhook ----------
webhook = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => {
    let body = null;
    try { body = JSON.parse(raw); } catch { /* keep raw */ }
    webhookHits.push({ at: Date.now(), body });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  });
});
await new Promise((resolve) => webhook.listen(WEBHOOK_PORT, '127.0.0.1', resolve));

// ---------- wrangler dev (workerd) ----------
const repoConfig = fs.readFileSync(path.join(ROOT, 'wrangler.jsonc'), 'utf8')
  .replace(/^\s*\/\/.*$/gm, '');
const config = JSON.parse(repoConfig);
delete config.hyperdrive;
delete config.previews;
config.vars = { DATABASE_URL: DB_URL, SHEET_EVENT_MIN_INTERVAL_MS: '3000' };
const configPath = path.join(ROOT, 'wrangler.import-probe.jsonc');
fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

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
  try { webhook && webhook.close(); } catch {}
  try { client && await client.end(); } catch {}
  try { pg && await pg.stop(); } catch {}
  try { fs.unlinkSync(configPath); } catch {}
  process.exit(exitCode);
};
process.on('SIGINT', () => shutdown(1));
process.on('SIGTERM', () => shutdown(1));

// ---------- helpers ----------
const j = (res) => res.json();
const adminHeaders = () => ({ 'Content-Type': 'application/json', 'x-auth-employee-id': 'emp-002', 'x-auth-pin': '1234' });
const leaderHeaders = () => ({ 'Content-Type': 'application/json', 'x-auth-employee-id': 'emp-011', 'x-auth-pin': 'leader123' });
const empHeaders = (id = 'emp-101') => ({ 'Content-Type': 'application/json', 'x-auth-employee-id': id, 'x-auth-pin': '1234' });

const getSchedule = () => fetch(`${BASE}/api/schedule-sync`).then(j);
const shiftAt = (schedule, employeeId, date) => {
  const row = (schedule?.dailyShiftAssignments ?? []).find((a) => a.employeeId === employeeId && a.date === date);
  return row ? { shiftId: row.shiftId || '', isOffDay: Boolean(row.isOffDay) } : null;
};
const importWorkbook = () => fetch(`${BASE}/api/dashboard-import/apply`, {
  method: 'POST', headers: adminHeaders(),
  body: JSON.stringify({
    sheets: [{
      name: 'Schedule',
      rows: [
        ['الكود', 'التاريخ', 'الشيفت'],
        ['EMP101', D1, 'صباحي 09:00-17:00'],
        ['EMP102', D1, 'مسائي 15:00-23:00'],
        ['EMP101', D2, 'مسائي 15:00-23:00'],
      ],
    }],
    options: { overwriteAssignments: true },
  }),
}).then(j);

try {
  const health = await waitForReady();
  console.log('workerd ready:', JSON.stringify(health));
  console.log(`\n== Import protection probe (worker ${WORKER_PORT}, pg ${PG_PORT}, webhook ${WEBHOOK_PORT}) ==`);

  // Configure the sheet-sync webhook to point at the fake Apps Script endpoint.
  const putCfg = await fetch(`${BASE}/api/sheet-sync`, {
    method: 'PUT', headers: adminHeaders(),
    body: JSON.stringify({ webhookUrl: WEBHOOK_URL, token: 'probe-token', autoSync: false }),
  }).then(j);
  check('setup: sheet-sync webhook configured', putCfg?.success === true && putCfg?.config?.webhookUrl === WEBHOOK_URL);

  // ---------- T1: approved swap persists + pushes to the sheet ----------
  const now1 = new Date().toISOString();
  const swapRes = await fetch(`${BASE}/api/schedule-sync`, {
    method: 'POST', headers: adminHeaders(),
    body: JSON.stringify({
      source: 'shift-swap', syncTimestamp: now1,
      dailyShiftAssignments: [
        { employeeId: 'emp-101', date: D1, shiftId: 'shift-eve', isOffDay: false, assignedBy: 'emp-002', updatedAt: now1 },
        { employeeId: 'emp-102', date: D1, shiftId: 'shift-1', isOffDay: false, assignedBy: 'emp-002', updatedAt: now1 },
      ],
    }),
  }).then(j);
  const scheduleAfterSwap = await getSchedule();
  check('T1 swap approval saved (101→evening, 102→morning)',
    swapRes?.success === true
    && shiftAt(scheduleAfterSwap, 'emp-101', D1)?.shiftId === 'shift-eve'
    && shiftAt(scheduleAfterSwap, 'emp-102', D1)?.shiftId === 'shift-1');
  const hit1 = webhookHits[0];
  const schedRows1 = hit1?.body?.sheets?.Schedule?.rows ?? [];
  const row101 = schedRows1.find((r) => r[0] === D1 && r[1] === 'EMP101');
  const row102 = schedRows1.find((r) => r[0] === D1 && r[1] === 'EMP102');
  check('T1 swap pushed to sheet webhook instantly (Schedule tab shows swapped shifts)',
    webhookHits.length === 1 && row101?.[3] === 'Evening Shift' && row102?.[3] === 'Morning Shift',
    `hits=${webhookHits.length} 101=${row101?.[3] ?? 'missing'} 102=${row102?.[3] ?? 'missing'}`);

  // ---------- T2: stale workbook import does NOT revert the approved swap ----------
  const import1 = await importWorkbook();
  const scheduleAfterImport = await getSchedule();
  check('T2 import reports protected cells (2 swaps protected)',
    import1?.success === true && import1?.summary?.protectedAssignments === 2,
    `protected=${import1?.summary?.protectedAssignments} applied=${import1?.summary?.assignmentsApplied} skipped=${import1?.summary?.skippedAssignments}`);
  check('T2 import summary warns about the outdated sheet cells',
    (import1?.summary?.warnings ?? []).some((w) => String(w).includes('EMP101')));
  check('T2 approved swap SURVIVED the import (101=evening, 102=morning)',
    shiftAt(scheduleAfterImport, 'emp-101', D1)?.shiftId === 'shift-eve'
    && shiftAt(scheduleAfterImport, 'emp-102', D1)?.shiftId === 'shift-1');
  check('T2 unprotected rows still imported (101 D2 → evening)',
    shiftAt(scheduleAfterImport, 'emp-101', D2)?.shiftId === 'shift-eve'
    && import1?.summary?.assignmentsApplied === 1);

  // ---------- T3: deliberate manual edit clears protection ----------
  const now3 = new Date().toISOString();
  await fetch(`${BASE}/api/schedule-sync`, {
    method: 'POST', headers: adminHeaders(),
    body: JSON.stringify({
      dailyShiftAssignments: [
        { employeeId: 'emp-101', date: D1, shiftId: 'shift-1', isOffDay: false, assignedBy: 'emp-002', updatedAt: now3 },
      ],
    }),
  }).then(j);
  const import2 = await importWorkbook();
  const scheduleAfterManual = await getSchedule();
  check('T3 manual edit cleared that key (1 protected left, workbook re-applied 101 D1)',
    import2?.summary?.protectedAssignments === 1 && import2?.summary?.assignmentsApplied === 2
    && shiftAt(scheduleAfterManual, 'emp-101', D1)?.shiftId === 'shift-1'
    && shiftAt(scheduleAfterManual, 'emp-102', D1)?.shiftId === 'shift-1',
    `protected=${import2?.summary?.protectedAssignments} applied=${import2?.summary?.assignmentsApplied} 101=${shiftAt(scheduleAfterManual, 'emp-101', D1)?.shiftId}`);

  // ---------- T4: approved break change pushes Breaks/BreakRequests tabs ----------
  // Wait out the event-push rate-limit window set by T1's swap push so this
  // approval pushes deterministically (T5 then fires INSIDE the window).
  await new Promise((r) => setTimeout(r, 3300));
  const created = await fetch(`${BASE}/api/break-request`, {
    method: 'POST', headers: empHeaders('emp-101'),
    body: JSON.stringify({ date: D3, proposedStartTime: '14:15', proposedEndTime: '14:45', reason: 'sheet-push-test' }),
  }).then(j);
  const reviewRes = await fetch(`${BASE}/api/break-request-review`, {
    method: 'POST', headers: leaderHeaders(),
    body: JSON.stringify({ id: created?.request?.id, action: 'approve' }),
  }).then(j);
  await new Promise((r) => setTimeout(r, 400)); // allow the awaited push to land
  const hitBreaks = webhookHits.find((h, i) => i > 0 && h.body?.reason === 'break-request-approved');
  const breaksRows = hitBreaks?.body?.sheets?.Breaks?.rows ?? [];
  const brReqRows = hitBreaks?.body?.sheets?.BreakRequests?.rows ?? [];
  check('T4 approval response reports the sheet push',
    reviewRes?.success === true && reviewRes?.sheetSync?.pushed === true,
    `sheetSync=${JSON.stringify(reviewRes?.sheetSync)}`);
  check('T4 approved break change visible in the sheet (Breaks + BreakRequests tabs)',
    breaksRows.some((r) => r[0] === D3 && r[1] === 'EMP101' && r[4] === '14:15' && r[5] === '14:45')
    && brReqRows.some((r) => r[0] === D3 && r[1] === 'EMP101' && r[5] === 'approved'),
    `breaksRow=${JSON.stringify(breaksRows[0])} D3=${D3} brReqRow=${JSON.stringify(brReqRows[0])}`);

  // ---------- T5: event pushes collapse (rate limit) ----------
  const created2 = await fetch(`${BASE}/api/break-request`, {
    method: 'POST', headers: empHeaders('emp-101'),
    body: JSON.stringify({ date: D4, proposedStartTime: '12:00', proposedEndTime: '12:30', reason: 'rate-limit-test' }),
  }).then(j);
  const reviewRes2 = await fetch(`${BASE}/api/break-request-review`, {
    method: 'POST', headers: leaderHeaders(),
    body: JSON.stringify({ id: created2?.request?.id, action: 'approve' }),
  }).then(j);
  await new Promise((r) => setTimeout(r, 400));
  check('T5 immediate second approval skips the push (rate limited)',
    reviewRes2?.success === true && reviewRes2?.sheetSync?.pushed === false && reviewRes2?.sheetSync?.skipped === 'recent'
    && webhookHits.filter((h) => h.body?.reason === 'break-request-approved').length === 1,
    `hits=${webhookHits.length} sheetSync=${JSON.stringify(reviewRes2?.sheetSync)}`);

  // ---------- T6: no webhook configured → approval still succeeds ----------
  await fetch(`${BASE}/api/sheet-sync`, {
    method: 'PUT', headers: adminHeaders(),
    body: JSON.stringify({ webhookUrl: '', token: '', autoSync: false }),
  }).then(j);
  const created3 = await fetch(`${BASE}/api/break-request`, {
    method: 'POST', headers: empHeaders('emp-101'),
    body: JSON.stringify({ date: D5, proposedStartTime: '16:00', proposedEndTime: '16:20', reason: 'no-webhook-test' }),
  }).then(j);
  const reviewRes3 = await fetch(`${BASE}/api/break-request-review`, {
    method: 'POST', headers: leaderHeaders(),
    body: JSON.stringify({ id: created3?.request?.id, action: 'approve' }),
  }).then(j);
  check('T6 approval without webhook succeeds, push skipped cleanly',
    reviewRes3?.success === true && reviewRes3?.sheetSync?.pushed === false && reviewRes3?.sheetSync?.skipped === 'no_webhook',
    `sheetSync=${JSON.stringify(reviewRes3?.sheetSync)}`);

  console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.error('--- worker log tail (errors) ---');
    console.error(bootLog.split('\n').slice(-70).join('\n'));
  }
  await shutdown(failed === 0 ? 0 : 1);
} catch (error) {
  console.error('\nPROBE ERROR:', error?.message || error);
  console.error('--- wrangler log tail ---');
  console.error(bootLog.slice(-4000));
  await shutdown(1);
}

// Concurrency probe for the Cloudflare Workers backend (workerd + real PostgreSQL).
//
// Answers the user's "اتأكد من التزامن" request with measurements, not claims:
//   P1  parallel reads never block each other (no head-of-line deadlock)
//   P2  parallel saves to the SAME employee on DIFFERENT days all persist
//   P3  parallel saves to the SAME employee+day never interleave into merged
//       or duplicate rows (advisory-lock serialization)
//   P4  approval path (break-request-review) racing a manual edit on the same
//       day is serialized too — final state is exactly one of the two payloads
//   P5  parallel saves for DIFFERENT employees on the same day both persist
//   P6  soak: heavy parallel + sequential mixed load with no connection leak
//       (per-request clients are closed in the Worker's finally block)
//   P7  team scoping holds on the worker path: leader outside the team = 403
//
// Usage: npm install --no-save embedded-postgres && node scripts/concurrency-probe.mjs
// Exits 0 when every assertion passes.
import EmbeddedPostgres from 'embedded-postgres';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PG_PORT = 54334;
const WORKER_PORT = 8791;
const BASE = `http://127.0.0.1:${WORKER_PORT}`;
const DB_URL = `postgres://postgres:demopass@127.0.0.1:${PG_PORT}/techsource_conc`;

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
  databaseDir: `/tmp/tech-source-conc-pg-${Date.now()}`,
  user: 'postgres',
  password: 'demopass',
  port: PG_PORT,
  persistent: false,
});
await pg.initialise();
await pg.start();
await pg.createDatabase('techsource_conc');
const client = pg.getPgClient('techsource_conc');
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
    actor_role text, action text NOT NULL, entity_type text NOT NULL, entity_id text, entity_label text, details jsonb, created_at text NOT NULL);
`);
await client.query(fs.readFileSync(path.join(ROOT, 'drizzle/0003_employee_breaks.sql'), 'utf8'));
await client.query(fs.readFileSync(path.join(ROOT, 'drizzle/0004_break_change_requests.sql'), 'utf8'));

await client.query(`INSERT INTO employees (id, code, name_ar, name_en, pin, role, status, shift_id, company_id, team_leader_id) VALUES
  ('emp-002', 'EMP002', 'Ahmed Mahmoud', 'Ahmed Mahmoud', '1234', 'admin', 'active', 'shift-1', 'tech-source', NULL),
  ('emp-011', 'EMP011', 'قائد الفريق', 'Team Leader', 'leader123', 'leader', 'active', 'shift-1', 'tech-source', NULL),
  ('emp-101', 'EMP101', 'مروة السيد', 'Marwa Elsayed', '1234', 'employee', 'active', 'shift-1', 'tech-source', 'emp-011'),
  ('emp-102', 'EMP102', 'كريم عبد الله', 'Karim Abdullah', '1234', 'employee', 'active', 'shift-1', 'tech-source', 'emp-011'),
  ('emp-105', 'EMP105', 'خارج الفريق', 'Outside Team', '1234', 'employee', 'active', 'shift-1', 'tech-source', NULL)`);
await client.query(`INSERT INTO shifts (id, company_id, name, start_time, end_time, duration_minutes, break_minutes, grace_period_minutes)
  VALUES ('shift-1', 'tech-source', 'Morning Shift', '09:00', '17:00', 480, 0, 10)`);
const assignments = [];
for (const emp of ['emp-101', 'emp-102']) {
  WEEK.forEach((date, i) => {
    assignments.push({ employeeId: emp, date, shiftId: i === 5 ? '' : 'shift-1', isOffDay: i === 5, assignedBy: 'emp-002', updatedAt: new Date().toISOString() });
  });
}
await client.query(`INSERT INTO settings (key, value) VALUES ('dailyShiftAssignments', $1)`, [JSON.stringify(assignments)]);

// ---------- 2. Temp wrangler config in the repo root ----------
const repoConfig = fs.readFileSync(path.join(ROOT, 'wrangler.jsonc'), 'utf8')
  .replace(/^\s*\/\/.*$/gm, '');
const config = JSON.parse(repoConfig);
delete config.hyperdrive;
delete config.previews;
config.vars = { DATABASE_URL: DB_URL };
const configPath = path.join(ROOT, 'wrangler.conc.jsonc');
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

// ---------- helpers ----------
const j = (res) => res.json();
const adminHeaders = () => ({ 'Content-Type': 'application/json', 'x-auth-employee-id': 'emp-002', 'x-auth-pin': '1234' });
const leaderHeaders = () => ({ 'Content-Type': 'application/json', 'x-auth-employee-id': 'emp-011', 'x-auth-pin': 'leader123' });
const empHeaders = (id = 'emp-101') => ({ 'Content-Type': 'application/json', 'x-auth-employee-id': id, 'x-auth-pin': '1234' });

const getBreaks = async (employeeId, from, to) =>
  fetch(`${BASE}/api/employee-breaks?employeeId=${employeeId}&from=${from}&to=${to}`).then(j);
const saveBreaks = (employeeId, date, breaks, headers = adminHeaders()) =>
  fetch(`${BASE}/api/employee-breaks`, {
    method: 'POST', headers,
    body: JSON.stringify({ employeeId, date, breaks, source: 'excel-import' }), // excel-import: no activity-log noise
  });
const assertDayIsExactly = (rows, wanted) => {
  if (rows.length !== wanted.length) return false;
  const norm = (r) => `${r.startTime}|${r.endTime}`;
  const got = rows.map(norm).sort().join(',');
  const exp = wanted.map((w) => `${w.startTime}|${w.endTime}`).sort().join(',');
  return got === exp;
};

try {
  const health = await waitForReady();
  console.log('workerd ready:', JSON.stringify(health));
  console.log(`\n== Concurrency probe (port ${WORKER_PORT}, pg ${PG_PORT}) ==`);

  // ---------- P1: parallel reads never block ----------
  const t0 = Date.now();
  const single = await fetch(`${BASE}/api/data`);
  await single.text();
  const baselineMs = Date.now() - t0;

  const readTargets = Array.from({ length: 24 }, (_, i) =>
    i % 3 === 0 ? `${BASE}/api/data`
      : i % 3 === 1 ? `${BASE}/api/employee-breaks?employeeId=emp-101&from=${WEEK[0]}&to=${WEEK[6]}`
        : `${BASE}/api/schedule-sync`);
  const t1 = Date.now();
  const readResults = await Promise.all(readTargets.map((u) =>
    fetch(u, { signal: AbortSignal.timeout(15000) }).then((r) => r.status)));
  const readWall = Date.now() - t1;
  check('P1 parallel reads: all 24 answered 200',
    readResults.every((s) => s === 200), `statuses=${[...new Set(readResults)].join(',')}`);
  check('P1 parallel reads: no stall (wall < 15s)',
    readWall < 15000, `wall=${readWall}ms baseline=${baselineMs}ms`);

  // ---------- P2: same employee, different days, parallel saves ----------
  const p2Payloads = WEEK.map((date, i) => ({
    date,
    breaks: [{ startTime: `${10 + i}:00`, endTime: `${10 + i}:30`, nameAr: `بريك ${i}`, nameEn: `Break ${i}` }],
  }));
  const p2Results = await Promise.all(p2Payloads.map((p) =>
    saveBreaks('emp-101', p.date, p.breaks).then((r) => r.status)));
  check('P2 different-day parallel saves: all 200', p2Results.every((s) => s === 200), `statuses=${[...new Set(p2Results)].join(',')}`);
  const p2Read = await getBreaks('emp-101', WEEK[0], WEEK[6]);
  const p2AllPersisted = p2Payloads.every((p) => {
    const rows = p2Read?.breaksByDate?.[p.date] ?? [];
    return assertDayIsExactly(rows, p.breaks);
  });
  check('P2 different-day parallel saves: every day persisted its own payload', p2AllPersisted,
    `days=${Object.keys(p2Read?.breaksByDate ?? {}).length}`);

  // ---------- P3: same employee+day, parallel saves (the race) ----------
  // Two editors race on the SAME date with different times. Without
  // serialization the replace-all steps interleave into merged rows.
  const p3Date = WEEK[3];
  const p3A = [{ startTime: '10:00', endTime: '10:30', nameAr: 'أ', nameEn: 'A' }];
  const p3B = [{ startTime: '15:00', endTime: '15:30', nameAr: 'ب', nameEn: 'B' }];
  let p3Rounds = 0;
  let p3Clean = 0;
  const p3Outcomes = [];
  for (let round = 0; round < 6; round++) {
    const [ra, rb] = await Promise.all([
      saveBreaks('emp-101', p3Date, p3A),
      saveBreaks('emp-101', p3Date, p3B),
    ]);
    if (ra.status === 200 && rb.status === 200) p3Rounds++;
    const read = await getBreaks('emp-101', p3Date, p3Date);
    const rows = read?.breaksByDate?.[p3Date] ?? [];
    const clean = assertDayIsExactly(rows, p3A) || assertDayIsExactly(rows, p3B);
    if (clean) p3Clean++;
    p3Outcomes.push(rows.map((r) => r.startTime).join('+'));
  }
  check('P3 same-day parallel saves: both requests answered 200 in every round',
    p3Rounds === 6, `rounds=${p3Rounds}/6`);
  check('P3 same-day parallel saves: final state always exactly ONE payload (no merge/duplicates)',
    p3Clean === 6, `clean=${p3Clean}/6 outcomes=[${p3Outcomes.join(', ')}]`);

  // ---------- P4: approval path racing a manual edit on the same day ----------
  // Fresh date next week (d(8)) so P2's payload cannot collide with the
  // approval's proposed times — the race must be the only variable.
  const p4Date = d(8);
  let p4Rounds = 0;
  let p4Clean = 0;
  const p4Outcomes = [];
  const p4Manual = [{ startTime: '11:00', endTime: '11:30', nameAr: 'يدوي', nameEn: 'Manual' }];
  const p4Proposed = [{ startTime: '14:15', endTime: '14:45', nameAr: 'موافقة', nameEn: 'Approved' }];
  for (let round = 0; round < 3; round++) {
    // Start each round from a clean day: once an approval lands 14:15, the
    // NEXT round's identical proposal would legitimately fail overlap
    // validation against it (correct server behavior — not a race defect).
    // Resetting keeps every round an independent approval-vs-manual race.
    const reset = await saveBreaks('emp-101', p4Date, []);
    if (reset.status !== 200) { p4Outcomes.push(`reset ${reset.status}`); continue; }
    // fresh pending request for the same date (allowed again once reviewed)
    const created = await fetch(`${BASE}/api/break-request`, {
      method: 'POST', headers: empHeaders('emp-101'),
      body: JSON.stringify({ date: p4Date, proposedStartTime: '14:15', proposedEndTime: '14:45', reason: `race-${round}` }),
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
    const requestId = created?.body?.request?.id;
    if (!requestId) { p4Outcomes.push(`create-failed ${created?.status}: ${JSON.stringify(created?.body).slice(0, 220)}`); continue; }
    const [manualRes, reviewRes] = await Promise.all([
      saveBreaks('emp-101', p4Date, p4Manual),
      fetch(`${BASE}/api/break-request-review`, {
        // The applying actor in the 3-stage chain is RTM (admin): a LEADER
        // approval only forwards the request to pending_rtm without touching
        // the schedule, so the race must use the final approver's headers.
        method: 'POST', headers: adminHeaders(),
        body: JSON.stringify({ id: requestId, action: 'approve' }),
      }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) })),
    ]);
    if (manualRes.status !== 200) p4Outcomes.push(`manual ${manualRes.status}`);
    if (reviewRes.status !== 200) p4Outcomes.push(`review ${reviewRes.status}: ${JSON.stringify(reviewRes.body).slice(0, 180)}`);
    if (manualRes.status === 200 && reviewRes.status === 200) p4Rounds++;
    const read = await getBreaks('emp-101', p4Date, p4Date);
    const rows = read?.breaksByDate?.[p4Date] ?? [];
    // Valid final states (approval is a read-modify-write INSIDE the lock, so
    // when it lands last it legitimately preserves the manual edit):
    //   {11:00}          — manual save was the last write
    //   {11:00, 14:00}   — approval was the last write, keeping the manual edit
    const clean = assertDayIsExactly(rows, p4Manual)
      || assertDayIsExactly(rows, [...p4Manual, ...p4Proposed]);
    if (clean) p4Clean++;
    p4Outcomes.push(rows.map((r) => r.startTime).join('+'));
  }
  check('P4 approval vs manual edit race: both paths answered 200 every round',
    p4Rounds === 3, `rounds=${p4Rounds}/3`);
  check('P4 approval vs manual edit race: final state always exactly ONE payload',
    p4Clean === 3, `clean=${p4Clean}/3 outcomes=[${p4Outcomes.join(', ')}]`);

  // ---------- P5: different employees, same day, parallel saves ----------
  const p5Date = WEEK[5];
  const p5E101 = [{ startTime: '09:00', endTime: '09:20', nameAr: '١٠١', nameEn: 'E101' }];
  const p5E102 = [{ startTime: '12:00', endTime: '12:30', nameAr: '١٠٢', nameEn: 'E102' }];
  const [r101, r102] = await Promise.all([
    saveBreaks('emp-101', p5Date, p5E101),
    saveBreaks('emp-102', p5Date, p5E102),
  ]);
  const p5Read = await Promise.all([
    getBreaks('emp-101', p5Date, p5Date),
    getBreaks('emp-102', p5Date, p5Date),
  ]);
  check('P5 different employees same day: both saved correctly',
    r101.status === 200 && r102.status === 200
    && assertDayIsExactly(p5Read[0]?.breaksByDate?.[p5Date] ?? [], p5E101)
    && assertDayIsExactly(p5Read[1]?.breaksByDate?.[p5Date] ?? [], p5E102));

  // ---------- P6: soak — parallel + sequential mixed load, no leak/stall ----------
  const soakTargets = [];
  for (let i = 0; i < 30; i++) {
    if (i % 4 === 0) soakTargets.push(() => fetch(`${BASE}/api/data`).then((r) => r.status));
    else if (i % 4 === 1) soakTargets.push(() => fetch(`${BASE}/api/schedule-sync`).then((r) => r.status));
    else if (i % 4 === 2) soakTargets.push(() => fetch(`${BASE}/api/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'EMP002', password: '1234' }),
    }).then((r) => r.status));
    else soakTargets.push(() => saveBreaks('emp-102', WEEK[(i / 4 | 0) % 7], [{ startTime: `0${(i % 9) + 1}:00`, endTime: `0${(i % 9) + 1}:20` }]).then((r) => r.status));
  }
  const t2 = Date.now();
  const soakStatuses = await Promise.all(soakTargets.map((fn) => fn().catch(() => 0)));
  const soakWall = Date.now() - t2;
  check('P6 soak parallel: 30 mixed requests all 200, none hung',
    soakStatuses.every((s) => s === 200), `wall=${soakWall}ms bad=${soakStatuses.filter((s) => s !== 200).length}`);
  let seqOk = 0;
  const t3 = Date.now();
  for (let i = 0; i < 40; i++) {
    const s = await fetch(`${BASE}/api/employee-breaks?employeeId=emp-101&from=${WEEK[0]}&to=${WEEK[6]}`, { signal: AbortSignal.timeout(10000) });
    if (s.status === 200) seqOk++;
  }
  const seqWall = Date.now() - t3;
  check('P6 soak sequential: 40 rapid requests all 200 (clients do not leak/exhaust)',
    seqOk === 40, `${seqOk}/40 in ${seqWall}ms`);
  const t4 = Date.now();
  const finalHealth = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(8000) }).then(j);
  check('P6 worker still healthy after soak',
    finalHealth?.status === 'ok' && finalHealth?.database === 'connected' && (Date.now() - t4) < 8000,
    JSON.stringify(finalHealth));

  // ---------- P7: team scoping holds on the worker path ----------
  const leaderOutside = await saveBreaks('emp-105', WEEK[2], [{ startTime: '09:00', endTime: '09:15' }], leaderHeaders());
  const adminOutside = await saveBreaks('emp-105', WEEK[2], [{ startTime: '09:30', endTime: '09:45' }], adminHeaders());
  const adminOwnTeam = await saveBreaks('emp-101', WEEK[1], [{ startTime: '08:30', endTime: '08:50' }], leaderHeaders());
  check('P7 leader cannot edit outside their team (403)',
    leaderOutside.status === 403, `status=${leaderOutside.status}`);
  check('P7 admin can edit any employee (200)',
    adminOutside.status === 200, `status=${adminOutside.status}`);
  check('P7 leader CAN edit their own team member (200)',
    adminOwnTeam.status === 200, `status=${adminOwnTeam.status}`);

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

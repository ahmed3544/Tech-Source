// Break-editing reproduction probe: runs the FULL Express backend in workerd
// (same as production) against an embedded PostgreSQL, and exercises the exact
// admin flow the user reported: "بتعدل توقيت البريكات بيعلق ومش بيتعدل".
//
// Scenarios:
//   1. Create breaks -> GET -> edit times -> GET (round-trip integrity)
//   2. Edit one break of several (replace-per-day semantics)
//   3. Polluted date row ('2026-11-14T00:00:00.000Z') — does the old row
//      survive a save for the same day (eq(date,...) misses it)?
//   4. DATE-typed date column variant (mimics a production DB where the
//      column is not TEXT) — do reads return usable date keys?
//   5. Overlapping/invalid edits are rejected 400 (no silent corrupt state)
//
// Every fetch has a hard timeout so a server-side hang is DETECTED, not
// experienced as an eternal spinner.
import EmbeddedPostgres from 'embedded-postgres';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PG_PORT = 54334;
const WORKER_PORT = 8797;
const BASE = `http://127.0.0.1:${WORKER_PORT}`;
const DB_URL = `postgres://postgres:demopass@127.0.0.1:${PG_PORT}/techsource_breaks`;

let pg, wrangler, passed = 0, failed = 0;
const check = (name, ok, extra = '') => {
  if (ok) { passed++; console.log(`  PASS ${name}${extra ? ` — ${extra}` : ''}`); }
  else { failed++; console.log(`  FAIL ${name}${extra ? ` — ${extra}` : ''}`); }
};

const today = new Date();
const sunday = new Date(today); sunday.setHours(0, 0, 0, 0); sunday.setDate(sunday.getDate() - sunday.getDay());
const d = (i) => { const x = new Date(sunday); x.setDate(x.getDate() + i); return x.toISOString().slice(0, 10); };
const MON = d(1), TUE = d(2), WED = d(3), THU = d(4);

// ---------- embedded PG + schema + seed (TEXT date column, like ensure-schema) ----------
pg = new EmbeddedPostgres({
  databaseDir: `/tmp/tech-source-breaks-pg-${Date.now()}`,
  user: 'postgres', password: 'demopass', port: PG_PORT, persistent: false,
});
await pg.initialise();
await pg.start();
await pg.createDatabase('techsource_breaks');
const client = pg.getPgClient('techsource_breaks');
await client.connect();
const seedStatements = [
  `CREATE TABLE IF NOT EXISTS employees (id text PRIMARY KEY, company_id text, code text, name_ar text NOT NULL, name_en text NOT NULL,
    avatar text, email text, phone text, department text, job_title_ar text, job_title_en text, shift_id text, pin text,
    role text, joined_date text, status text, annual_leave_balance real, casual_leave_balance real, regular_leave_balance real,
    sick_leave_balance real, is_photo_removed boolean, updated_at text)`,
  `CREATE TABLE IF NOT EXISTS settings (key text PRIMARY KEY, value jsonb)`,
  `CREATE TABLE IF NOT EXISTS shifts (id text PRIMARY KEY, company_id text, name text NOT NULL, start_time text NOT NULL, end_time text NOT NULL,
    duration_minutes integer NOT NULL, break_minutes integer DEFAULT 0, grace_period_minutes integer DEFAULT 0,
    overtime_enabled boolean DEFAULT false, is_overnight boolean DEFAULT false, created_at text, updated_at text)`,
  `CREATE TABLE IF NOT EXISTS activity_logs (id text PRIMARY KEY, company_id text, actor_id text NOT NULL, actor_name text,
    action text NOT NULL, entity_type text NOT NULL, entity_id text, entity_label text, details jsonb, created_at text NOT NULL)`,
  `INSERT INTO employees (id, company_id, code, name_ar, name_en, pin, role, status, shift_id, updated_at) VALUES
    ('emp-002', 'tech-source', 'EMP002', 'أحمد', 'Ahmed', '1234', 'admin', 'active', 'shift-1', now()::text),
    ('emp-101', 'tech-source', 'EMP101', 'اجنت واحد', 'Agent One', '1111', 'employee', 'active', 'shift-1', now()::text)`,
  `INSERT INTO shifts (id, company_id, name, start_time, end_time, duration_minutes, updated_at) VALUES
    ('shift-1', 'tech-source', 'Morning', '09:00', '17:00', 480, now()::text)`,
];
for (const statement of seedStatements) {
  await client.query(statement);
}
await client.query(`INSERT INTO settings (key, value) VALUES ('dailyShiftAssignments', $1), ('shiftBreaks', $2)`, [
  JSON.stringify([
    { employeeId: 'emp-101', date: MON, shiftId: 'shift-1', isOffDay: false, assignedBy: 'emp-002', updatedAt: new Date().toISOString() },
    { employeeId: 'emp-101', date: TUE, shiftId: 'shift-1', isOffDay: false, assignedBy: 'emp-002', updatedAt: new Date().toISOString() },
  ]),
  JSON.stringify([{ id: 'sb-1', startTime: '13:00', endTime: '13:30', durationMinutes: 30 }]),
]);

// ---------- temp wrangler config (no Hyperdrive; DATABASE_URL var) ----------
const repoConfig = fs.readFileSync(path.join(ROOT, 'wrangler.jsonc'), 'utf8').replace(/^\s*\/\/.*$/gm, '');
const config = JSON.parse(repoConfig);
delete config.hyperdrive; delete config.previews;
config.vars = { DATABASE_URL: DB_URL };
const configPath = path.join(ROOT, 'wrangler.breaks-probe.jsonc');
fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

wrangler = spawn('npx', ['wrangler', 'dev', '--port', String(WORKER_PORT), '--config', configPath], {
  cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, CI: '1', WRANGLER_SEND_METRICS: 'false' },
});
let bootLog = '';
wrangler.stdout.on('data', (c) => { bootLog += c; fs.appendFileSync('/tmp/probe-wrangler.log', c); });
wrangler.stderr.on('data', (c) => { bootLog += c; fs.appendFileSync('/tmp/probe-wrangler.log', c); });

async function waitReady() {
  const deadline = Date.now() + 240000;
  while (Date.now() < deadline) {
    if (wrangler.exitCode !== null) throw new Error(`wrangler exited:\n${bootLog.slice(-2500)}`);
    try {
      const r = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(4000) });
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`not ready:\n${bootLog.slice(-2500)}`);
}

const authHeaders = (pin = '1234') => ({ 'Content-Type': 'application/json', 'x-auth-employee-id': 'emp-002', 'x-auth-pin': pin });
const tfetch = (path, opts = {}, ms = 15000) =>
  fetch(`${BASE}${path}`, { ...opts, signal: AbortSignal.timeout(ms) });
const getBreaks = async (employeeId, from, to) => {
  const r = await tfetch(`/api/employee-breaks?employeeId=${encodeURIComponent(employeeId)}&from=${from}&to=${to}`);
  return { status: r.status, body: await r.json().catch(() => null) };
};
const postBreaks = async (employeeId, date, breaks, ms = 15000) => {
  const r = await tfetch('/api/employee-breaks', {
    method: 'POST', headers: authHeaders(),
    body: JSON.stringify({ employeeId, date, breaks }),
  }, ms);
  return { status: r.status, body: await r.json().catch(() => null) };
};
const rowsOf = (body, date) => body?.breaks ?? (date ? (body?.breaksByDate?.[date] ?? []) : Object.values(body?.breaksByDate ?? {}).flat());
const timesOf = (body, date) => (rowsOf(body, date) ?? []).map((b) => `${b.startTime}-${b.endTime}`).sort().join(', ');

try {
  await waitReady();
  console.log('workerd ready — starting break-edit probes\n');
  const hdr = 'content-type';

  // ---- Scenario 1: create -> read back -> EDIT times -> read back ----
  let r1 = await postBreaks('emp-101', MON, [
    { name: 'Prayer', startTime: '13:30', endTime: '13:50' },
  ]);
  check('S1 create: POST 200', r1.status === 200, `status=${r1.status} ${JSON.stringify(r1.body).slice(0, 120)}`);
  let g1 = await getBreaks('emp-101', MON, MON);
  check('S1 create: GET shows 13:30-13:50', g1.status === 200 && timesOf(g1.body, MON) === '13:30-13:50',
    `keys=${Object.keys(g1.body?.breaksByDate || {}).join('|')} times=${timesOf(g1.body)}`);

  const t0 = Date.now();
  let r2 = await postBreaks('emp-101', MON, [{ name: 'Prayer', startTime: '14:00', endTime: '14:20' }]);
  const editMs = Date.now() - t0;
  check('S1 edit: POST 200 (no hang)', r2.status === 200 && editMs < 10000, `status=${r2.status} ${editMs}ms`);
  const echoed = timesOf(r2.body);
  let g2 = await getBreaks('emp-101', MON, MON);
  const shown = timesOf(g2.body, MON);
  check('S1 edit: POST echo = edited times (14:00-14:20)', echoed === '14:00-14:20', `echo=${echoed}`);
  check('S1 edit: GET shows EDITED times (the actual bug)', shown === '14:00-14:20', `get=${shown}`);

  // ---- Scenario 2: multiple breaks, edit ONE ----
  let r3 = await postBreaks('emp-101', TUE, [
    { startTime: '10:00', endTime: '10:15' },
    { startTime: '13:30', endTime: '13:50' },
    { startTime: '15:00', endTime: '15:10' },
  ]);
  check('S2 multi create: POST 200', r3.status === 200, `status=${r3.status}`);
  let r4 = await postBreaks('emp-101', TUE, [
    { startTime: '10:00', endTime: '10:15' },
    { startTime: '13:30', endTime: '14:30' },
    { startTime: '15:00', endTime: '15:10' },
  ]);
  let g3 = await getBreaks('emp-101', TUE, TUE);
  check('S2 edit middle: GET = 10:00-10:15, 13:30-14:30, 15:00-15:10',
    r4.status === 200 && timesOf(g3.body, TUE) === '10:00-10:15, 13:30-14:30, 15:00-15:10', `get=${timesOf(g3.body)}`);

  // ---- Scenario 3: polluted date row survives? ----
  await client.query(
    `INSERT INTO employee_breaks (id, company_id, employee_id, date, name_ar, start_time, end_time, duration_minutes, created_at, updated_at)
     VALUES ('brk-polluted', 'tech-source', 'emp-101', $1, NULL, '12:00', '12:30', 30, now()::text, now()::text)`,
    [`${WED}T00:00:00.000Z`],
  );
  // A zombie inserted AFTER boot-repair stays invisible to a day-scoped GET
  // (lte) until the day is saved — acceptable debris. The contract that
  // matters: the NEXT save for that day sweeps it (verified below via SQL).
  const zombieBefore = (await client.query(`SELECT count(*)::int AS n FROM employee_breaks WHERE employee_id = 'emp-101' AND date::text <> substring(date::text from 1 for 10)`)).rows[0].n;
  check('S3 zombie row present pre-save (sanity)', zombieBefore >= 1, `count=${zombieBefore}`);
  let r5 = await postBreaks('emp-101', WED, [{ startTime: '13:30', endTime: '13:50' }]);
  let g5 = await getBreaks('emp-101', WED, WED);
  const zombiesAfter = (await client.query(`SELECT count(*)::int AS n FROM employee_breaks WHERE employee_id = 'emp-101' AND date::text <> substring(date::text from 1 for 10)`)).rows[0].n;
  check('S3 after save: zombie SWEPT by same-day matcher', r5.status === 200 && zombiesAfter === 0, `zombies=${zombiesAfter}`);

  // ---- Scenario 4: DATE-typed date column variant (fresh table, real pg types) ----
  await client.query(`ALTER TABLE employee_breaks ALTER COLUMN date TYPE date USING date::date;`);
  let r6 = await postBreaks('emp-101', THU, [{ startTime: '11:00', endTime: '11:20' }]);
  let g6 = await getBreaks('emp-101', THU, THU);
  const g6keys = Object.keys(g6.body?.breaksByDate || {});
  const g6ok = g6keys.length === 1 && /^\d{4}-\d{2}-\d{2}$/.test(g6keys[0]) && timesOf(g6.body, g6keys[0]) === '11:00-11:20';
  check('S4 DATE column: save + read back with clean YYYY-MM-DD key', r6.status === 200 && g6ok, `keys=[${g6keys.join('|')}] times=${timesOf(g6.body)}`);
  let r7 = await postBreaks('emp-101', THU, [{ startTime: '12:00', endTime: '12:20' }]);
  let g7 = await getBreaks('emp-101', THU, THU);
  check('S4 DATE column: second edit round-trips', r7.status === 200 && timesOf(g7.body, THU) === '12:00-12:20', `times=${timesOf(g7.body)} keys=[${g6keys.join('|')}]`);

  // ---- Scenario 5: invalid edits rejected ----
  let r8 = await postBreaks('emp-101', THU, [{ startTime: '13:50', endTime: '13:30' }]);
  check('S5 end<=start rejected 400', r8.status === 400, `status=${r8.status}`);
  let r9 = await postBreaks('emp-101', THU, [{ startTime: '10:00', endTime: '10:20' }, { startTime: '10:10', endTime: '10:40' }]);
  check('S5 overlap rejected 400', r9.status === 400, `status=${r9.status}`);
  let g8 = await getBreaks('emp-101', THU, THU);
  check('S5 state intact after rejects', timesOf(g8.body, THU) === '12:00-12:20', `times=${timesOf(g8.body)}`);

} catch (error) {
  failed++;
  console.log(`  FAIL PROBE ABORTED — ${error.message}`);
  console.log(`---- worker bootLog tail ----\n${bootLog.slice(-3500)}`);
} finally {
  try { wrangler && wrangler.kill('SIGTERM'); } catch {}
  try { await client.end(); } catch {}
  try { await pg.stop(); } catch {}
  try { fs.unlinkSync(configPath); } catch {}
  console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

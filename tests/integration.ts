/**
 * Integration tests for the feature branch — REAL database edition.
 *
 * Runs the production code path end-to-end:
 *   express app → real handlers (server/*.ts) → real drizzle queries
 *   → a REAL PostgreSQL instance (embedded-postgres binaries, isolated
 *   data directory) — including the actual 0003_employee_breaks.sql migration.
 *
 * No production database is touched.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import EmbeddedPostgres from 'embedded-postgres';

const results: Array<{ name: string; ok: boolean; error?: string }> = [];
let passed = 0;
let failed = 0;
async function test(name: string, fn: () => Promise<void> | void) {
  try { await fn(); passed++; results.push({ name, ok: true }); console.log(`  ✓ ${name}`); }
  catch (error: any) { failed++; results.push({ name, ok: false, error: error?.message }); console.error(`  ✗ ${name}\n      ${error?.message}`); }
}

// ---------------------------------------------------------------------------
// 1. Boot an isolated real PostgreSQL
// ---------------------------------------------------------------------------
const PG_PORT = 54331;
const pg = new EmbeddedPostgres({
  databaseDir: `/tmp/tech-source-test-pg-${Date.now()}`,
  user: 'postgres',
  password: 'testpass',
  port: PG_PORT,
  persistent: false,
});
await pg.initialise();
await pg.start();
await pg.createDatabase('techsource_test');
const BASE_URL = `postgres://postgres:testpass@localhost:${PG_PORT}/techsource_test`;

const client = pg.getPgClient('techsource_test');
await client.connect();

const tableDir = path.resolve(import.meta.dirname ?? '.');
const migrationSql = fs.readFileSync(path.join(tableDir, '../drizzle/0003_employee_breaks.sql'), 'utf8');

// Base tables (mirroring the production schema) + the feature migration.
await client.query(`
  CREATE TABLE IF NOT EXISTS employees (id text PRIMARY KEY, company_id text, code text, name_ar text NOT NULL, name_en text NOT NULL,
    avatar text, email text, phone text, department text, job_title_ar text, job_title_en text, shift_id text, pin text,
    role text, joined_date text, status text, annual_leave_balance real, casual_leave_balance real, regular_leave_balance real,
    sick_leave_balance real, is_photo_removed boolean, updated_at text);
  CREATE TABLE IF NOT EXISTS notifications (id text PRIMARY KEY, company_id text, recipient_id text NOT NULL, type text NOT NULL, title text NOT NULL, message text NOT NULL,
    related_employee_id text, related_leave_id text, related_overtime_id text, related_shift_swap_id text, is_read boolean DEFAULT false, created_at text NOT NULL, updated_at text NOT NULL);
  CREATE TABLE IF NOT EXISTS settings (key text PRIMARY KEY, value jsonb);
  CREATE TABLE IF NOT EXISTS shifts (id text PRIMARY KEY, company_id text, name text NOT NULL, start_time text NOT NULL, end_time text NOT NULL,
    duration_minutes integer NOT NULL, break_minutes integer DEFAULT 0, grace_period_minutes integer DEFAULT 0,
    overtime_enabled boolean DEFAULT false, is_overnight boolean DEFAULT false, created_at text, updated_at text);
`);
await client.query(migrationSql); // employee_breaks + team columns
// Idempotency proof: applying the migration twice must not fail.
await client.query(migrationSql);

await client.query(`INSERT INTO employees (id, code, name_ar, name_en, pin, role, status, shift_id, team_leader_id, company_id) VALUES
  ('admin-1',  'EMP001', 'Admin',    'Admin',    '1234',    'admin',    'active', 'shift-1', NULL,       'tech-source'),
  ('leader-1', 'EMP010', 'Leader',   'Leader',   'lead123', 'leader',   'active', 'shift-1', NULL,       'tech-source'),
  ('emp-a',    'EMP101', 'Agent A',  'Agent A',  '1111',    'employee', 'active', 'shift-1', 'leader-1', 'tech-source'),
  ('emp-b',    'EMP102', 'Agent B',  'Agent B',  '2222',    'employee', 'active', 'shift-1', 'leader-1', 'tech-source'),
  ('emp-out',  'EMP103', 'Outsider', 'Outsider', '3333',    'employee', 'active', 'shift-1', NULL,       'tech-source')`);
await client.query(`INSERT INTO shifts (id, company_id, name, start_time, end_time, duration_minutes, break_minutes, grace_period_minutes)
  VALUES ('shift-1', 'tech-source', 'Morning', '09:00', '17:00', 480, 0, 10)`);
await client.query(`INSERT INTO settings (key, value) VALUES ('dailyShiftAssignments', '[{"employeeId":"emp-a","date":"2026-10-27","shiftId":"shift-1","isOffDay":false,"updatedAt":"2026-10-01T00:00:00Z"},{"employeeId":"emp-b","date":"2026-10-27","shiftId":"shift-1","isOffDay":false,"updatedAt":"2026-10-01T00:00:00Z"}]')`);
await client.query(`INSERT INTO notifications (id, recipient_id, type, title, message, is_read, created_at, updated_at) VALUES
  ('notif-1', 'emp-a', 'leave_request', 'Leave approved', 'Your leave was approved', false, '2026-10-20T10:00:00Z', '2026-10-20T10:00:00Z'),
  ('notif-2', 'emp-a', 'leave_request', 'Leave approved', 'Your leave was approved', false, '2026-10-21T10:00:00Z', '2026-10-21T10:00:00Z'),
  ('notif-3', 'emp-a', 'overtime', 'Overtime update', 'OT request updated', true, '2026-10-19T10:00:00Z', '2026-10-19T10:00:00Z')`);

// The DB must exist BEFORE server modules evaluate src/db/index.ts.
process.env.DATABASE_URL = BASE_URL;

// ---------------------------------------------------------------------------
// 2. Build the real HTTP app from the real handlers
// ---------------------------------------------------------------------------
const { registerDirectScheduleSync } = await import('../server/schedule-sync-direct.js');
const { registerEmployeeBreaks } = await import('../server/employee-breaks.js');
const { updateEmployeeHandler, createEmployeeHandler, deleteEmployeeHandler } = await import('../server/employees.js');
const { sanitizeEmployees } = await import('../server/employee-sanitize.js');
const { listNotificationsForUser, markAllNotificationsRead, markNotificationRead } = await import('../server/notification-reads.js');

const app = express();
app.use(express.json({ limit: '1mb' }));
registerDirectScheduleSync(app);
registerEmployeeBreaks(app);
app.put('/api/employees/:id', (req: any, res: any) => updateEmployeeHandler(req, res));
app.post('/api/employees', (req: any, res: any) => createEmployeeHandler(req, res));
app.delete('/api/employees/:id', (req: any, res: any) => deleteEmployeeHandler(req, res));
// Static-path aliases (mirror server.ts exactly) — the "page could not be found" fix.
// Auth first: the shared handlers validate credentials BEFORE the id, so
// unauthenticated probes get 401 instead of validation details.
const withEmployeeId = (req: any, res: any): void => {
  const id = String(req.body?.id ?? '').trim();
  req.params = { ...(req.params || {}), id };
};
app.post('/api/employees-update', (req: any, res: any) => { withEmployeeId(req, res); return updateEmployeeHandler(req, res); });
app.post('/api/employees-delete', (req: any, res: any) => { withEmployeeId(req, res); return deleteEmployeeHandler(req, res); });
// Snapshot route (mirrors dbSnapshot/directData): same sanitize step must apply.
app.get('/api/data', async (_req: any, res: any) => {
  const { db } = await import('../src/db/index.js');
  const schemaMod = await import('../src/db/schema.js');
  const employees = await db.select().from((schemaMod as any).employees);
  res.json({ success: true, employees: sanitizeEmployees(employees as any[]) });
});
app.post('/api/notifications-read', async (req: any, res: any) => {
  try {
    const userId = String(req.body?.userId ?? '').trim();
    const id = String(req.body?.id ?? '').trim();
    if (!userId || !id) return res.status(400).json({ success: false, updated: false });
    const result = await markNotificationRead(userId, id);
    if (!result.ok) return res.status(result.status ?? 400).json({ success: false, updated: false });
    return res.json({ success: true, notifications: await listNotificationsForUser(userId) });
  } catch { return res.status(500).json({ success: false, error: 'database_unavailable' }); }
});
app.post('/api/notifications-read-all', async (req: any, res: any) => {
  try {
    const userId = String(req.body?.userId ?? '').trim();
    if (!userId) return res.status(400).json({ success: false, count: 0 });
    const result = await markAllNotificationsRead(userId);
    if (!result.ok) return res.status(400).json({ success: false, count: 0 });
    return res.json({ success: true, notifications: await listNotificationsForUser(userId) });
  } catch { return res.status(500).json({ success: false, error: 'database_unavailable' }); }
});

const server = app.listen(0);
await new Promise<void>((resolve) => server.once('listening', resolve));
const BASE = `http://127.0.0.1:${(server.address() as any).port}`;

const auth = (id: string, pin: string) => ({ 'x-auth-employee-id': id, 'x-auth-pin': pin });
async function call(method: string, endpoint: string, opts: { headers?: Record<string, string>; body?: unknown } = {}) {
  const response = await fetch(BASE + endpoint, {
    method,
    headers: { 'Content-Type': 'application/json', ...(opts.headers ?? {}) },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await response.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* keep null */ }
  return { status: response.status, json, text };
}
const row = async (sql: string) => (await client.query(sql)).rows;

// ---------------------------------------------------------------------------
// 3. Permission guard tests
// ---------------------------------------------------------------------------
console.log('\n— Permissions —');
await test('PUT employee without credentials → 401 readable string error', async () => {
  const r = await call('PUT', '/api/employees/emp-a', { body: { nameAr: 'Hacked' } });
  assert.equal(r.status, 401);
  assert.equal(r.json?.success, false);
  assert.equal(typeof r.json?.error, 'string');
  assert.ok(!/object Object/i.test(r.text));
});
await test('PUT employee with wrong PIN → 401', async () => {
  const r = await call('PUT', '/api/employees/emp-a', { headers: auth('admin-1', 'nope'), body: { nameAr: 'X' } });
  assert.equal(r.status, 401);
});
await test('PUT employee as plain employee → 403 (UI alone is never trusted)', async () => {
  const r = await call('PUT', '/api/employees/emp-b', { headers: auth('emp-a', '1111'), body: { nameAr: 'Self-promoted' } });
  assert.equal(r.status, 403);
});
await test('POST schedule-sync without credentials → 401', async () => {
  const r = await call('POST', '/api/schedule-sync', { body: { dailyShiftAssignments: [] } });
  assert.equal(r.status, 401);
});
await test('POST employee-breaks without credentials → 401', async () => {
  const r = await call('POST', '/api/employee-breaks', { body: { employeeId: 'emp-a', date: '2026-10-27', breaks: [] } });
  assert.equal(r.status, 401);
});
await test('POST employees-update without id and without credentials → 401 (auth before validation)', async () => {
  const r = await call('POST', '/api/employees-update', { body: { nameAr: 'Anon' } });
  assert.equal(r.status, 401);
  assert.equal(r.json?.success, false);
});
await test('POST /api/employees (create) without credentials → 401', async () => {
  const r = await call('POST', '/api/employees', { body: { code: 'EMP999', nameAr: 'Ghost', pin: 'x' } });
  assert.equal(r.status, 401);
});
await test('DELETE employee without credentials → 401', async () => {
  const r = await call('DELETE', '/api/employees/emp-a');
  assert.equal(r.status, 401);
});

// ---------------------------------------------------------------------------
// 4. Employee edit flow ([object Object] fix) + data integrity
// ---------------------------------------------------------------------------
console.log('\n— Employee editing —');
await test('Admin edit saves to database and returns the updated row', async () => {
  const r = await call('PUT', '/api/employees/emp-a', { headers: auth('admin-1', '1234'), body: { nameAr: 'أحمد معدل', code: 'EMP101A' } });
  assert.equal(r.status, 200);
  assert.equal(r.json?.success, true);
  assert.equal(r.json?.employee?.nameAr, 'أحمد معدل');
  assert.equal(r.json?.employee?.code, 'EMP101A');
  const dbRow = (await row(`SELECT name_ar, code FROM employees WHERE id = 'emp-a'`))[0];
  assert.equal(dbRow.name_ar, 'أحمد معدل');
  assert.equal(dbRow.code, 'EMP101A');
});
await test('Mutation responses never expose the pin (create + update)', async () => {
  const created = await call('POST', '/api/employees', { headers: auth('admin-1', '1234'), body: { code: 'EMP777', nameAr: 'Sanitized', pin: 'secret777' } });
  assert.equal(created.status, 201);
  assert.equal(created.json?.employee?.pin, undefined);
  assert.equal(created.json?.employee?.code, 'EMP777');
  const updated = await call('PUT', '/api/employees/emp-b', { headers: auth('admin-1', '1234'), body: { nameAr: 'Pin Check B' } });
  assert.equal(updated.status, 200);
  assert.equal(updated.json?.employee?.pin, undefined);
  const dbPin = (await row(`SELECT pin FROM employees WHERE code = 'EMP777'`))[0];
  assert.equal(dbPin.pin, 'secret777'); // still stored for login — just never returned
});
await test('GET /api/data snapshot never exposes pins', async () => {
  const r = await call('GET', '/api/data');
  assert.equal(r.status, 200);
  const employees = r.json?.employees;
  assert.ok(Array.isArray(employees) && employees.length > 0);
  for (const employee of employees) assert.equal(employee.pin, undefined, `pin leaked for ${employee.id}`);
});
await test('Unchanged fields are never overwritten (pin-only edit keeps department)', async () => {
  const before = (await row(`SELECT department, email, pin FROM employees WHERE id = 'emp-a'`))[0];
  const r = await call('PUT', '/api/employees/emp-a', { headers: auth('admin-1', '1234'), body: { pin: 'new-pin-9' } });
  assert.equal(r.status, 200);
  const after = (await row(`SELECT department, email, pin FROM employees WHERE id = 'emp-a'`))[0];
  assert.equal(after.department, before.department);
  assert.equal(after.email, before.email);
  assert.equal(after.pin, 'new-pin-9');
});
await test('Duplicate employee code is rejected with 409 + readable message', async () => {
  const r = await call('PUT', '/api/employees/emp-a', { headers: auth('admin-1', '1234'), body: { code: 'EMP102' } });
  assert.equal(r.status, 409);
  assert.match(r.json?.error, /already used/);
  assert.equal(typeof r.json?.error, 'string');
});
await test('Invalid payload (empty code) → 400 readable message', async () => {
  const r = await call('PUT', '/api/employees/emp-a', { headers: auth('admin-1', '1234'), body: { code: '   ' } });
  assert.equal(r.status, 400);
  assert.match(r.json?.error, /code/);
});
await test('Unknown employee → 404 readable message', async () => {
  const r = await call('PUT', '/api/employees/emp-ghost', { headers: auth('admin-1', '1234'), body: { nameAr: 'X' } });
  assert.equal(r.status, 404);
  assert.match(r.json?.error, /not found/i);
});
await test('Team leader can edit own-team employee', async () => {
  const r = await call('PUT', '/api/employees/emp-b', { headers: auth('leader-1', 'lead123'), body: { nameEn: 'Agent B Renamed' } });
  assert.equal(r.status, 200);
  assert.equal(r.json?.employee?.nameEn, 'Agent B Renamed');
});
await test('Team leader CANNOT edit employee outside the team → 403', async () => {
  const r = await call('PUT', '/api/employees/emp-out', { headers: auth('leader-1', 'lead123'), body: { nameEn: 'Escalated' } });
  assert.equal(r.status, 403);
});
await test('Create employee → 201 + persisted; duplicate code → 409', async () => {
  const r = await call('POST', '/api/employees', { headers: auth('admin-1', '1234'), body: { code: 'EMP500', nameAr: 'جديد', nameEn: 'New Guy', pin: 'temp123' } });
  assert.equal(r.status, 201);
  assert.equal((await row(`SELECT 1 FROM employees WHERE code = 'EMP500'`)).length, 1);
  const dup = await call('POST', '/api/employees', { headers: auth('admin-1', '1234'), body: { code: 'EMP500', nameAr: 'مكرر', pin: 'x' } });
  assert.equal(dup.status, 409);
});
await test('Delete employee → tombstoned + gone; second delete → 404', async () => {
  const r = await call('DELETE', '/api/employees/emp-out', { headers: auth('admin-1', '1234') });
  assert.equal(r.status, 200);
  assert.equal((await row(`SELECT 1 FROM employees WHERE id = 'emp-out'`)).length, 0);
  const tombs = (await row(`SELECT value FROM settings WHERE key = '__sync_deleted_ids:employee'`))[0];
  assert.ok(JSON.stringify(tombs.value).includes('emp-out'));
  const again = await call('DELETE', '/api/employees/emp-out', { headers: auth('admin-1', '1234') });
  assert.equal(again.status, 404);
});

// ---------------------------------------------------------------------------
// 5. Per-employee breaks — independence + validation
// ---------------------------------------------------------------------------
console.log('\n— Employee-specific breaks —');
await test('Leader saves different breaks for two employees on the SAME shift', async () => {
  const a = await call('POST', '/api/employee-breaks', { headers: auth('leader-1', 'lead123'), body: { employeeId: 'emp-a', date: '2026-10-27', breaks: [{ name: 'Lunch', startTime: '12:00', endTime: '13:00' }] } });
  const b = await call('POST', '/api/employee-breaks', { headers: auth('leader-1', 'lead123'), body: { employeeId: 'emp-b', date: '2026-10-27', breaks: [{ name: 'Late coffee', startTime: '15:30', endTime: '15:50' }] } });
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  assert.equal(a.json?.breaks?.[0]?.startTime, '12:00');
  assert.equal(b.json?.breaks?.[0]?.startTime, '15:30');
  assert.equal((await row(`SELECT count(*)::int c FROM employee_breaks WHERE employee_id = 'emp-a' AND date = '2026-10-27'`))[0].c, 1);
  assert.equal((await row(`SELECT count(*)::int c FROM employee_breaks WHERE employee_id = 'emp-b' AND date = '2026-10-27'`))[0].c, 1);
  assert.notEqual(
    (await row(`SELECT start_time FROM employee_breaks WHERE employee_id = 'emp-a' AND date = '2026-10-27'`))[0].start_time,
    (await row(`SELECT start_time FROM employee_breaks WHERE employee_id = 'emp-b' AND date = '2026-10-27'`))[0].start_time,
  );
});
await test('Editing employee A breaks does NOT touch employee B breaks', async () => {
  await call('POST', '/api/employee-breaks', { headers: auth('leader-1', 'lead123'), body: { employeeId: 'emp-a', date: '2026-10-27', breaks: [{ name: 'Prayer', startTime: '13:30', endTime: '13:50' }] } });
  const bRow = (await row(`SELECT start_time, end_time FROM employee_breaks WHERE employee_id = 'emp-b' AND date = '2026-10-27'`))[0];
  assert.equal(bRow.start_time, '15:30');
  assert.equal(bRow.end_time, '15:50');
});
await test('Multiple breaks per day are supported and sorted', async () => {
  const r = await call('POST', '/api/employee-breaks', { headers: auth('admin-1', '1234'), body: { employeeId: 'emp-a', date: '2026-10-27', breaks: [
    { name: 'Second', startTime: '15:00', endTime: '15:15' },
    { name: 'First', startTime: '11:00', endTime: '11:20' },
  ] } });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json?.breaks?.map((x: any) => x.startTime), ['11:00', '15:00']);
});
await test('Break end before start → 400 readable message', async () => {
  const r = await call('POST', '/api/employee-breaks', { headers: auth('admin-1', '1234'), body: { employeeId: 'emp-a', date: '2026-10-27', breaks: [{ startTime: '14:00', endTime: '13:00' }] } });
  assert.equal(r.status, 400);
  assert.match(r.json?.error, /after start time/);
});
await test('Overlapping breaks → 400 readable message', async () => {
  const r = await call('POST', '/api/employee-breaks', { headers: auth('admin-1', '1234'), body: { employeeId: 'emp-a', date: '2026-10-27', breaks: [{ startTime: '11:00', endTime: '12:00' }, { startTime: '11:30', endTime: '12:30' }] } });
  assert.equal(r.status, 400);
  assert.match(r.json?.error, /overlaps/i);
});
await test('Malformed time values → 400 readable message', async () => {
  const r = await call('POST', '/api/employee-breaks', { headers: auth('admin-1', '1234'), body: { employeeId: 'emp-a', date: '2026-10-27', breaks: [{ startTime: '25:99', endTime: '26:00' }] } });
  assert.equal(r.status, 400);
  assert.match(r.json?.error, /HH:mm/);
});
await test('Breaks for unknown employee → 404', async () => {
  const r = await call('POST', '/api/employee-breaks', { headers: auth('admin-1', '1234'), body: { employeeId: 'ghost', date: '2026-10-27', breaks: [] } });
  assert.equal(r.status, 404);
});
await test('GET employee-breaks returns only that employee + date range', async () => {
  const r = await call('GET', `/api/employee-breaks?employeeId=emp-a&from=2026-10-27&to=2026-10-27`);
  assert.equal(r.status, 200);
  assert.equal(r.json?.success, true);
  assert.equal(r.json?.breaksByDate?.['2026-10-27']?.length, 2);
  const other = await call('GET', `/api/employee-breaks?employeeId=emp-b&from=2026-10-27&to=2026-10-27`);
  assert.equal(other.json?.breaksByDate?.['2026-10-27']?.length, 1);
});
await test('Employee (non-manager) cannot save breaks → 403', async () => {
  const r = await call('POST', '/api/employee-breaks', { headers: auth('emp-b', '2222'), body: { employeeId: 'emp-b', date: '2026-10-27', breaks: [{ startTime: '10:00', endTime: '10:10' }] } });
  assert.equal(r.status, 403);
});

// ---------------------------------------------------------------------------
// 6. Schedule-sync permissions + weekly save still works
// ---------------------------------------------------------------------------
console.log('\n— Weekly schedule sync —');
await test('Admin saves weekly schedule → merged into settings store', async () => {
  const r = await call('POST', '/api/schedule-sync', { headers: auth('admin-1', '1234'), body: { dailyShiftAssignments: [
    { employeeId: 'emp-a', date: '2026-10-27', shiftId: '', isOffDay: true, updatedAt: new Date().toISOString() },
  ] } });
  assert.equal(r.status, 200);
  assert.equal(r.json?.success, true);
  const stored = (await row(`SELECT value FROM settings WHERE key = 'dailyShiftAssignments'`))[0].value;
  const off = stored.find((x: any) => x.employeeId === 'emp-a' && x.date === '2026-10-27');
  assert.equal(off.isOffDay, true);
});
await test('Team leader saving schedule for own team → 200', async () => {
  const r = await call('POST', '/api/schedule-sync', { headers: auth('leader-1', 'lead123'), body: { dailyShiftAssignments: [
    { employeeId: 'emp-b', date: '2026-10-28', shiftId: 'shift-1', updatedAt: new Date().toISOString() },
  ] } });
  assert.equal(r.status, 200);
});
await test('Team leader saving schedule for outsider → 403 + denied ids', async () => {
  const r = await call('POST', '/api/schedule-sync', { headers: auth('leader-1', 'lead123'), body: { dailyShiftAssignments: [
    { employeeId: 'emp-out-removed', date: '2026-10-28', shiftId: 'shift-1', updatedAt: new Date().toISOString() },
  ] } });
  assert.equal(r.status, 403);
  assert.ok(Array.isArray(r.json?.deniedEmployeeIds));
});
await test('GET /api/schedule-sync stays open for employees to read', async () => {
  const r = await call('GET', '/api/schedule-sync');
  assert.equal(r.status, 200);
  assert.equal(r.json?.success, true);
});

// ---------------------------------------------------------------------------
// 7. Error-extraction utility ([object Object] regression)
// ---------------------------------------------------------------------------
console.log('\n— Error extraction ([object Object] regression) —');
const { extractApiError, errorToMessage } = await import('../src/utils/errors.js');
await test('extractApiError: nested error object', () => {
  assert.equal(extractApiError({ error: { message: 'NeonExpired' } }), 'NeonExpired');
});
await test('extractApiError: top-level message', () => {
  assert.equal(extractApiError({ message: 'rate limited' }), 'rate limited');
});
await test('extractApiError: field-level validation map', () => {
  assert.equal(extractApiError({ errors: { code: 'duplicate' } }), 'code: duplicate');
});
await test('extractApiError: validation array', () => {
  assert.equal(extractApiError([{ message: 'a' }, { message: 'b' }]), 'a • b');
});
await test('errorToMessage: Error instances keep their message', () => {
  assert.equal(errorToMessage(new Error('boom'), 'fb'), 'boom');
});
await test('errorToMessage: empty object → fallback', () => {
  assert.equal(errorToMessage({}, 'fb'), 'fb');
});
await test('errorToMessage: nested empty error → fallback', () => {
  assert.equal(errorToMessage({ error: {} }, 'fb'), 'fb');
});
await test('errorToMessage: literal "[object Object]" string → fallback', () => {
  assert.equal(errorToMessage('[object Object]', 'fb'), 'fb');
});
await test('errorToMessage: null → fallback', () => {
  assert.equal(errorToMessage(null, 'fb'), 'fb');
});
await test('errorToMessage: primitives pass through', () => {
  assert.equal(errorToMessage(42, 'fb'), '42');
});

// ---------------------------------------------------------------------------
// 8. Weekly schedule status model (5 statuses + precedence)
// ---------------------------------------------------------------------------
console.log('\n— Day status model —');
const { resolveDayStatus, timeToMinutes, timelineSegments } = await import('../src/utils/scheduleStatus.js');
const shifts = [{ id: 'shift-1', startTime: '09:00', endTime: '17:00', breaks: [{ id: 'sb1', startTime: '12:00', endTime: '13:00', durationMinutes: 60 }] } as any];
await test('Working day uses employee-specific breaks when present, shift breaks as fallback', () => {
  const fallback = resolveDayStatus({ dateKey: '2026-10-27', employeeId: 'emp-x', assignment: { shiftId: 'shift-1' }, shifts });
  assert.equal(fallback.status, 'working');
  assert.equal(fallback.effectiveBreaks.length, 1); // shift-level fallback
  const own = resolveDayStatus({ dateKey: '2026-10-27', employeeId: 'emp-x', assignment: { shiftId: 'shift-1', __employeeBreaks: [{ id: 'own1', startTime: '10:00', endTime: '10:15' }] }, shifts });
  assert.equal(own.effectiveBreaks[0].id, 'own1');
  assert.equal(own.effectiveBreaks.length, 1);
});
await test('OFF day never shows working or break periods', () => {
  const r = resolveDayStatus({ dateKey: '2026-10-27', employeeId: 'e', assignment: { isOffDay: true, shiftId: '', __employeeBreaks: [{ id: 'x', startTime: '10:00', endTime: '10:30' }] }, shifts });
  assert.equal(r.status, 'off');
  assert.equal(r.effectiveBreaks.length, 0);
});
await test('Holiday beats shift assignment', () => {
  const r = resolveDayStatus({ dateKey: '2026-10-27', employeeId: 'e', assignment: { shiftId: 'shift-1' }, shifts, holidays: [{ startDate: '2026-10-27', endDate: '2026-10-27', nameEn: 'National Day' }] });
  assert.equal(r.status, 'holiday');
  assert.equal(r.effectiveBreaks.length, 0);
});
await test('Approved annual leave beats OFF and shows label data', () => {
  const r = resolveDayStatus({ dateKey: '2026-10-27', employeeId: 'e', assignment: { isOffDay: true }, shifts, leaves: [{ employeeId: 'e', type: 'annual', status: 'approved', startDate: '2026-10-27', endDate: '2026-10-27' }] });
  assert.equal(r.status, 'annual');
  assert.equal(r.leave?.type, 'annual');
});
await test('Other approved leaves map to on_leave label (no breaks)', () => {
  const r = resolveDayStatus({ dateKey: '2026-10-27', employeeId: 'e', assignment: { shiftId: 'shift-1' }, shifts, leaves: [{ employeeId: 'e', type: 'sick', status: 'approved', startDate: '2026-10-27', endDate: '2026-10-27' }] });
  assert.equal(r.label, 'on_leave');
  assert.equal(r.effectiveBreaks.length, 0);
});
await test('Break blocks sit INSIDE the shift window on the 24h timeline', () => {
  const seg = timelineSegments('12:00', '13:00')[0];
  const shiftSeg = timelineSegments('09:00', '17:00')[0];
  assert.equal(timeToMinutes('13:00') - timeToMinutes('12:00'), 60);
  assert.ok(seg.left > shiftSeg.left && (seg.left + seg.width) < (shiftSeg.left + shiftSeg.width));
});
await test('Pending (not approved) leave does NOT change a working day', () => {
  const r = resolveDayStatus({ dateKey: '2026-10-27', employeeId: 'e', assignment: { shiftId: 'shift-1' }, shifts, leaves: [{ employeeId: 'e', type: 'annual', status: 'pending', startDate: '2026-10-27', endDate: '2026-10-27' }] });
  assert.equal(r.status, 'working');
});

// ---------------------------------------------------------------------------
// 7. Self-healing schema (auto-migration) — "Authentication backend
//    unavailable." production-incident regression
// ---------------------------------------------------------------------------
console.log('\n— Self-healing schema —');
const { ensureSchema, resetEnsureSchemaForTests } = await import('../server/ensure-schema.js');
const { authenticateRequest, findEmployeeById } = await import('../server/auth.js');
const { db, createPool: unusedCreatePool } = await import('../src/db/index.js');
const testSchema = await import('../src/db/schema.js');

async function dropAdditiveSchema() {
  await client.query('DROP TABLE IF EXISTS employee_breaks');
  await client.query('ALTER TABLE employees DROP COLUMN IF EXISTS team_leader_id');
  await client.query('ALTER TABLE employees DROP COLUMN IF EXISTS team_id');
}

await test('ensureSchema re-applies the additive migration (idempotent)', async () => {
  resetEnsureSchemaForTests();
  assert.equal(await ensureSchema(), true);
  assert.equal(await ensureSchema(), true); // cached, still true
  const cols = (await client.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name='employees' AND column_name IN ('team_leader_id','team_id')`
  )).rows.length;
  assert.equal(cols, 2);
});

await test('Pre-migration database breaks full drizzle select (regression precondition)', async () => {
  await dropAdditiveSchema();
  resetEnsureSchemaForTests();
  let broke = false;
  try { await db.select().from(testSchema.employees); } catch { broke = true; }
  assert.ok(broke, 'expected full drizzle select to fail before self-heal');
});

await test('authenticateRequest SELF-HEALS a pre-migration database (the "Authentication backend unavailable" fix)', async () => {
  const result: any = await authenticateRequest({ headers: { 'x-auth-employee-id': 'admin-1', 'x-auth-pin': '1234' } });
  assert.equal(result.ok, true, `auth should succeed after self-heal: ${JSON.stringify(result)}`);
  assert.equal(result.employee?.role, 'admin');
  // The previously broken full select works again after the heal.
  const employees = await db.select().from(testSchema.employees);
  assert.ok(employees.length >= 5);
  // employee_breaks table was recreated as well.
  const breaksTable = (await client.query(`SELECT to_regclass('employee_breaks') AS t`)).rows[0]?.t;
  assert.equal(breaksTable, 'employee_breaks');
});

await test('findEmployeeById falls back to raw SELECT * in degraded mode', async () => {
  // The previous self-heal re-added the team columns with NULLs (dropping a
  // column destroys its data — simulation artifact only). Restore the relation
  // data, then drop a column the drizzle schema maps (is_photo_removed) so the
  // FULL select fails while the raw fallback's SELECT * still returns team columns.
  await client.query(`UPDATE employees SET team_leader_id = 'leader-1' WHERE id = 'emp-a'`);
  await client.query('ALTER TABLE employees DROP COLUMN IF EXISTS is_photo_removed');
  const found: any = await findEmployeeById('emp-a');
  assert.ok(found, 'raw fallback should still find the employee');
  assert.equal(String(found.id), 'emp-a');
  assert.equal(found.teamLeaderId ?? null, 'leader-1'); // snake_case → camelCase mapping
  // emp-a's code was renamed to EMP101A by an earlier CRUD test.
  assert.ok(String(found.code).startsWith('EMP101'), `unexpected code: ${found.code}`);
  // Restore the schema for anything that runs afterwards.
  await client.query('ALTER TABLE employees ADD COLUMN IF NOT EXISTS is_photo_removed boolean');
  resetEnsureSchemaForTests();
  assert.equal(await ensureSchema(), true);
});

// ---------------------------------------------------------------------------
// Static-path mutation aliases (Vercel "The page could not be found" fix)
// ---------------------------------------------------------------------------
console.log('\n— Static-path mutation aliases —');
await test('POST /api/employees-update saves changes with id in the body', async () => {
  const r = await call('POST', '/api/employees-update', { headers: auth('admin-1', '1234'), body: { id: 'emp-b', nameAr: 'Agent B Modified' } });
  assert.equal(r.status, 200);
  assert.equal(r.json?.success, true);
  assert.equal(r.json?.employee?.nameAr, 'Agent B Modified');
  const dbRow = (await row(`SELECT name_ar FROM employees WHERE id = 'emp-b'`))[0];
  assert.equal(dbRow.name_ar, 'Agent B Modified');
});
await test('POST /api/employees-update without id → 400 readable string', async () => {
  const r = await call('POST', '/api/employees-update', { headers: auth('admin-1', '1234'), body: { nameAr: 'Nobody' } });
  assert.equal(r.status, 400);
  assert.equal(r.json?.success, false);
  assert.equal(typeof r.json?.error, 'string');
  assert.ok(!/object Object/i.test(r.text));
});
await test('POST /api/employees-update with unknown id → 404 Employee not found.', async () => {
  const r = await call('POST', '/api/employees-update', { headers: auth('admin-1', '1234'), body: { id: 'emp-ghost', nameAr: 'Ghost' } });
  assert.equal(r.status, 404);
  assert.equal(r.json?.error, 'Employee not found.');
});
await test('POST /api/employees-delete removes the employee and tombstones the id', async () => {
  const created = await call('POST', '/api/employees', { headers: auth('admin-1', '1234'), body: { code: 'EMP555', nameAr: 'Temp Delete', pin: '5555' } });
  assert.equal(created.status, 201);
  const id = created.json?.employee?.id;
  assert.ok(id);
  const r = await call('POST', '/api/employees-delete', { headers: auth('admin-1', '1234'), body: { id } });
  assert.equal(r.status, 200);
  assert.equal(r.json?.deletedId, id);
  const leftover = await row(`SELECT id FROM employees WHERE id = '${id}'`);
  assert.equal(leftover.length, 0);
});
await test('POST /api/notifications-read marks semantic duplicates read too', async () => {
  const r = await call('POST', '/api/notifications-read', { body: { userId: 'emp-a', id: 'notif-1' } });
  assert.equal(r.status, 200);
  assert.equal(r.json?.success, true);
  assert.ok(Array.isArray(r.json?.notifications));
  const states = await row(`SELECT id, is_read FROM notifications WHERE recipient_id = 'emp-a' ORDER BY id`);
  const byId = new Map(states.map((s: any) => [s.id, s.is_read]));
  assert.equal(byId.get('notif-1'), true);
  assert.equal(byId.get('notif-2'), true, 'semantic duplicate should be marked read');
  assert.equal(byId.get('notif-3'), true);
});
await test('POST /api/notifications-read unknown id → 404', async () => {
  const r = await call('POST', '/api/notifications-read', { body: { userId: 'emp-a', id: 'nope' } });
  assert.equal(r.status, 404);
  assert.equal(r.json?.updated, false);
});
await test('POST /api/notifications-read without userId → 400', async () => {
  const r = await call('POST', '/api/notifications-read', { body: { id: 'notif-1' } });
  assert.equal(r.status, 400);
});
await test('POST /api/notifications-read-all marks everything read', async () => {
  await client.query(`UPDATE notifications SET is_read = false WHERE recipient_id = 'emp-a'`);
  const r = await call('POST', '/api/notifications-read-all', { body: { userId: 'emp-a' } });
  assert.equal(r.status, 200);
  assert.equal(r.json?.success, true);
  const unread = await row(`SELECT COUNT(*)::int AS c FROM notifications WHERE recipient_id = 'emp-a' AND is_read = false`);
  assert.equal(unread[0].c, 0);
});

// ---------------------------------------------------------------------------
server.close();
await client.end();
await pg.stop();
console.log(`\n===== RESULTS: ${passed} passed, ${failed} failed =====`);
const failedTests = results.filter(r => !r.ok);
if (failedTests.length) {
  console.error('Failed tests:');
  for (const t of failedTests) console.error(`  ✗ ${t.name}: ${t.error}`);
  process.exit(1);
}
process.exit(0);

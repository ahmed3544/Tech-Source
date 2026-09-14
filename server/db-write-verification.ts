import crypto from 'crypto';
import { sql, eq } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import * as schema from '../src/db/schema.js';

const pathOf = (req:any) => String(req.path || req.url || '').split('?')[0].replace(/\/+$/, '') || '/';
const clean = (v:any) => String(v ?? '').trim();
const idHash = (v:any) => crypto.createHash('sha256').update(clean(v)).digest('hex').slice(0, 12);

async function verifyCollection(name:string, items:any[]) {
  if (!items.length) return { requested: 0, found: 0 };
  const ids = items.map(x => clean(x?.id)).filter(Boolean);
  if (!ids.length) return { requested: items.length, found: 0 };
  let found = 0;
  if (name === 'employees') {
    const rows = await db.select({ id: schema.employees.id }).from(schema.employees);
    const set = new Set(rows.map(x => String(x.id)));
    found = ids.filter(id => set.has(id)).length;
  } else if (name === 'attendanceRecords') {
    const rows = await db.select({ id: schema.attendanceRecords.id }).from(schema.attendanceRecords);
    const set = new Set(rows.map(x => String(x.id)));
    found = ids.filter(id => set.has(id)).length;
  } else if (name === 'leaveRequests') {
    const rows = await db.select({ id: schema.leaveRequests.id }).from(schema.leaveRequests);
    const set = new Set(rows.map(x => String(x.id)));
    found = ids.filter(id => set.has(id)).length;
  } else if (name === 'notifications') {
    const rows = await db.select({ id: schema.notifications.id }).from(schema.notifications);
    const set = new Set(rows.map(x => String(x.id)));
    found = ids.filter(id => set.has(id)).length;
  } else if (name === 'shifts') {
    const rows = await db.select({ id: schema.shifts.id }).from(schema.shifts);
    const set = new Set(rows.map(x => String(x.id));
    found = ids.filter(id => set.has(id)).length;
  } else if (name === 'employeeShiftAssignments') {
    const rows = await db.select({ id: schema.employeeShiftAssignments.id }).from(schema.employeeShiftAssignments);
    const set = new Set(rows.map(x => String(x.id)));
    found = ids.filter(id => set.has(id)).length;
  }
  return { requested: items.length, found };
}

async function verifySchedule(items:any[]) {
  if (!items.length) return { requested: 0, found: 0 };
  const rows = await db.select().from(schema.settings).where(eq(schema.settings.key, 'dailyShiftAssignments'));
  const stored = Array.isArray(rows[0]?.value) ? rows[0].value : [];
  const keys = new Set(stored.map((x:any) => `${clean(x?.employeeId)}|${clean(x?.date)}`));
  const found = items.filter((x:any) => keys.has(`${clean(x?.employeeId || x?.employee_id)}|${clean(x?.date)}`)).length;
  return { requested: items.length, found };
}

async function verifyDbIdentity() {
  const result:any = await db.execute(sql`select current_database() as database_name, current_schema() as schema_name, current_user as db_user, inet_server_addr()::text as server_addr`);
  const row:any = result?.rows?.[0] || result?.[0] || {};
  return {
    database: row.database_name || null,
    schema: row.schema_name || null,
    user: row.db_user || null,
    serverHash: row.server_addr ? idHash(row.server_addr) : null,
  };
}

export function registerDbWriteVerification(app:any) {
  app.use((req:any, res:any, next:any) => {
    const p = pathOf(req);
    const isSync = req.method === 'POST' && (p === '/api/sync' || p === '/sync');
    const isSchedule = req.method === 'POST' && p === '/api/schedule-sync';
    if (!isSync && !isSchedule) return next();

    const originalJson = res.json.bind(res);
    res.json = async (body:any) => {
      try {
        const b = req.body || {};
        const verification:any = { database: await verifyDbIdentity() };
        if (isSync) {
          verification.employees = await verifyCollection('employees', Array.isArray(b.employees) ? b.employees : []);
          verification.attendanceRecords = await verifyCollection('attendanceRecords', Array.isArray(b.attendanceRecords) ? b.attendanceRecords : []);
          verification.leaveRequests = await verifyCollection('leaveRequests', Array.isArray(b.leaveRequests) ? b.leaveRequests : []);
          verification.notifications = await verifyCollection('notifications', Array.isArray(b.notifications) ? b.notifications : []);
          verification.shifts = await verifyCollection('shifts', Array.isArray(b.shifts) ? b.shifts : []);
          verification.employeeShiftAssignments = await verifyCollection('employeeShiftAssignments', Array.isArray(b.employeeShiftAssignments) ? b.employeeShiftAssignments : []);
          verification.dailyShiftAssignments = await verifySchedule(Array.isArray(b.dailyShiftAssignments) ? b.dailyShiftAssignments : []);
        } else {
          verification.dailyShiftAssignments = await verifySchedule(Array.isArray(b.dailyShiftAssignments) ? b.dailyShiftAssignments : []);
        }
        const failed = Object.entries(verification).some(([key,value]:any) => key !== 'database' && Number(value?.requested || 0) > Number(value?.found || 0));
        if (failed) {
          console.error('[db-write-verification] persistence mismatch', JSON.stringify(verification));
          return originalJson({ success:false, error:'NEON_WRITE_VERIFICATION_FAILED', verification });
        }
        if (body && typeof body === 'object' && !Array.isArray(body)) {
          body = { ...body, neonWriteVerified: true, neonVerification: verification };
        }
      } catch (error) {
        console.error('[db-write-verification] verification error:', error);
        return originalJson({ success:false, error:'NEON_WRITE_VERIFICATION_ERROR' });
      }
      return originalJson(body);
    };
    next();
  });
}

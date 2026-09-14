import { and, eq } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import * as schema from '../src/db/schema.js';

const TZ = process.env.SERVER_TIME_ZONE || 'Africa/Cairo';

function cairoParts() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date());
  const p: any = {};
  for (const x of parts) if (x.type !== 'literal') p[x.type] = x.value;
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    time: `${p.hour}:${p.minute}:${p.second}`,
    iso: new Date().toISOString()
  };
}

function normalizeAction(value: any) {
  const x = String(value || '').trim().toLowerCase().replace(/[-\s]/g, '_');
  if (x === 'checkin' || x === 'check_in' || x === 'in') return 'check_in';
  if (x === 'checkout' || x === 'check_out' || x === 'out') return 'check_out';
  if (x === 'breakstart' || x === 'break_start' || x === 'start_break') return 'break_start';
  if (x === 'breakend' || x === 'break_end' || x === 'end_break') return 'break_end';
  if (x === 'forcebreakend' || x === 'force_break_end' || x === 'force_break_end_break') return 'force_break_end';
  return x;
}

const norm = (value: any) => String(value ?? '').trim().toLowerCase();
const allowedActions = ['check_in', 'check_out', 'break_start', 'break_end', 'force_break_end'];

export function registerAttendanceRealtime(app: any) {
  app.post('/api/punch', async (req: any, res: any) => {
    try {
      const requestedEmployeeId = String(req.body?.employeeId || req.body?.employee_id || '').trim();
      const action = normalizeAction(req.body?.action || req.body?.type);
      if (!requestedEmployeeId) {
        return res.status(400).json({ success: false, error: 'EMPLOYEE_ID_REQUIRED' });
      }
      if (!allowedActions.includes(action)) {
        console.warn('[attendance-realtime] invalid punch action', { action, requestedEmployeeId });
        return res.status(400).json({ success: false, error: 'INVALID_PUNCH_ACTION', action, allowedActions });
      }

      const clock = cairoParts();
      const employeePayload = req.body?.employee || null;
      const allEmployees = await db.select().from(schema.employees);
      let employee: any = allEmployees.find((row: any) => norm(row.id) === norm(requestedEmployeeId));

      if (!employee) {
        employee = allEmployees.find((row: any) =>
          norm(row.code) === norm(requestedEmployeeId) ||
          norm(row.email) === norm(requestedEmployeeId)
        );
      }

      if (!employee && employeePayload?.id) {
        const id = String(employeePayload.id).trim();
        const values: any = {
          id,
          code: employeePayload.code ?? null,
          nameAr: String(employeePayload.nameAr || employeePayload.nameEn || id),
          nameEn: String(employeePayload.nameEn || employeePayload.nameAr || id),
          avatar: employeePayload.avatar ?? null,
          email: employeePayload.email ?? null,
          phone: employeePayload.phone ?? null,
          department: employeePayload.department ?? null,
          jobTitleAr: employeePayload.jobTitleAr ?? null,
          jobTitleEn: employeePayload.jobTitleEn ?? null,
          shiftId: employeePayload.shiftId ?? null,
          pin: employeePayload.pin ?? null,
          role: employeePayload.role ?? 'employee',
          joinedDate: employeePayload.joinedDate ?? null,
          status: employeePayload.status ?? 'active',
          annualLeaveBalance: employeePayload.annualLeaveBalance ?? 15,
          casualLeaveBalance: employeePayload.casualLeaveBalance ?? 7,
          regularLeaveBalance: employeePayload.regularLeaveBalance ?? 8,
          sickLeaveBalance: employeePayload.sickLeaveBalance ?? 30,
          isPhotoRemoved: Boolean(employeePayload.isPhotoRemoved),
          updatedAt: new Date().toISOString(),
        };
        await db.insert(schema.employees).values(values as any).onConflictDoNothing({ target: schema.employees.id });
        const inserted = await db.select().from(schema.employees).where(eq(schema.employees.id, id));
        employee = inserted[0];
      }

      if (!employee) {
        console.warn('[attendance-realtime] employee not found', { requestedEmployeeId, available: allEmployees.length });
        return res.status(404).json({ success: false, error: 'EMPLOYEE_NOT_FOUND', employeeId: requestedEmployeeId });
      }

      const employeeId = String(employee.id);
      const rows = await db.select().from(schema.attendanceRecords).where(and(
        eq(schema.attendanceRecords.employeeId, employeeId),
        eq(schema.attendanceRecords.date, clock.date)
      ));
      const existing: any = rows[0];
      const bodyRecord: any = req.body?.record || {};
      const nowIso = new Date().toISOString();
      const updatedRecord: any = {
        ...(existing || {}),
        ...bodyRecord,
        id: existing?.id || bodyRecord.id || `${employeeId}-${clock.date}`,
        employeeId,
        date: clock.date,
        updatedAt: nowIso
      };

      if (action === 'check_in') updatedRecord.checkIn = clock.time;
      if (action === 'check_out') updatedRecord.checkOut = clock.time;
      if (action === 'break_start') updatedRecord.breakStart = clock.time;
      if (action === 'break_end' || action === 'force_break_end') updatedRecord.breakEnd = clock.time;

      if (!existing) await db.insert(schema.attendanceRecords).values(updatedRecord as any);
      else await db.update(schema.attendanceRecords).set(updatedRecord as any).where(eq(schema.attendanceRecords.id, existing.id));

      const attendanceRecords = await db.select().from(schema.attendanceRecords);
      return res.json({ success: true, record: updatedRecord, attendanceRecords, employee, lastUpdated: Date.now() });
    } catch (error) {
      console.error('[attendance-realtime]', error);
      return res.status(500).json({ success: false, error: 'Attendance update failed' });
    }
  });
}

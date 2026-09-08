import { and, eq } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import * as schema from '../src/db/schema.js';

const clean = (value: any) => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return value;
};

const pick = (source: any, keys: string[]) => {
  const out: Record<string, any> = {};
  for (const key of keys) {
    if (source?.[key] !== undefined) out[key] = clean(source[key]);
  }
  return out;
};

async function upsertEmployee(e: any) {
  if (!e?.id) return;
  const id = String(e.id);
  const values = pick(e, [
    'id','code','nameAr','nameEn','avatar','email','phone','department',
    'jobTitleAr','jobTitleEn','shiftId','pin','role','joinedDate','status',
    'annualLeaveBalance','casualLeaveBalance','regularLeaveBalance',
    'sickLeaveBalance','isPhotoRemoved'
  ]);
  const existing = await db.select().from(schema.employees).where(eq(schema.employees.id, id));
  if (!existing[0]) await db.insert(schema.employees).values(values as any);
  else await db.update(schema.employees).set(values as any).where(eq(schema.employees.id, id));
}

async function upsertAttendance(r: any) {
  if (!r?.employeeId || !r?.date) return;
  const employeeId = String(r.employeeId);
  const date = String(r.date).slice(0, 10);
  const values = pick(r, [
    'id','employeeId','date','checkIn','checkOut','breakStart','breakEnd','breaks',
    'totalBreakSeconds','location','deviceInfo','lateMinutes','lateSeconds',
    'earlyLeaveMinutes','workHours','overtimeHours','minusHours','status','leaveType',
    'notes','verifiedByFace','isExcused','excusedBy','excusedReason','updatedAt',
    'isExplicitCancelCheckOut'
  ]);
  values.employeeId = employeeId;
  values.date = date;
  const existing = await db.select().from(schema.attendanceRecords).where(
    and(eq(schema.attendanceRecords.employeeId, employeeId), eq(schema.attendanceRecords.date, date))
  );
  if (!existing[0]) await db.insert(schema.attendanceRecords).values(values as any);
  else {
    const incoming = new Date(String(values.updatedAt || '')).getTime();
    const current = new Date(String((existing[0] as any).updatedAt || '')).getTime();
    if (!Number.isFinite(current) || !Number.isFinite(incoming) || incoming >= current) {
      await db.update(schema.attendanceRecords).set(values as any).where(eq(schema.attendanceRecords.id, (existing[0] as any).id));
    }
  }
}

async function upsertLeave(r: any) {
  if (!r?.id || !r?.employeeId) return;
  const id = String(r.id);
  const values = pick(r, [
    'id','employeeId','type','startDate','endDate','reason','status','createdAt','hours',
    'permissionSlot','attachmentUrl','attachmentName','reviewedBy','reviewNotes'
  ]);
  const existing = await db.select().from(schema.leaveRequests).where(eq(schema.leaveRequests.id, id));
  if (!existing[0]) await db.insert(schema.leaveRequests).values(values as any);
  else await db.update(schema.leaveRequests).set(values as any).where(eq(schema.leaveRequests.id, id));
}

async function upsertOvertime(r: any) {
  if (!r?.id || !r?.employeeId) return;
  const id = String(r.id);
  const values = pick(r, [
    'id','employeeId','date','type','durationSeconds','reason','status','reviewedBy',
    'reviewNotes','createdAt','updatedAt'
  ]);
  const existing = await db.select().from(schema.overtimeRequests).where(eq(schema.overtimeRequests.id, id));
  if (!existing[0]) await db.insert(schema.overtimeRequests).values(values as any);
  else await db.update(schema.overtimeRequests).set(values as any).where(eq(schema.overtimeRequests.id, id));
}

async function upsertShift(r: any) {
  if (!r?.id || !r?.name) return;
  const id = String(r.id);
  const values = pick(r, [
    'id','name','startTime','endTime','durationMinutes','breakMinutes','gracePeriodMinutes',
    'overtimeEnabled','isOvernight','createdAt','updatedAt'
  ]);
  const existing = await db.select().from(schema.shifts).where(eq(schema.shifts.id, id));
  if (!existing[0]) await db.insert(schema.shifts).values(values as any);
  else await db.update(schema.shifts).set(values as any).where(eq(schema.shifts.id, id));
}

async function setSetting(key: string, value: any) {
  const existing = await db.select().from(schema.settings).where(eq(schema.settings.key, key));
  if (!existing[0]) await db.insert(schema.settings).values({ key, value } as any);
  else await db.update(schema.settings).set({ value } as any).where(eq(schema.settings.key, key));
}

async function deleteIds(table: any, ids: any) {
  if (!Array.isArray(ids)) return;
  for (const raw of ids) {
    const id = String(raw || '').trim();
    if (id) await db.delete(table).where(eq(table.id, id));
  }
}

async function readSnapshot() {
  const [employees, attendanceRecords, leaveRequests, overtimeRequests, shifts, notifications, settings, employeeShiftAssignments] = await Promise.all([
    db.select().from(schema.employees),
    db.select().from(schema.attendanceRecords),
    db.select().from(schema.leaveRequests),
    db.select().from(schema.overtimeRequests),
    db.select().from(schema.shifts),
    db.select().from(schema.notifications),
    db.select().from(schema.settings),
    db.select().from(schema.employeeShiftAssignments),
  ]);
  const settingsMap = new Map(settings.map((s: any) => [s.key, s.value]));
  return {
    success: true,
    employees,
    attendanceRecords,
    leaveRequests,
    overtimeRequests,
    shifts,
    notifications,
    dailyShiftAssignments: Array.isArray(settingsMap.get('dailyShiftAssignments')) ? settingsMap.get('dailyShiftAssignments') : [],
    shiftSwapRequests: Array.isArray(settingsMap.get('shiftSwapRequests')) ? settingsMap.get('shiftSwapRequests') : [],
    companyNameAr: settingsMap.get('companyNameAr') ?? null,
    companyNameEn: settingsMap.get('companyNameEn') ?? null,
    urgentNotice: settingsMap.get('urgentNotice') ?? null,
    employeeShiftAssignments,
    lastUpdated: Date.now(),
  };
}

export function registerDeviceSyncV2(app: any) {
  app.use(async (req: any, res: any, next: any) => {
    if (req.method !== 'POST' || !req.path.startsWith('/api/sync') || !process.env.SUPABASE_DB_URL) return next();

    try {
      const body = req.body || {};
      const hasMutation = [
        'employees','attendanceRecords','leaveRequests','overtimeRequests','shifts',
        'dailyShiftAssignments','shiftSwapRequests','companyNameAr','companyNameEn',
        'urgentNotice','deletedAttendanceIds','deletedEmployeeIds','deletedLeaveIds'
      ].some((key) => body[key] !== undefined);

      if (!hasMutation) return next();

      for (const e of Array.isArray(body.employees) ? body.employees : []) await upsertEmployee(e);
      for (const r of Array.isArray(body.attendanceRecords) ? body.attendanceRecords : []) await upsertAttendance(r);
      for (const r of Array.isArray(body.leaveRequests) ? body.leaveRequests : []) await upsertLeave(r);
      for (const r of Array.isArray(body.overtimeRequests) ? body.overtimeRequests : []) await upsertOvertime(r);
      for (const s of Array.isArray(body.shifts) ? body.shifts : []) await upsertShift(s);

      if (Array.isArray(body.dailyShiftAssignments)) await setSetting('dailyShiftAssignments', body.dailyShiftAssignments);
      if (Array.isArray(body.shiftSwapRequests)) await setSetting('shiftSwapRequests', body.shiftSwapRequests);
      if (body.companyNameAr !== undefined) await setSetting('companyNameAr', body.companyNameAr);
      if (body.companyNameEn !== undefined) await setSetting('companyNameEn', body.companyNameEn);
      if (body.urgentNotice !== undefined) await setSetting('urgentNotice', body.urgentNotice);

      await deleteIds(schema.attendanceRecords, body.deletedAttendanceIds);
      await deleteIds(schema.employees, body.deletedEmployeeIds);
      await deleteIds(schema.leaveRequests, body.deletedLeaveIds);

      return res.json(await readSnapshot());
    } catch (error) {
      console.error('[device-sync-v2] sync failed:', error);
      return res.status(500).json({ success: false, error: 'Cross-device sync failed' });
    }
  });
}

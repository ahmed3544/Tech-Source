import type { Express, Request, Response } from 'express';
import { db } from '../server/db.js';
import { attendanceRecords, employees, leaveRequests, notifications, settings, shifts, dailyShiftAssignments, shiftSwapRequests } from '../src/db/schema.js';
import { eq, sql } from 'drizzle-orm';

type AnyRecord = Record<string, any>;

function timestamp(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && value.trim() !== '') return numeric;
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function noStore(res: Response) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
}

function newer(a: AnyRecord, b: AnyRecord) {
  return timestamp(a?.updatedAt ?? a?.lastUpdated ?? a?.timestamp) >= timestamp(b?.updatedAt ?? b?.lastUpdated ?? b?.timestamp);
}

function mergeByKey(local: AnyRecord[], remote: AnyRecord[], key: (x: AnyRecord) => string) {
  const map = new Map<string, AnyRecord>();
  for (const item of remote) map.set(key(item), item);
  for (const item of local) {
    const k = key(item);
    const current = map.get(k);
    if (!current || newer(item, current)) map.set(k, item);
  }
  return [...map.values()];
}

async function snapshot() {
  const [employeeRows, attendanceRows, leaveRows, notificationRows, shiftRows, assignmentRows, swapRows, settingRows] = await Promise.all([
    db.select().from(employees),
    db.select().from(attendanceRecords),
    db.select().from(leaveRequests),
    db.select().from(notifications),
    db.select().from(shifts),
    db.select().from(dailyShiftAssignments),
    db.select().from(shiftSwapRequests),
    db.select().from(settings),
  ]);

  return {
    employees: employeeRows,
    attendanceRecords: attendanceRows,
    leaveRequests: leaveRows,
    notifications: notificationRows,
    shifts: shiftRows,
    dailyShiftAssignments: assignmentRows,
    shiftSwapRequests: swapRows,
    settings: settingRows,
    lastUpdated: Date.now(),
  };
}

export function registerDeviceSyncV2(app: Express) {
  app.get('/api/data', async (_req: Request, res: Response) => {
    noStore(res);
    try {
      res.json(await snapshot());
    } catch (error) {
      console.error('[DEVICE-SYNC] GET /api/data failed', error);
      res.status(500).json({ error: 'Failed to load data' });
    }
  });

  app.post('/api/sync', async (req: Request, res: Response) => {
    noStore(res);
    try {
      const body = (req.body ?? {}) as AnyRecord;
      const localAttendance = Array.isArray(body.attendanceRecords) ? body.attendanceRecords : [];
      const localEmployees = Array.isArray(body.employees) ? body.employees : [];
      const localLeaves = Array.isArray(body.leaveRequests) ? body.leaveRequests : [];
      const localNotifications = Array.isArray(body.notifications) ? body.notifications : [];
      const localShifts = Array.isArray(body.shifts) ? body.shifts : [];
      const localAssignments = Array.isArray(body.dailyShiftAssignments) ? body.dailyShiftAssignments : [];
      const localSwaps = Array.isArray(body.shiftSwapRequests) ? body.shiftSwapRequests : [];

      for (const record of localAttendance) {
        if (!record?.employeeId || !record?.date) continue;
        const [existing] = await db.select().from(attendanceRecords)
          .where(sql`${attendanceRecords.employeeId} = ${record.employeeId} AND ${attendanceRecords.date} = ${record.date}`)
          .limit(1);
        if (existing && timestamp(existing.updatedAt) > timestamp(record.updatedAt ?? body.lastUpdated)) continue;
        const payload = { ...record, updatedAt: new Date(timestamp(record.updatedAt ?? body.lastUpdated ?? Date.now())) };
        if (existing) {
          await db.update(attendanceRecords).set(payload).where(eq(attendanceRecords.id, existing.id));
        } else {
          await db.insert(attendanceRecords).values(payload);
        }
      }

      // Keep the existing merge behavior for the other shared collections.
      for (const item of localEmployees) if (item?.id) await db.insert(employees).values(item).onConflictDoUpdate({ target: employees.id, set: item });
      for (const item of localLeaves) if (item?.id) await db.insert(leaveRequests).values(item).onConflictDoUpdate({ target: leaveRequests.id, set: item });
      for (const item of localNotifications) if (item?.id) await db.insert(notifications).values(item).onConflictDoUpdate({ target: notifications.id, set: item });
      for (const item of localShifts) if (item?.id) await db.insert(shifts).values(item).onConflictDoUpdate({ target: shifts.id, set: item });
      for (const item of localAssignments) if (item?.id) await db.insert(dailyShiftAssignments).values(item).onConflictDoUpdate({ target: dailyShiftAssignments.id, set: item });
      for (const item of localSwaps) if (item?.id) await db.insert(shiftSwapRequests).values(item).onConflictDoUpdate({ target: shiftSwapRequests.id, set: item });

      res.json(await snapshot());
    } catch (error) {
      console.error('[DEVICE-SYNC] POST /api/sync failed', error);
      res.status(500).json({ error: 'Failed to synchronize data' });
    }
  });
}

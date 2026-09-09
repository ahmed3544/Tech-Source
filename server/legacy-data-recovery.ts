import fs from 'fs';
import path from 'path';
import { eq } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import * as schema from '../src/db/schema.js';

let recoveryPromise: Promise<void> | null = null;
const hasDatabase = () => Boolean(process.env.DATABASE_URL || process.env.SUPABASE_DB_URL);
const backupPath = path.join(process.cwd(), 'backups', 'server_data_auto_backup.json');

function readBackup(): any | null {
  try {
    if (!fs.existsSync(backupPath)) return null;
    const parsed = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (error) {
    console.warn('[legacy-recovery] unable to read backup:', error);
    return null;
  }
}

async function insertMissing(table: any, items: any[], idField = 'id') {
  if (!Array.isArray(items)) return 0;
  let inserted = 0;
  for (const item of items) {
    const id = item?.[idField];
    if (!id) continue;
    const existing = await db.select({ id: table[idField] }).from(table).where(eq(table[idField], String(id))).limit(1);
    if (existing.length) continue;
    try {
      await db.insert(table).values(item as any);
      inserted += 1;
    } catch (error) {
      console.warn(`[legacy-recovery] skipped record ${id}:`, error);
    }
  }
  return inserted;
}

async function recoverSettings(data: any) {
  const ignored = new Set([
    'employees', 'attendanceRecords', 'leaveRequests', 'overtimeRequests',
    'shifts', 'notifications', 'employeeShiftAssignments', 'deletedEmployeeKeys',
    'deletedAttendanceKeys', 'deletedLeaveKeys', 'lastUpdated'
  ]);
  let inserted = 0;
  for (const [key, value] of Object.entries(data || {})) {
    if (ignored.has(key) || String(key).startsWith('__sync_updated_at:')) continue;
    const existing = await db.select({ key: schema.settings.key }).from(schema.settings).where(eq(schema.settings.key, key)).limit(1);
    if (existing.length) continue;
    await db.insert(schema.settings).values({ key, value } as any);
    inserted += 1;
  }
  return inserted;
}

export async function recoverMissingLegacyData() {
  if (!hasDatabase()) return;
  if (!recoveryPromise) {
    recoveryPromise = (async () => {
      const data = readBackup();
      if (!data) return;
      const counts = {
        employees: await insertMissing(schema.employees, data.employees),
        attendance: 0,
        leave: await insertMissing(schema.leaveRequests, data.leaveRequests),
        overtime: await insertMissing(schema.overtimeRequests, data.overtimeRequests),
        shifts: await insertMissing(schema.shifts, data.shifts),
        assignments: await insertMissing(schema.employeeShiftAssignments, data.employeeShiftAssignments),
        notifications: await insertMissing(schema.notifications, data.notifications),
        settings: await recoverSettings(data),
      };
      if (Array.isArray(data.attendanceRecords)) {
        for (const record of data.attendanceRecords) {
          if (!record?.employeeId || !record?.date) continue;
          const id = `rec-${String(record.employeeId).toLowerCase()}-${record.date}`;
          const rows = await db.select({ id: schema.attendanceRecords.id }).from(schema.attendanceRecords).where(eq(schema.attendanceRecords.id, id)).limit(1);
          if (rows.length) continue;
          try {
            await db.insert(schema.attendanceRecords).values({
              id, employeeId: String(record.employeeId), date: String(record.date),
              checkIn: record.checkIn || null, checkOut: record.checkOut || null,
              breakStart: record.breakStart || null, breakEnd: record.breakEnd || null,
              breaks: record.breaks || null, totalBreakSeconds: record.totalBreakSeconds || 0,
              location: record.location || null, deviceInfo: record.deviceInfo || null,
              lateMinutes: record.lateMinutes || 0, lateSeconds: record.lateSeconds || 0,
              earlyLeaveMinutes: record.earlyLeaveMinutes || 0, workHours: record.workHours || 0,
              overtimeHours: record.overtimeHours || 0, minusHours: record.minusHours || 0,
              status: record.status || 'in_progress', leaveType: record.leaveType || null,
              notes: record.notes || null, verifiedByFace: !!record.verifiedByFace,
              isExcused: !!record.isExcused, excusedBy: record.excusedBy || null,
              excusedReason: record.excusedReason || null,
              updatedAt: record.updatedAt || new Date().toISOString(),
              isExplicitCancelCheckOut: !!record._isExplicitCancelCheckOut,
            } as any);
            counts.attendance += 1;
          } catch (error) {
            console.warn('[legacy-recovery] skipped attendance record:', error);
          }
        }
      }
      console.log('[legacy-recovery] safe recovery complete', counts);
    })().catch(error => {
      recoveryPromise = null;
      console.error('[legacy-recovery] failed:', error);
    });
  }
  return recoveryPromise;
}

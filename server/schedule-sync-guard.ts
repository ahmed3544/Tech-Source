import { and, eq } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import * as schema from '../src/db/schema.js';

const isSyncPath = (req:any) => ['/api/sync','/sync'].includes(String(req.path || req.url || '').split('?')[0].replace(/\/+$/,'') || '/');
const isSchedulePayload = (body:any) => Array.isArray(body?.dailyShiftAssignments);
const dateKey = (value:any) => {
  const raw = String(value ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
};

function normalizeAssignment(item:any, assignedBy?:string) {
  const employeeId = String(item?.employeeId ?? item?.employee_id ?? '').trim();
  const date = dateKey(item?.date ?? item?.scheduleDate ?? item?.schedule_date);
  const isOffDay = Boolean(item?.isOffDay ?? item?.is_off_day ?? String(item?.status ?? '').toUpperCase() === 'OFF');
  const rawShift = item?.shiftId ?? item?.shift_id ?? null;
  const shiftId = isOffDay ? null : (rawShift == null ? null : String(rawShift).trim() || null);
  return {
    employeeId,
    date,
    shiftId,
    isOffDay,
    assignedBy: String(item?.assignedBy ?? item?.assigned_by ?? assignedBy ?? '').trim() || undefined,
    updatedAt: item?.updatedAt || item?.updated_at || new Date().toISOString(),
  };
}

function mergeAssignments(existing:any, incoming:any[]) {
  const map = new Map<string, any>();
  for (const item of Array.isArray(existing) ? existing : []) {
    const employeeId = String(item?.employeeId ?? item?.employee_id ?? '').trim();
    const date = dateKey(item?.date ?? item?.scheduleDate ?? item?.schedule_date);
    if (employeeId && date) map.set(`${employeeId}:${date}`, item);
  }
  for (const item of incoming) {
    const normalized = normalizeAssignment(item);
    if (!normalized.employeeId || !normalized.date) continue;
    map.set(`${normalized.employeeId}:${normalized.date}`, normalized);
  }
  return Array.from(map.values());
}

/**
 * Handles the weekly schedule payload before the generic device sync layer.
 * The frontend already posts to /api/sync, so this keeps that contract while
 * normalizing camelCase/snake_case fields and returning a real JSON success.
 */
export function registerScheduleSyncGuard(app:any) {
  app.use(async (req:any, res:any, next:any) => {
    if (req.method !== 'POST' || !isSyncPath(req) || !isSchedulePayload(req.body)) return next();

    try {
      const raw = req.body?.dailyShiftAssignments;
      const incoming = raw.map((item:any) => normalizeAssignment(item, req.body?.assignedBy));
      const invalid = incoming.find((item:any) => !item.employeeId || !item.date || !/^\d{4}-\d{2}-\d{2}$/.test(item.date));
      if (invalid) {
        return res.status(400).json({
          success: false,
          code: 'INVALID_SCHEDULE_PAYLOAD',
          message: 'Each schedule assignment requires employee_id, YYYY-MM-DD date, and shift_id or OFF.',
        });
      }

      const settingsRows = await db.select().from(schema.settings).where(eq(schema.settings.key, 'dailyShiftAssignments'));
      const existing = settingsRows[0]?.value;
      const merged = mergeAssignments(existing, incoming);
      const key = 'dailyShiftAssignments';

      if (settingsRows[0]) {
        await db.update(schema.settings).set({ value: merged } as any).where(eq(schema.settings.key, key));
      } else {
        await db.insert(schema.settings).values({ key, value: merged } as any);
      }

      const stampKey = '__sync_updated_at:dailyShiftAssignments';
      const now = new Date().toISOString();
      const stampRows = await db.select().from(schema.settings).where(eq(schema.settings.key, stampKey));
      if (stampRows[0]) {
        await db.update(schema.settings).set({ value: now } as any).where(eq(schema.settings.key, stampKey));
      } else {
        await db.insert(schema.settings).values({ key: stampKey, value: now } as any);
      }

      return res.status(200).json({
        success: true,
        message: 'Schedule saved and synchronized successfully.',
        dailyShiftAssignments: merged,
        savedCount: incoming.length,
        updatedAt: now,
      });
    } catch (error:any) {
      console.error('[schedule-sync]', error);
      return res.status(500).json({
        success: false,
        code: 'SCHEDULE_SYNC_FAILED',
        message: error?.message || 'Schedule synchronization failed.',
      });
    }
  });
}

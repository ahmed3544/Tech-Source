import { eq } from 'drizzle-orm';
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

const timeMs = (value:any) => {
  const t = new Date(String(value ?? '')).getTime();
  return Number.isFinite(t) ? t : 0;
};

function normalizeAssignment(item:any, assignedBy?:string, fallbackUpdatedAt?:string) {
  const employeeId = String(item?.employeeId ?? item?.employee_id ?? '').trim();
  const date = dateKey(item?.date ?? item?.scheduleDate ?? item?.schedule_date);
  const isOffDay = Boolean(item?.isOffDay ?? item?.is_off_day ?? String(item?.status ?? '').toUpperCase() === 'OFF');
  const rawShift = item?.shiftId ?? item?.shift_id ?? null;
  const shiftId = isOffDay ? null : (rawShift == null ? null : String(rawShift).trim() || null);
  const updatedAt = String(item?.updatedAt ?? item?.updated_at ?? fallbackUpdatedAt ?? new Date().toISOString());

  return {
    employeeId,
    date,
    shiftId,
    isOffDay,
    assignedBy: String(item?.assignedBy ?? item?.assigned_by ?? assignedBy ?? '').trim() || undefined,
    updatedAt,
  };
}

function mergeAssignments(existing:any, incoming:any[]) {
  const map = new Map<string, any>();

  for (const item of Array.isArray(existing) ? existing : []) {
    const normalized = normalizeAssignment(item);
    if (normalized.employeeId && normalized.date) map.set(`${normalized.employeeId}:${normalized.date}`, normalized);
  }

  let ignoredStale = 0;
  for (const item of incoming) {
    const normalized = normalizeAssignment(item);
    if (!normalized.employeeId || !normalized.date) continue;
    const key = `${normalized.employeeId}:${normalized.date}`;
    const current = map.get(key);
    if (current && timeMs(normalized.updatedAt) < timeMs(current.updatedAt)) {
      ignoredStale += 1;
      continue;
    }
    map.set(key, normalized);
  }

  return { assignments: Array.from(map.values()), ignoredStale };
}

async function upsertSetting(key:string, value:any) {
  const rows = await db.select().from(schema.settings).where(eq(schema.settings.key, key));
  if (rows[0]) {
    await db.update(schema.settings).set({ value } as any).where(eq(schema.settings.key, key));
    return;
  }
  try {
    await db.insert(schema.settings).values({ key, value } as any);
  } catch (error) {
    // Another request may have inserted the same key between SELECT and INSERT.
    // Re-read and update instead of converting a successful schedule save to HTTP 500.
    const retry = await db.select().from(schema.settings).where(eq(schema.settings.key, key));
    if (retry[0]) {
      await db.update(schema.settings).set({ value } as any).where(eq(schema.settings.key, key));
      return;
    }
    throw error;
  }
}

export function registerScheduleSyncGuard(app:any) {
  app.use(async (req:any, res:any, next:any) => {
    if (req.method !== 'POST' || !isSyncPath(req) || !isSchedulePayload(req.body)) return next();

    const requestTimestamp = String(req.headers?.['x-sync-timestamp'] ?? req.body?.syncTimestamp ?? new Date().toISOString());
    const requestRevision = String(req.headers?.['x-sync-revision'] ?? req.body?.syncRevision ?? requestTimestamp);
    const assignedBy = String(req.body?.assignedBy ?? req.body?.assigned_by ?? '').trim() || undefined;

    try {
      const raw = req.body?.dailyShiftAssignments;
      const incoming = raw.map((item:any) => normalizeAssignment(item, assignedBy, requestTimestamp));
      const invalid = incoming.find((item:any) =>
        !item.employeeId || !item.date || !/^\d{4}-\d{2}-\d{2}$/.test(item.date) || (!item.isOffDay && !item.shiftId)
      );

      if (invalid) {
        return res.status(400).json({ success:false, code:'INVALID_SCHEDULE_PAYLOAD', message:'Each schedule assignment requires employee_id, YYYY-MM-DD date, and shift_id or OFF.' });
      }

      const settingsRows = await db.select().from(schema.settings).where(eq(schema.settings.key, 'dailyShiftAssignments'));
      const { assignments: merged, ignoredStale } = mergeAssignments(settingsRows[0]?.value, incoming);

      // Atomic/race-safe persistence: concurrent devices cannot turn a valid save into 500.
      await upsertSetting('dailyShiftAssignments', merged);
      const now = new Date().toISOString();
      await upsertSetting('__sync_updated_at:dailyShiftAssignments', now);

      return res.status(200).json({
        success:true,
        message:'Schedule saved successfully.',
        dailyShiftAssignments:merged,
        savedCount:incoming.length - ignoredStale,
        ignoredStale,
        updatedAt:now,
        syncTimestamp:requestTimestamp,
        syncRevision:requestRevision,
        syncQueued:true,
      });
    } catch (error:any) {
      console.error('[schedule-sync] DATABASE WRITE FAILED:', error);
      return res.status(500).json({ success:false, code:'SCHEDULE_DATABASE_WRITE_FAILED', message:error?.message || 'Schedule database write failed.' });
    }
  });
}

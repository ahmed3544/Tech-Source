import { eq } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import * as schema from '../src/db/schema.js';

const apiPath = (req:any) => String(req.path || req.originalUrl || req.url || '').split('?')[0].replace(/\/+$/,'') || '/';
const isSyncPath = (req:any) => ['/api/sync','/sync'].includes(apiPath(req));
const isSchedulePayload = (body:any) => Array.isArray(body?.dailyShiftAssignments);
const asBoolean = (value:any) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'off';
};
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
  const rawShift = String(item?.shiftId ?? item?.shift_id ?? '').trim();
  const status = String(item?.status ?? '').trim().toUpperCase();
  const clear = Boolean(item?.clear || item?.isClear || item?.is_clear || status === 'CLEAR');
  const isOffDay = !clear && !rawShift && (asBoolean(item?.isOffDay ?? item?.is_off_day) || status === 'OFF');
  const shiftId = clear || isOffDay ? null : rawShift || null;
  const rawUpdatedAt = item?.updatedAt ?? item?.updated_at ?? fallbackUpdatedAt ?? '';
  return { employeeId, date, shiftId, isOffDay, clear, assignedBy: String(item?.assignedBy ?? item?.assigned_by ?? assignedBy ?? '').trim() || undefined, updatedAt: rawUpdatedAt ? String(rawUpdatedAt) : '' };
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
    if (current && !normalized.updatedAt) { ignoredStale += 1; continue; }
    if (current?.updatedAt && normalized.updatedAt && timeMs(normalized.updatedAt) < timeMs(current.updatedAt)) { ignoredStale += 1; continue; }
    if (normalized.clear) map.delete(key); else map.set(key, normalized);
  }
  return { assignments: Array.from(map.values()), ignoredStale };
}

export function registerScheduleSyncGuard(app:any) {
  app.use(async (req:any, res:any, next:any) => {
    const scheduleRequest = req.method === 'POST' && isSyncPath(req) && isSchedulePayload(req.body);
    if (!scheduleRequest) return next();
    try {
      const incoming = req.body.dailyShiftAssignments.map((item:any) => normalizeAssignment(item, req.body?.assignedBy, item?.updatedAt ?? item?.updated_at));
      const invalid = incoming.find((item:any) => !item.employeeId || !/^\d{4}-\d{2}-\d{2}$/.test(item.date) || (!item.isOffDay && !item.shiftId && !item.clear));
      if (invalid) return res.status(400).json({ success:false, code:'INVALID_SCHEDULE_PAYLOAD', message:'Each schedule assignment requires employee_id, YYYY-MM-DD date, shift_id, OFF, or CLEAR.' });
      const settingsRows = await db.select().from(schema.settings).where(eq(schema.settings.key, 'dailyShiftAssignments'));
      const { assignments: merged } = mergeAssignments(settingsRows[0]?.value, incoming);
      // Important: strip schedule rows from the legacy /api/sync payload entirely.
      // The dedicated /api/schedule-sync endpoint is the only schedule writer.
      req.body = { ...req.body, dailyShiftAssignments: undefined, __authoritativeScheduleSnapshot: merged };
      return next();
    } catch (error:any) {
      console.error('[schedule-sync] DATABASE PREPROCESS FAILED:', error);
      return res.status(500).json({ success:false, code:'SCHEDULE_DATABASE_PREPROCESS_FAILED', message:error?.message || 'Schedule database preprocessing failed.' });
    }
  });
}

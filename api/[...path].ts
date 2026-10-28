import app from "../dist/server.js";
import { db } from "../src/db/index.js";
import * as schema from "../src/db/schema.js";
import { eq, inArray } from "drizzle-orm";
import { updateEmployeeHandler, createEmployeeHandler, deleteEmployeeHandler } from "../server/employees.js";
import { requireManager, canManageEmployee, isPlatformAdmin } from "../server/auth.js";
import { logActivity } from "../server/activity-logs.js";
import { ensureSchema } from "../server/ensure-schema.js";
import { sanitizeEmployees } from "../server/employee-sanitize.js";

async function directData(res: any) {
  const [employees, attendanceRecords, leaveRequests, overtimeRequests, shifts, notifications, settings] = await Promise.all([
    db.select().from(schema.employees),
    db.select().from(schema.attendanceRecords),
    db.select().from(schema.leaveRequests),
    db.select().from(schema.overtimeRequests),
    db.select().from(schema.shifts),
    db.select().from(schema.notifications),
    db.select().from(schema.settings),
  ]);
  const settingsMap = new Map(settings.map((row: any) => [String(row.key), row.value]));
  let employeeShiftAssignments: any[] = [];
  try { employeeShiftAssignments = await db.select().from(schema.employeeShiftAssignments); } catch (error) { console.warn('[direct-api] employee_shift_assignments read failed:', error); }
  const breakMap = settingsMap.get('shiftBreaks');
  const breaks = breakMap && typeof breakMap === 'object' && !Array.isArray(breakMap) ? breakMap : {};
  const hydratedShifts = shifts.map((shift: any) => ({ ...shift, breaks: Array.isArray(shift?.breaks) ? shift.breaks : (Array.isArray((breaks as any)[String(shift?.id)]) ? (breaks as any)[String(shift.id)] : []) }));
  return res.json({ success: true, employees: sanitizeEmployees(employees), attendanceRecords, leaveRequests, overtimeRequests, shifts: hydratedShifts, notifications, employeeShiftAssignments, dailyShiftAssignments: Array.isArray(settingsMap.get('dailyShiftAssignments')) ? settingsMap.get('dailyShiftAssignments') : [], shiftSwapRequests: Array.isArray(settingsMap.get('shiftSwapRequests')) ? settingsMap.get('shiftSwapRequests') : [], companyNameAr: settingsMap.get('companyNameAr') ?? null, companyNameEn: settingsMap.get('companyNameEn') ?? null, urgentNotice: settingsMap.get('urgentNotice') ?? null, officialHolidays: Array.isArray(settingsMap.get('officialHolidays')) ? settingsMap.get('officialHolidays') : [], lastUpdated: Date.now() });
}

const HHMM_RE = /^(\d{1,2}):(\d{2})$/;
const minutesOfTime = (value: any): number => {
  const m = HHMM_RE.exec(String(value ?? '').trim());
  if (!m) return NaN;
  const h = Number(m[1]); const mins = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(mins) || h > 23 || mins > 59) return NaN;
  return h * 60 + mins;
};
/** Parses + validates an optional shadowing (training) window.
 *  TRI-STATE: key absent → undefined (keep stored value), null/invalid → null
 *  (remove), object → set. Protects sessions from older clients/importers. */
function normalizeShadowing(raw: any): { traineeId?: string; startTime: string; endTime: string } | null | undefined {
  if (raw === undefined) return undefined;
  if (!raw || typeof raw !== 'object') return null;
  const start = minutesOfTime(raw.startTime ?? raw.start_time ?? raw.start);
  const end = minutesOfTime(raw.endTime ?? raw.end_time ?? raw.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  const traineeId = String(raw.traineeId ?? raw.trainee_id ?? '').trim();
  return {
    ...(traineeId ? { traineeId } : {}),
    startTime: String(raw.startTime ?? raw.start_time ?? raw.start).trim().slice(0, 5).padStart(5, '0'),
    endTime: String(raw.endTime ?? raw.end_time ?? raw.end).trim().slice(0, 5).padStart(5, '0'),
  };
}

function normalizeDirectSchedule(item: any, fallbackUpdatedAt: string) {
  const employeeId = String(item?.employeeId ?? item?.employee_id ?? '').trim();
  const date = String(item?.date ?? item?.scheduleDate ?? item?.schedule_date ?? '').slice(0, 10);
  const shiftId = String(item?.shiftId ?? item?.shift_id ?? '').trim();
  const status = String(item?.status ?? '').trim().toUpperCase();
  const clear = Boolean(item?.clear || item?.isClear || item?.is_clear || status === 'CLEAR');
  const isOffDay = !clear && !shiftId && (
    item?.isOffDay === true ||
    item?.is_off_day === true ||
    String(item?.isOffDay ?? item?.is_off_day ?? '').toLowerCase() === 'true' ||
    status === 'OFF'
  );
  return {
    employeeId,
    date,
    shiftId: clear || isOffDay ? '' : shiftId,
    isOffDay,
    clear,
    shadowing: item && typeof item === 'object' && 'shadowing' in item ? normalizeShadowing(item.shadowing) : undefined,
    assignedBy: item?.assignedBy ?? item?.assigned_by ?? null,
    updatedAt: String(item?.updatedAt ?? item?.updated_at ?? fallbackUpdatedAt),
  };
}

async function directScheduleSync(req: any, res: any) {
  // Server-side permission check (parity with the Express handler): only
  // admins and team leaders may edit schedules, leaders scoped to their team.
  const manager = await requireManager(req, (status, body) => res.status(status).json(body));
  if (!manager) return;
  const incomingRaw = req.body?.dailyShiftAssignments;
  if (!Array.isArray(incomingRaw)) {
    return res.status(400).json({ success: false, error: 'dailyShiftAssignments must be an array' });
  }

  const stamp = new Date().toISOString();
  const received = incomingRaw
    .map((item: any) => normalizeDirectSchedule(item, stamp))
    .filter((item: any) => item.employeeId && /^\d{4}-\d{2}-\d{2}$/.test(item.date));

  // Team scoping: leaders may only edit their own team's rows.
  if (!isPlatformAdmin(manager.role) && received.length) {
    const targetIds: string[] = Array.from(new Set<string>(received.map((x: any) => String(x.employeeId))));
    const targets = await db.select().from(schema.employees).where(inArray(schema.employees.id, targetIds));
    const byId = new Map<string, any>(targets.map((t: any) => [String(t.id), t] as [string, any]));
    const denied = targetIds.filter((tid) => !canManageEmployee(manager, byId.get(tid)));
    if (denied.length) {
      return res.status(403).json({ success: false, error: 'You can only edit schedules for employees in your own team.', deniedEmployeeIds: denied });
    }
  }

  const rows = await db.select().from(schema.settings).where(eq(schema.settings.key, 'dailyShiftAssignments'));
  const existing = Array.isArray(rows[0]?.value) ? rows[0].value : [];
  const merged = new Map<string, any>();
  const previousShadowingByRow = new Map<string, any>();

  for (const item of existing) {
    const normalized = normalizeDirectSchedule(item, stamp);
    if (normalized.employeeId && /^\d{4}-\d{2}-\d{2}$/.test(normalized.date)) {
      merged.set(normalized.employeeId + '|' + normalized.date, normalized);
      previousShadowingByRow.set(normalized.employeeId + '|' + normalized.date, normalized.shadowing ?? null);
    }
  }

  for (const item of received) {
    const key = item.employeeId + '|' + item.date;
    const previous = merged.get(key);
    const previousTime = new Date(String(previous?.updatedAt || '')).getTime();
    const incomingTime = new Date(String(item.updatedAt || stamp)).getTime();
    if (!previous || !Number.isFinite(previousTime) || !Number.isFinite(incomingTime) || incomingTime >= previousTime) {
      if (item.clear) merged.delete(key);
      else merged.set(key, item);
    }
  }

  // Absent shadowing key → carry the previously stored window forward.
  const assignments = Array.from(merged.values()).map((item: any) => ({
    employeeId: item.employeeId,
    date: item.date,
    shiftId: item.shiftId || '',
    isOffDay: Boolean(item.isOffDay),
    shadowing: (item.shadowing === undefined ? previousShadowingByRow.get(item.employeeId + '|' + item.date) : item.shadowing) ?? null,
    assignedBy: item.assignedBy ?? undefined,
    updatedAt: item.updatedAt || stamp,
  }));

  if (rows[0]) {
    await db.update(schema.settings).set({ value: assignments } as any).where(eq(schema.settings.key, 'dailyShiftAssignments'));
  } else {
    await db.insert(schema.settings).values({ key: 'dailyShiftAssignments', value: assignments } as any);
  }

  const stampKey = '__sync_updated_at:dailyShiftAssignments';
  const stampRows = await db.select().from(schema.settings).where(eq(schema.settings.key, stampKey));
  if (stampRows[0]) {
    await db.update(schema.settings).set({ value: stamp } as any).where(eq(schema.settings.key, stampKey));
  } else {
    await db.insert(schema.settings).values({ key: stampKey, value: stamp } as any);
  }

  // Activity log (parity with the Express handler): one summary entry per
  // successful schedule write, with a per-change diff capped at 40 items.
  try {
    const isImport = String(req.body?.source ?? '') === 'excel-import';
    const existingByKey = new Map<string, any>();
    for (const item of existing) {
      const normalized = normalizeDirectSchedule(item, stamp);
      if (normalized.employeeId && /^\d{4}-\d{2}-\d{2}$/.test(normalized.date)) existingByKey.set(normalized.employeeId + '|' + normalized.date, normalized);
    }
    const changedItems: any[] = [];
    for (const row of received) {
      const prev = existingByKey.get(row.employeeId + '|' + row.date);
      const from = prev ? (prev.isOffDay ? 'OFF' : (prev.shiftId || 'WORKING')) : null;
      const to = row.clear ? null : (row.isOffDay ? 'OFF' : (row.shiftId || 'WORKING'));
      const shadowChanged = row.shadowing !== undefined && (!prev ? Boolean(row.shadowing) : JSON.stringify(prev.shadowing ?? null) !== JSON.stringify(row.shadowing ?? null));
      const shadowLabel = (s: any) => (s ? `Shadowing ${s.startTime}-${s.endTime}${s.traineeId ? ` w/${s.traineeId}` : ''}` : null);
      if (row.clear) { if (prev) changedItems.push({ employeeId: row.employeeId, date: row.date, from, to, ...(shadowChanged ? { shadowingFrom: shadowLabel(prev?.shadowing), shadowingTo: null } : {}) }); continue; }
      if (!prev || String(prev.shiftId || '') !== String(row.shiftId || '') || Boolean(prev.isOffDay) !== Boolean(row.isOffDay) || shadowChanged) {
        changedItems.push({ employeeId: row.employeeId, date: row.date, from, to, ...(shadowChanged ? { shadowingFrom: shadowLabel(prev?.shadowing), shadowingTo: shadowLabel(row.shadowing) } : {}) });
      }
    }
    if (changedItems.length || isImport) {
      const dates = received.map((x: any) => String(x.date)).sort();
      logActivity({
        actorId: manager.id,
        actorName: (manager as any).nameAr || (manager as any).nameEn || manager.id,
        actorRole: manager.role,
        action: isImport ? 'schedule.import_excel' : 'schedule.update',
        entityType: 'schedule',
        entityLabel: dates.length ? `${dates[0]} → ${dates[dates.length - 1]}` : null,
        details: {
          changes: changedItems.length,
          received: received.length,
          ...(isImport ? { breakDays: Math.max(0, Number(req.body?.breaksCount ?? 0) || 0) } : {}),
          items: changedItems.slice(0, 40),
        },
      });
    }
  } catch (auditError) { console.error('[direct-schedule-sync] activity log failed:', auditError); }

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  return res.json({
    success: true,
    dailyShiftAssignments: assignments,
    updatedAt: stamp,
    lastUpdated: Date.now(),
  });
}

async function directShadowing(req: any, res: any) {
  const rows = await db.select().from(schema.settings).where(eq(schema.settings.key, 'employeeShadowing'));
  const current = Array.isArray(rows[0]?.value) ? rows[0].value as any[] : [];
  if (req.method === 'GET') {
    const employeeId = String(req.query?.employeeId || '').trim();
    const from = String(req.query?.from || '').slice(0, 10);
    const to = String(req.query?.to || '').slice(0, 10);
    const result: Record<string, { startTime: string; endTime: string }> = {};
    for (const item of current) {
      if (String(item.employeeId) !== employeeId) continue;
      const date = String(item.date || '').slice(0, 10);
      if ((from && date < from) || (to && date > to)) continue;
      if (item.startTime && item.endTime) result[date] = { startTime: String(item.startTime), endTime: String(item.endTime) };
    }
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    return res.json({ success: true, shadowingByDate: result });
  }
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'method_not_allowed' });
  const employeeId = String(req.body?.employeeId || '').trim();
  const date = String(req.body?.date || '').slice(0, 10);
  if (!employeeId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ success: false, error: 'invalid_employee_or_date' });
  const next = current.filter((item: any) => !(String(item.employeeId) === employeeId && String(item.date).slice(0, 10) === date));
  if (!req.body?.clear) {
    const startTime = String(req.body?.startTime || '');
    const endTime = String(req.body?.endTime || '');
    const validTime = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
    if (!validTime(startTime) || !validTime(endTime) || endTime <= startTime) return res.status(400).json({ success: false, error: 'invalid_time_range' });
    next.push({ employeeId, date, startTime, endTime, assignedBy: req.body?.assignedBy || null, updatedAt: new Date().toISOString() });
  }
  if (rows[0]) await db.update(schema.settings).set({ value: next } as any).where(eq(schema.settings.key, 'employeeShadowing'));
  else await db.insert(schema.settings).values({ key: 'employeeShadowing', value: next } as any);
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  return res.json({ success: true });
}

async function directNotifications(req: any, res: any) {
  const userId = String(req.query?.userId || '').trim();
  if (!userId) return res.json({ success: true, notifications: [] });
  const rows = await db.select().from(schema.notifications).where(eq(schema.notifications.recipientId, userId));
  const bySemantic = new Map<string, any>();
  for (const row of rows as any[]) {
    const relatedId = String(row.relatedLeaveId || row.relatedOvertimeId || row.relatedShiftSwapId || '').trim();
    const key = relatedId
      ? `${row.recipientId}|${row.type}|${relatedId}`
      : `${row.recipientId}|${row.type}|${String(row.title || '').trim()}|${String(row.message || '').trim()}`;
    const existing = bySemantic.get(key);
    if (!existing) { bySemantic.set(key, row); continue; }
    bySemantic.set(key, {
      ...existing,
      ...row,
      id: String(row.id || existing.id),
      isRead: Boolean(existing.isRead || row.isRead),
      createdAt: new Date(existing.createdAt || row.createdAt || 0).getTime() <= new Date(row.createdAt || existing.createdAt || 0).getTime() ? existing.createdAt : row.createdAt,
    });
  }
  const notifications = Array.from(bySemantic.values())
    .map((row: any) => ({ ...row, id: String(row.id), recipientId: String(row.recipientId), link: row.relatedLeaveId ? `/leaves?leaveId=${encodeURIComponent(String(row.relatedLeaveId))}` : row.relatedOvertimeId ? `/overtime?overtimeId=${encodeURIComponent(String(row.relatedOvertimeId))}` : row.relatedShiftSwapId ? `/schedule?shiftSwapId=${encodeURIComponent(String(row.relatedShiftSwapId))}` : '/notifications' }))
    .sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  return res.json({ success: true, notifications });
}

async function directMarkAllRead(req: any, res: any) {
  const userId = String(req.body?.userId || req.query?.userId || '').trim();
  if (!userId) return res.status(400).json({ success: false, count: 0 });
  const rows = await db.select({ isRead: schema.notifications.isRead }).from(schema.notifications).where(eq(schema.notifications.recipientId, userId));
  const count = rows.filter((row: any) => !Boolean(row.isRead)).length;
  await db.update(schema.notifications).set({ isRead: true, updatedAt: new Date().toISOString() }).where(eq(schema.notifications.recipientId, userId));
  return directNotifications(req, res);
}

async function directMarkRead(req: any, res: any) {
  const userId = String(req.body?.userId || req.query?.userId || '').trim();
  const id = String(req.params?.id || '').trim();
  if (!userId || !id) return res.status(400).json({ success: false, updated: false });
  const rows = await db.select().from(schema.notifications).where(eq(schema.notifications.recipientId, userId));
  const target = rows.find((row: any) => String(row.id) === id);
  if (!target) return res.status(404).json({ success: false, updated: false });
  const relatedId = String(target.relatedLeaveId || target.relatedOvertimeId || target.relatedShiftSwapId || '').trim();
  const sameNotification = (row: any) => {
    if (relatedId) return String(row.type || '') === String(target.type || '') && String(row.relatedLeaveId || row.relatedOvertimeId || row.relatedShiftSwapId || '').trim() === relatedId;
    return String(row.type || '') === String(target.type || '') && String(row.title || '').trim() === String(target.title || '').trim() && String(row.message || '').trim() === String(target.message || '').trim();
  };
  const matchingIds = rows.filter(sameNotification).map((row: any) => String(row.id)).filter(Boolean);
  await Promise.all(matchingIds.map((notificationId: string) => db.update(schema.notifications).set({ isRead: true, updatedAt: new Date().toISOString() }).where(eq(schema.notifications.id, notificationId))));
  return directNotifications(req, res);
}

async function registerPushToken(req: any, res: any) {
  const { employeeId, token, platform = "unknown" } = req.body || {};
  if (!employeeId || !token) return res.status(400).json({ success: false, error: "employeeId and token are required" });
  try {
    const rows: any[] = await db.select().from(schema.settings).where(eq(schema.settings.key, "fcm_tokens")).limit(1);
    const current = Array.isArray(rows[0]?.value) ? rows[0].value : [];
    const next = current.filter((item: any) => String(item?.token || "") !== String(token));
    next.push({ employeeId: String(employeeId), token: String(token), platform: String(platform), updatedAt: new Date().toISOString() });
    await db.insert(schema.settings).values({ key: "fcm_tokens", value: next } as any).onConflictDoUpdate({ target: schema.settings.key, set: { value: next } as any });
    return res.json({ success: true });
  } catch (error) { console.error("[FCM] Vercel push registration failed", error); return res.status(500).json({ success: false, error: "push_registration_failed" }); }
}

function isPushRegister(req: any) { const pathName = String(req.url || "").split("?")[0].replace(/\\/g, ""); return req.method === "POST" && (pathName === "/api/push/register" || pathName.endsWith("/api/push/register")); }
function isPath(req: any, path: string) { return String(req.url || "").split("?")[0].replace(/\\/g, "") === path; }

function enrichLeaveAttendance(body: any) {
  if (!body || !Array.isArray(body.leaveRequests) || !Array.isArray(body.attendanceRecords)) return body;
  const attendance = [...body.attendanceRecords]; let changed = false;
  const normalize = (value: any) => String(value ?? "").trim().toLowerCase();
  const isWeekend = (date: Date) => date.getUTCDay() === 5 || date.getUTCDay() === 6;
  for (const leave of body.leaveRequests) {
    if (leave?.status !== "approved" || !leave?.employeeId || !leave?.startDate || !leave?.endDate) continue;
    const start = new Date(`${String(leave.startDate).slice(0, 10)}T00:00:00Z`); const end = new Date(`${String(leave.endDate).slice(0, 10)}T00:00:00Z`);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) continue;
    const from = start <= end ? start : end; const to = start <= end ? end : start;
    for (const cursor = new Date(from); cursor <= to; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
      if (isWeekend(cursor)) continue;
      const date = cursor.toISOString().slice(0, 10); const employeeId = String(leave.employeeId);
      const index = attendance.findIndex((record: any) => normalize(record?.employeeId) === normalize(employeeId) && String(record?.date ?? "").slice(0, 10) === date);
      if (index >= 0) { const existing = attendance[index]; if (!existing?.checkIn && existing?.status !== "on_leave") { attendance[index] = { ...existing, status: "on_leave", leaveType: leave.type, workHours: 0, lateMinutes: 0, lateSeconds: 0, earlyLeaveMinutes: 0, overtimeHours: 0, minusHours: 0, notes: existing?.notes || `إجازة معتمدة${leave.reason ? `: ${leave.reason}` : ""}`, updatedAt: leave.updatedAt || leave.createdAt || new Date().toISOString() }; changed = true; } continue; }
      attendance.push({ id: `rec-leave-${employeeId}-${date}`, employeeId, date, status: "on_leave", leaveType: leave.type, workHours: 0, lateMinutes: 0, lateSeconds: 0, earlyLeaveMinutes: 0, overtimeHours: 0, notes: `إجازة معتمدة${leave.reason ? `: ${leave.reason}` : ""}`, verifiedByFace: true, updatedAt: leave.updatedAt || leave.createdAt || new Date().toISOString() }); changed = true;
    }
  }
  return changed ? { ...body, attendanceRecords: attendance, lastUpdated: Math.max(Number(body.lastUpdated) || 0, Date.now()) } : body;
}

export default async function handler(req: any, res: any) {
  // Self-heal the additive schema pieces on cold start / first request
  // (cached no-op afterwards) so missing migrations never 500 the API.
  try { await ensureSchema(); } catch { /* logged inside ensureSchema */ }
  if (isPushRegister(req)) return registerPushToken(req, res);
  // Shared, permission-checked employee + breaks handlers (same as server.ts).
  const employeeMatch = /^\/api\/employees\/([^/]+)$/.exec(String(req.url || '').split('?')[0]);
  if (employeeMatch) {
    req.params = { ...(req.params || {}), id: decodeURIComponent(employeeMatch[1]) };
    if (req.method === 'PUT') return updateEmployeeHandler(req, res);
    if (req.method === 'DELETE') return deleteEmployeeHandler(req, res);
  }
  if (req.method === 'POST' && isPath(req, '/api/employees')) return createEmployeeHandler(req, res);
  // GET/POST /api/employee-breaks are handled by the bundled express app below
  // (routes registered in server.ts via registerEmployeeBreaks).
  try {
    if ((req.method === 'GET' || req.method === 'POST') && isPath(req, '/api/shadowing')) return await directShadowing(req, res);
    if (req.method === 'POST' && isPath(req, '/api/schedule-sync')) return await directScheduleSync(req, res);
    if (req.method === 'GET' && isPath(req, '/api/data')) { res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate'); res.setHeader('Pragma', 'no-cache'); return await directData(res); }
    if (req.method === 'GET' && isPath(req, '/api/notifications')) { res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate'); res.setHeader('Pragma', 'no-cache'); return await directNotifications(req, res); }
    if (req.method === 'PUT' && isPath(req, '/api/notifications/mark-all-read')) return await directMarkAllRead(req, res);
    if (req.method === 'PUT' && /^\/api\/notifications\/[^/]+\/mark-read$/.test(String(req.url || '').split('?')[0])) { req.params = { id: String(req.url || '').split('?')[0].split('/')[3] }; return await directMarkRead(req, res); }
    if (req.method === 'GET' && isPath(req, '/api/notifications/stream')) {
      const userId = String(req.query?.userId || '').trim(); if (!userId) return res.status(400).end();
      res.status(200); res.setHeader('Content-Type', 'text/event-stream; charset=utf-8'); res.setHeader('Cache-Control', 'no-cache, no-transform'); res.setHeader('Connection', 'keep-alive'); res.setHeader('X-Accel-Buffering', 'no'); res.flushHeaders?.(); res.write(`event: ready\ndata: ${JSON.stringify({ connectedAt: new Date().toISOString() })}\n\n`);
      const timer = setInterval(() => { try { res.write(': heartbeat\n\n'); } catch { clearInterval(timer); } }, 25000); req.on('close', () => clearInterval(timer)); return;
    }
  } catch (error) { console.error('[direct-api] critical endpoint failed:', error); return res.status(500).json({ success: false, error: 'database_unavailable' }); }
  const originalJson = res.json.bind(res);
  res.json = (body: any) => { try { return originalJson(enrichLeaveAttendance(body)); } catch (error) { console.error("[leave-sync-response] enrichment failed", error); return originalJson(body); } };
  return app(req, res);
}

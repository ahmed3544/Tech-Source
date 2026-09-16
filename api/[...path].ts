import app from "../dist/server.js";
import { db } from "../src/db/index.js";
import * as schema from "../src/db/schema.js";
import { eq } from "drizzle-orm";

// Direct API fallbacks keep critical read endpoints available even if a cached
// or older server bundle has a broken route registration. These handlers use
// the same Neon database as the main server and intentionally do not depend on
// the Express bundle for the critical sync/read paths.
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
  try {
    employeeShiftAssignments = await db.select().from(schema.employeeShiftAssignments);
  } catch (error) {
    console.warn('[direct-api] employee_shift_assignments read failed:', error);
  }

  const breakMap = settingsMap.get('shiftBreaks');
  const breaks = breakMap && typeof breakMap === 'object' && !Array.isArray(breakMap) ? breakMap : {};
  const hydratedShifts = shifts.map((shift: any) => ({
    ...shift,
    breaks: Array.isArray(shift?.breaks)
      ? shift.breaks
      : (Array.isArray((breaks as any)[String(shift?.id)]) ? (breaks as any)[String(shift.id)] : []),
  }));

  return res.json({
    success: true,
    employees,
    attendanceRecords,
    leaveRequests,
    overtimeRequests,
    shifts: hydratedShifts,
    notifications,
    employeeShiftAssignments,
    dailyShiftAssignments: Array.isArray(settingsMap.get('dailyShiftAssignments')) ? settingsMap.get('dailyShiftAssignments') : [],
    shiftSwapRequests: Array.isArray(settingsMap.get('shiftSwapRequests')) ? settingsMap.get('shiftSwapRequests') : [],
    companyNameAr: settingsMap.get('companyNameAr') ?? null,
    companyNameEn: settingsMap.get('companyNameEn') ?? null,
    urgentNotice: settingsMap.get('urgentNotice') ?? null,
    lastUpdated: Date.now(),
  });
}

async function directNotifications(req: any, res: any) {
  const userId = String(req.query?.userId || '').trim();
  if (!userId) return res.json({ success: true, notifications: [] });
  const rows = await db.select().from(schema.notifications).where(eq(schema.notifications.recipientId, userId));
  const notifications = rows
    .map((row: any) => ({
      ...row,
      id: String(row.id),
      recipientId: String(row.recipientId),
      link: row.relatedLeaveId ? `/leaves?leaveId=${encodeURIComponent(String(row.relatedLeaveId))}`
        : row.relatedOvertimeId ? `/overtime?overtimeId=${encodeURIComponent(String(row.relatedOvertimeId))}`
        : row.relatedShiftSwapId ? `/schedule?shiftSwapId=${encodeURIComponent(String(row.relatedShiftSwapId))}`
        : '/notifications',
    }))
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
  const rows = await db.select().from(schema.notifications).where(eq(schema.notifications.id, id));
  const row = rows[0];
  if (!row || String(row.recipientId) !== userId) return res.status(404).json({ success: false, updated: false });
  await db.update(schema.notifications).set({ isRead: true, updatedAt: new Date().toISOString() }).where(eq(schema.notifications.id, id));
  return directNotifications(req, res);
}

async function registerPushToken(req: any, res: any) {
  const { employeeId, token, platform = "unknown" } = req.body || {};
  if (!employeeId || !token) {
    return res.status(400).json({ success: false, error: "employeeId and token are required" });
  }
  try {
    const rows: any[] = await db.select().from(schema.settings).where(eq(schema.settings.key, "fcm_tokens")).limit(1);
    const current = Array.isArray(rows[0]?.value) ? rows[0].value : [];
    const next = current.filter((item: any) => String(item?.token || "") !== String(token));
    next.push({ employeeId: String(employeeId), token: String(token), platform: String(platform), updatedAt: new Date().toISOString() });
    await db.insert(schema.settings).values({ key: "fcm_tokens", value: next } as any).onConflictDoUpdate({
      target: schema.settings.key,
      set: { value: next } as any,
    });
    return res.json({ success: true });
  } catch (error) {
    console.error("[FCM] Vercel push registration failed", error);
    return res.status(500).json({ success: false, error: "push_registration_failed" });
  }
}

function isPushRegister(req: any) {
  const pathName = String(req.url || "").split("?")[0].replace(/\\/g, "");
  return req.method === "POST" && (pathName === "/api/push/register" || pathName.endsWith("/api/push/register"));
}

function isPath(req: any, path: string) {
  return String(req.url || "").split("?")[0].replace(/\\/g, "") === path;
}

function enrichLeaveAttendance(body: any) {
  if (!body || !Array.isArray(body.leaveRequests) || !Array.isArray(body.attendanceRecords)) return body;
  const attendance = [...body.attendanceRecords];
  let changed = false;
  const normalize = (value: any) => String(value ?? "").trim().toLowerCase();
  const isWeekend = (date: Date) => date.getUTCDay() === 5 || date.getUTCDay() === 6;

  for (const leave of body.leaveRequests) {
    if (leave?.status !== "approved" || !leave?.employeeId || !leave?.startDate || !leave?.endDate) continue;
    const start = new Date(`${String(leave.startDate).slice(0, 10)}T00:00:00Z`);
    const end = new Date(`${String(leave.endDate).slice(0, 10)}T00:00:00Z`);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) continue;
    const from = start <= end ? start : end;
    const to = start <= end ? end : start;
    for (const cursor = new Date(from); cursor <= to; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
      if (isWeekend(cursor)) continue;
      const date = cursor.toISOString().slice(0, 10);
      const employeeId = String(leave.employeeId);
      const index = attendance.findIndex((record: any) => normalize(record?.employeeId) === normalize(employeeId) && String(record?.date ?? "").slice(0, 10) === date);
      if (index >= 0) {
        const existing = attendance[index];
        if (!existing?.checkIn && existing?.status !== "on_leave") {
          attendance[index] = { ...existing, status: "on_leave", leaveType: leave.type, workHours: 0, lateMinutes: 0, lateSeconds: 0, earlyLeaveMinutes: 0, overtimeHours: 0, minusHours: 0, notes: existing?.notes || `إجازة معتمدة${leave.reason ? `: ${leave.reason}` : ""}`, updatedAt: leave.updatedAt || leave.createdAt || new Date().toISOString() };
          changed = true;
        }
        continue;
      }
      attendance.push({ id: `rec-leave-${employeeId}-${date}`, employeeId, date, status: "on_leave", leaveType: leave.type, workHours: 0, lateMinutes: 0, lateSeconds: 0, earlyLeaveMinutes: 0, overtimeHours: 0, notes: `إجازة معتمدة${leave.reason ? `: ${leave.reason}` : ""}`, verifiedByFace: true, updatedAt: leave.updatedAt || leave.createdAt || new Date().toISOString() });
      changed = true;
    }
  }
  return changed ? { ...body, attendanceRecords: attendance, lastUpdated: Math.max(Number(body.lastUpdated) || 0, Date.now()) } : body;
}

export default async function handler(req: any, res: any) {
  if (isPushRegister(req)) return registerPushToken(req, res);

  // Critical reads bypass the Express bundle. This also makes a Vercel cached
  // deployment recover cleanly after a server bundle change.
  try {
    if (req.method === 'GET' && isPath(req, '/api/data')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      return await directData(res);
    }
    if (req.method === 'GET' && isPath(req, '/api/notifications')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      return await directNotifications(req, res);
    }
    if (req.method === 'PUT' && isPath(req, '/api/notifications/mark-all-read')) return await directMarkAllRead(req, res);
    if (req.method === 'PUT' && /^\/api\/notifications\/[^/]+\/mark-read$/.test(String(req.url || '').split('?')[0])) {
      req.params = { id: String(req.url || '').split('?')[0].split('/')[3] };
      return await directMarkRead(req, res);
    }
    if (req.method === 'GET' && isPath(req, '/api/notifications/stream')) {
      const userId = String(req.query?.userId || '').trim();
      if (!userId) return res.status(400).end();
      res.status(200);
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders?.();
      res.write(`event: ready\ndata: ${JSON.stringify({ connectedAt: new Date().toISOString() })}\n\n`);
      const timer = setInterval(() => { try { res.write(': heartbeat\n\n'); } catch { clearInterval(timer); } }, 25000);
      req.on('close', () => clearInterval(timer));
      return;
    }
  } catch (error) {
    console.error('[direct-api] critical endpoint failed:', error);
    return res.status(500).json({ success: false, error: 'database_unavailable' });
  }

  const originalJson = res.json.bind(res);
  res.json = (body: any) => {
    try { return originalJson(enrichLeaveAttendance(body)); }
    catch (error) { console.error("[leave-sync-response] enrichment failed", error); return originalJson(body); }
  };
  return app(req, res);
}

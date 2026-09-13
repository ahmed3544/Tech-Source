import app from "../dist/server.js";
import { db } from "../src/db/index.js";
import * as schema from "../src/db/schema.js";
import { eq } from "drizzle-orm";

// Vercel fallback for push-token registration. This keeps the endpoint available
// even when a cached/older server bundle does not contain the FCM route yet.
async function registerPushToken(req: any, res: any) {
  const { employeeId, token, platform = "unknown" } = req.body || {};
  if (!employeeId || !token) {
    return res.status(400).json({ success: false, error: "employeeId and token are required" });
  }
  try {
    const rows: any[] = await db.select().from(schema.settings).where(eq(schema.settings.key, "fcm_tokens")).limit(1);
    const current = Array.isArray(rows[0]?.value) ? rows[0].value : [];
    const next = current.filter((item: any) => String(item?.token || "") !== String(token));
    next.push({
      employeeId: String(employeeId),
      token: String(token),
      platform: String(platform),
      updatedAt: new Date().toISOString(),
    });
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

function enrichLeaveAttendance(body: any) {
  if (!body || !Array.isArray(body.leaveRequests) || !Array.isArray(body.attendanceRecords)) {
    return body;
  }

  const attendance = [...body.attendanceRecords];
  let changed = false;

  const normalize = (value: any) => String(value ?? "").trim().toLowerCase();
  const isWeekend = (date: Date) => {
    const day = date.getUTCDay();
    return day === 5 || day === 6;
  };

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
      const index = attendance.findIndex(
        (record: any) =>
          normalize(record?.employeeId) === normalize(employeeId) &&
          String(record?.date ?? "").slice(0, 10) === date
      );

      if (index >= 0) {
        const existing = attendance[index];
        if (!existing?.checkIn && existing?.status !== "on_leave") {
          attendance[index] = {
            ...existing,
            status: "on_leave",
            leaveType: leave.type,
            workHours: 0,
            lateMinutes: 0,
            lateSeconds: 0,
            earlyLeaveMinutes: 0,
            overtimeHours: 0,
            notes: existing?.notes || `إجازة معتمدة${leave.reason ? `: ${leave.reason}` : ""}`,
            updatedAt: leave.updatedAt || leave.createdAt || new Date().toISOString(),
          };
          changed = true;
        }
        continue;
      }

      attendance.push({
        id: `rec-leave-${employeeId}-${date}`,
        employeeId,
        date,
        status: "on_leave",
        leaveType: leave.type,
        workHours: 0,
        lateMinutes: 0,
        lateSeconds: 0,
        earlyLeaveMinutes: 0,
        overtimeHours: 0,
        notes: `إجازة معتمدة${leave.reason ? `: ${leave.reason}` : ""}`,
        verifiedByFace: true,
        updatedAt: leave.updatedAt || leave.createdAt || new Date().toISOString(),
      });
      changed = true;
    }
  }

  if (!changed) return body;
  return { ...body, attendanceRecords: attendance, lastUpdated: Math.max(Number(body.lastUpdated) || 0, Date.now()) };
}

export default async function handler(req: any, res: any) {
  if (isPushRegister(req)) {
    return registerPushToken(req, res);
  }

  const originalJson = res.json.bind(res);
  res.json = (body: any) => {
    try {
      return originalJson(enrichLeaveAttendance(body));
    } catch (error) {
      console.error("[leave-sync-response] enrichment failed", error);
      return originalJson(body);
    }
  };

  return app(req, res);
}

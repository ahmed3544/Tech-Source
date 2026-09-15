var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// server.ts
import "dotenv/config";
import express from "express";
import { eq as eq8 } from "drizzle-orm";

// src/db/index.ts
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

// src/db/schema.ts
var schema_exports = {};
__export(schema_exports, {
  attendanceRecords: () => attendanceRecords,
  employeeShiftAssignments: () => employeeShiftAssignments,
  employees: () => employees,
  leaveRequests: () => leaveRequests,
  loginAudit: () => loginAudit,
  notifications: () => notifications,
  overtimeRequests: () => overtimeRequests,
  rotationPatternItems: () => rotationPatternItems,
  rotationPatterns: () => rotationPatterns,
  settings: () => settings,
  shifts: () => shifts
});
import {
  pgTable,
  text,
  integer,
  boolean,
  uniqueIndex,
  jsonb,
  real
} from "drizzle-orm/pg-core";
var employees = pgTable("employees", {
  id: text("id").primaryKey(),
  code: text("code"),
  nameAr: text("name_ar").notNull(),
  nameEn: text("name_en").notNull(),
  avatar: text("avatar"),
  email: text("email"),
  phone: text("phone"),
  department: text("department"),
  jobTitleAr: text("job_title_ar"),
  jobTitleEn: text("job_title_en"),
  shiftId: text("shift_id"),
  pin: text("pin"),
  role: text("role"),
  joinedDate: text("joined_date"),
  status: text("status"),
  annualLeaveBalance: real("annual_leave_balance"),
  casualLeaveBalance: real("casual_leave_balance"),
  regularLeaveBalance: real("regular_leave_balance"),
  sickLeaveBalance: real("sick_leave_balance"),
  isPhotoRemoved: boolean("is_photo_removed"),
  updatedAt: text("updated_at")
});
var attendanceRecords = pgTable("attendance_records", {
  id: text("id").primaryKey(),
  employeeId: text("employee_id").notNull(),
  date: text("date").notNull(),
  checkIn: text("check_in"),
  checkOut: text("check_out"),
  breakStart: text("break_start"),
  breakEnd: text("break_end"),
  breaks: jsonb("breaks"),
  totalBreakSeconds: integer("total_break_seconds"),
  location: text("location"),
  deviceInfo: text("device_info"),
  lateMinutes: integer("late_minutes").default(0),
  lateSeconds: integer("late_seconds").default(0),
  earlyLeaveMinutes: integer("early_leave_minutes").default(0),
  workHours: real("work_hours").default(0),
  overtimeHours: real("overtime_hours").default(0),
  minusHours: real("minus_hours").default(0),
  status: text("status"),
  leaveType: text("leave_type"),
  notes: text("notes"),
  verifiedByFace: boolean("verified_by_face"),
  isExcused: boolean("is_excused"),
  excusedBy: text("excused_by"),
  excusedReason: text("excused_reason"),
  updatedAt: text("updated_at"),
  isExplicitCancelCheckOut: boolean("is_explicit_cancel_check_out")
}, (table) => [uniqueIndex("employee_date_idx").on(table.employeeId, table.date)]);
var leaveRequests = pgTable("leave_requests", {
  id: text("id").primaryKey(),
  employeeId: text("employee_id").notNull(),
  type: text("type"),
  startDate: text("start_date"),
  endDate: text("end_date"),
  reason: text("reason"),
  status: text("status"),
  createdAt: text("created_at"),
  hours: integer("hours"),
  permissionSlot: text("permission_slot"),
  attachmentUrl: text("attachment_url"),
  attachmentName: text("attachment_name"),
  reviewedBy: text("reviewed_by"),
  reviewNotes: text("review_notes")
});
var overtimeRequests = pgTable("overtime_requests", {
  id: text("id").primaryKey(),
  employeeId: text("employee_id").notNull(),
  date: text("date").notNull(),
  type: text("type").notNull(),
  durationSeconds: integer("duration_seconds").notNull(),
  reason: text("reason"),
  status: text("status").default("pending"),
  reviewedBy: text("reviewed_by"),
  reviewNotes: text("review_notes"),
  createdAt: text("created_at"),
  updatedAt: text("updated_at")
});
var settings = pgTable("settings", { key: text("key").primaryKey(), value: jsonb("value") });
var shifts = pgTable("shifts", { id: text("id").primaryKey(), name: text("name").notNull(), startTime: text("start_time").notNull(), endTime: text("end_time").notNull(), durationMinutes: integer("duration_minutes").notNull(), breakMinutes: integer("break_minutes").default(0), gracePeriodMinutes: integer("grace_period_minutes").default(0), overtimeEnabled: boolean("overtime_enabled").default(false), isOvernight: boolean("is_overnight").default(false), createdAt: text("created_at"), updatedAt: text("updated_at") });
var employeeShiftAssignments = pgTable("employee_shift_assignments", { id: text("id").primaryKey(), employeeId: text("employee_id").notNull(), scheduleDate: text("schedule_date").notNull(), shiftTemplateId: text("shift_template_id"), customStartTime: text("custom_start_time"), customEndTime: text("custom_end_time"), durationMinutes: integer("duration_minutes").default(480), status: text("status").default("draft"), createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(), version: integer("version").default(1) }, (table) => [uniqueIndex("employee_shift_assignment_date_idx").on(table.employeeId, table.scheduleDate)]);
var rotationPatterns = pgTable("rotation_patterns", { id: text("id").primaryKey(), name: text("name").notNull(), shiftIds: jsonb("shift_ids").notNull(), createdBy: text("created_by"), createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull() });
var rotationPatternItems = pgTable("rotation_pattern_items", { id: text("id").primaryKey(), patternId: text("pattern_id").notNull(), shiftId: text("shift_id").notNull(), sequence: integer("sequence").notNull() }, (table) => [uniqueIndex("rotation_pattern_sequence_idx").on(table.patternId, table.sequence)]);
var notifications = pgTable("notifications", { id: text("id").primaryKey(), recipientId: text("recipient_id").notNull(), type: text("type").notNull(), title: text("title").notNull(), message: text("message").notNull(), relatedEmployeeId: text("related_employee_id"), relatedLeaveId: text("related_leave_id"), relatedOvertimeId: text("related_overtime_id"), relatedShiftSwapId: text("related_shift_swap_id"), isRead: boolean("is_read").default(false), createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull() });
var loginAudit = pgTable("login_audit", { id: text("id").primaryKey(), employeeId: text("employee_id"), loginIdentifier: text("login_identifier").notNull(), success: boolean("success").notNull().default(false), failureReason: text("failure_reason"), ipAddress: text("ip_address"), userAgent: text("user_agent"), createdAt: text("created_at").notNull() });

// src/db/index.ts
var createPool = () => {
  if (!global._postgresPool) {
    const connectionString = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
    if (!connectionString) {
      console.warn(
        "DATABASE_URL/SUPABASE_DB_URL is not set. Database operations will fail."
      );
    }
    const configuredPoolSize = Number(process.env.PG_POOL_MAX || 2);
    const maxPoolSize = Number.isFinite(configuredPoolSize) ? Math.max(1, Math.min(configuredPoolSize, 4)) : 2;
    global._postgresPool = new Pool({
      connectionString,
      max: maxPoolSize,
      idleTimeoutMillis: 1e4,
      connectionTimeoutMillis: 1e4,
      keepAlive: true
    });
    global._postgresPool.on("error", (err) => {
      console.error("Unexpected error on idle SQL pool client:", err);
    });
  }
  return global._postgresPool;
};
var pool = createPool();
var db = drizzle(pool, { schema: schema_exports });

// server/fcm.ts
import { sql } from "drizzle-orm";
import { getApps, cert, initializeApp } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
var hasDatabase = () => Boolean(process.env.DATABASE_URL);
function adminMessaging() {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    console.warn("[FCM] FIREBASE_SERVICE_ACCOUNT_JSON is missing");
    return null;
  }
  try {
    if (!getApps().length) initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)) });
    return getMessaging();
  } catch (error) {
    console.error("[FCM] init failed", error);
    return null;
  }
}
async function readTokens() {
  if (!hasDatabase()) return [];
  try {
    const rows = await db.select().from(settings).where(sql`key = 'fcm_tokens'`).limit(1);
    const value = rows[0]?.value;
    return Array.isArray(value) ? value : [];
  } catch (error) {
    console.error("[FCM] token read failed", error);
    return [];
  }
}
async function tokensFor(employeeId) {
  const tokens = await readTokens();
  return tokens.filter((x) => String(x?.employeeId) === employeeId).map((x) => String(x?.token || "")).filter(Boolean);
}
async function saveToken(employeeId, token, platform) {
  if (!hasDatabase()) {
    console.warn("[FCM] token not saved: Neon database is unavailable");
    return false;
  }
  const current = await readTokens();
  const next = current.filter((x) => x?.token !== token);
  next.push({ employeeId, token, platform, updatedAt: (/* @__PURE__ */ new Date()).toISOString() });
  await db.insert(settings).values({ key: "fcm_tokens", value: next }).onConflictDoUpdate({ target: settings.key, set: { value: next } });
  console.info("[FCM] token registered", { employeeId, platform });
  return true;
}
async function sendPushToEmployee(employeeId, title, body, data = {}) {
  const messaging = adminMessaging();
  if (!messaging) return { sent: 0, configured: false };
  const tokens = await tokensFor(employeeId);
  if (!tokens.length) return { sent: 0, configured: true };
  const response = await messaging.sendEachForMulticast({
    tokens,
    notification: { title, body },
    data,
    android: { priority: "high", notification: { channelId: "tech-source-notifications", sound: "default" } },
    webpush: { headers: { Urgency: "high" }, notification: { title, body, icon: "/icon-192.png" } }
  });
  const invalidTokens = /* @__PURE__ */ new Set();
  response.responses.forEach((result, index) => {
    const code = result.error?.code;
    if (code === "messaging/registration-token-not-registered" || code === "messaging/invalid-registration-token") invalidTokens.add(tokens[index]);
  });
  if (invalidTokens.size && hasDatabase()) {
    const current = await readTokens();
    const cleaned = current.filter((x) => !invalidTokens.has(String(x?.token || "")));
    try {
      await db.insert(settings).values({ key: "fcm_tokens", value: cleaned }).onConflictDoUpdate({ target: settings.key, set: { value: cleaned } });
    } catch (error) {
      console.warn("[FCM] invalid token cleanup failed", error);
    }
  }
  return { sent: response.successCount, failed: response.failureCount, configured: true };
}
function registerFcmRoutes(app2) {
  app2.post("/api/push/register", async (req, res) => {
    try {
      const { employeeId, token, platform = "unknown" } = req.body || {};
      if (!employeeId || !token) return res.status(400).json({ success: false });
      return res.json({ success: await saveToken(String(employeeId), String(token), String(platform)) });
    } catch (error) {
      console.error("[FCM] register", error);
      return res.status(500).json({ success: false });
    }
  });
  app2.post("/api/push/send", async (req, res) => {
    try {
      const { employeeId, title, body, data = {} } = req.body || {};
      if (!employeeId || !title || !body) return res.status(400).json({ success: false });
      return res.json({ success: true, ...await sendPushToEmployee(String(employeeId), String(title), String(body), data) });
    } catch (error) {
      console.error("[FCM] send", error);
      return res.status(500).json({ success: false });
    }
  });
}

// server/notification-system-v2.ts
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { eq, sql as sql2 } from "drizzle-orm";

// server/notification-sse.ts
var subscribers = /* @__PURE__ */ new Map();
var clean = (value) => String(value ?? "").trim();
function publishNotification(notification) {
  const recipientId = clean(notification.recipientId);
  if (!recipientId) return;
  const clients = subscribers.get(recipientId);
  if (!clients?.size) return;
  const payload = `event: notification
data: ${JSON.stringify(notification)}

`;
  for (const response of clients) {
    try {
      response.write(payload);
    } catch {
      removeSubscriber(recipientId, response);
    }
  }
}
function removeSubscriber(userId, response) {
  const clients = subscribers.get(userId);
  if (!clients) return;
  clients.delete(response);
  if (!clients.size) subscribers.delete(userId);
}
function registerNotificationSse(app2) {
  app2.get("/api/notifications/stream", (req, res) => {
    const userId = clean(req.query.userId);
    if (!userId) {
      res.status(400).end();
      return;
    }
    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();
    res.write(`event: ready
data: ${JSON.stringify({ connectedAt: (/* @__PURE__ */ new Date()).toISOString() })}

`);
    const clients = subscribers.get(userId) || /* @__PURE__ */ new Set();
    clients.add(res);
    subscribers.set(userId, clients);
    const heartbeat = setInterval(() => {
      try {
        res.write(": heartbeat\\n\\n");
      } catch {
        removeSubscriber(userId, res);
      }
    }, 25e3);
    const cleanup = () => {
      clearInterval(heartbeat);
      removeSubscriber(userId, res);
    };
    req.on("close", cleanup);
    res.on("error", cleanup);
  });
}

// server/notification-system-v2.ts
var USE_DATABASE = Boolean(process.env.DATABASE_URL || process.env.SUPABASE_DB_URL);
var LOCAL_FILE = path.join(process.cwd(), "notifications_v2.json");
var VERSION = "10-notifications-bootstrap-safe";
var readyPromise = null;
var clean2 = (value) => String(value ?? "").trim();
var nowIso = () => (/* @__PURE__ */ new Date()).toISOString();
function stableId(input) {
  if (clean2(input.id)) return clean2(input.id);
  const basis = [input.recipientId, input.type, input.relatedEmployeeId || "", input.relatedLeaveId || "", input.relatedOvertimeId || "", input.relatedShiftSwapId || "", input.title, input.message].join("|");
  return `n2_${crypto.createHash("sha256").update(basis).digest("hex").slice(0, 40)}`;
}
function semanticKey(raw) {
  const recipientId = clean2(raw?.recipientId);
  const type = clean2(raw?.type);
  const relatedId = clean2(raw?.relatedLeaveId) || clean2(raw?.relatedOvertimeId) || clean2(raw?.relatedShiftSwapId);
  if (relatedId) return `${recipientId}|${type}|${relatedId}`;
  return `${recipientId}|${type}|${clean2(raw?.title)}|${clean2(raw?.message)}`;
}
function targetFor(raw) {
  const explicit = clean2(raw?.link || raw?.targetUrl);
  if (explicit) return explicit;
  const type = clean2(raw?.type);
  if (clean2(raw?.relatedLeaveId)) return `/leaves?leaveId=${encodeURIComponent(clean2(raw.relatedLeaveId))}`;
  if (clean2(raw?.relatedOvertimeId)) return `/overtime?overtimeId=${encodeURIComponent(clean2(raw.relatedOvertimeId))}`;
  if (clean2(raw?.relatedShiftSwapId)) return `/schedule?shiftSwapId=${encodeURIComponent(clean2(raw.relatedShiftSwapId))}`;
  if (type.startsWith("leave_")) return "/leaves";
  if (type.startsWith("overtime_")) return "/leaves";
  if (type.startsWith("shift_")) return "/schedule";
  return "/notifications";
}
function withTarget(item) {
  const link = targetFor(item);
  return link ? { ...item, link, targetUrl: link } : item;
}
function normalize(raw) {
  const recipientId = clean2(raw?.recipientId);
  const type = clean2(raw?.type);
  if (!recipientId || !type) return null;
  if (type === "leave_rejected" && !clean2(raw?.relatedLeaveId)) return null;
  const createdAt = clean2(raw?.createdAt) || nowIso();
  const updatedAt = clean2(raw?.updatedAt) || createdAt;
  const item = { id: clean2(raw?.id) || void 0, recipientId, type, title: clean2(raw?.title) || "\u0625\u0634\u0639\u0627\u0631 \u062C\u062F\u064A\u062F", message: clean2(raw?.message) || "\u0644\u062F\u064A\u0643 \u0625\u0634\u0639\u0627\u0631 \u062C\u062F\u064A\u062F.", relatedEmployeeId: clean2(raw?.relatedEmployeeId) || void 0, relatedLeaveId: clean2(raw?.relatedLeaveId) || void 0, relatedOvertimeId: clean2(raw?.relatedOvertimeId) || void 0, relatedShiftSwapId: clean2(raw?.relatedShiftSwapId) || void 0, isRead: Boolean(raw?.isRead), createdAt, updatedAt };
  return withTarget({ id: stableId(item), ...item });
}
function mergeDuplicates(items) {
  const map = /* @__PURE__ */ new Map();
  for (const raw of items) {
    const item = withTarget(raw);
    const key = semanticKey(item);
    const old = map.get(key);
    if (!old) {
      map.set(key, item);
      continue;
    }
    const oldTime = new Date(old.updatedAt || old.createdAt || 0).getTime();
    const newTime = new Date(item.updatedAt || item.createdAt || 0).getTime();
    const newer = newTime >= oldTime ? item : old;
    map.set(key, { ...newer, isRead: Boolean(old.isRead || item.isRead), createdAt: new Date(old.createdAt || item.createdAt || 0).getTime() <= new Date(item.createdAt || old.createdAt || 0).getTime() ? old.createdAt : item.createdAt });
  }
  return Array.from(map.values()).sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
}
function readLocal() {
  try {
    if (!fs.existsSync(LOCAL_FILE)) return [];
    const parsed = JSON.parse(fs.readFileSync(LOCAL_FILE, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
function writeLocal(items) {
  try {
    fs.writeFileSync(LOCAL_FILE, JSON.stringify(items, null, 2));
  } catch (error) {
    console.warn("[Notifications v2] local persistence failed", error);
  }
}
async function ensureReady() {
  if (!readyPromise) readyPromise = (async () => {
    if (USE_DATABASE) {
      await db.execute(sql2`CREATE TABLE IF NOT EXISTS notifications (
        id text PRIMARY KEY,
        recipient_id text NOT NULL,
        type text NOT NULL,
        title text NOT NULL,
        message text NOT NULL,
        related_employee_id text,
        related_leave_id text,
        related_overtime_id text,
        related_shift_swap_id text,
        is_read boolean DEFAULT false,
        created_at text NOT NULL,
        updated_at text NOT NULL
      )`);
      await db.execute(sql2`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS related_employee_id text`);
      await db.execute(sql2`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS related_leave_id text`);
      await db.execute(sql2`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS related_overtime_id text`);
      await db.execute(sql2`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS related_shift_swap_id text`);
      await db.execute(sql2`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS is_read boolean DEFAULT false`);
      await db.execute(sql2`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS created_at text`);
      await db.execute(sql2`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS updated_at text`);
      await db.execute(sql2`CREATE TABLE IF NOT EXISTS notification_system_meta (key text PRIMARY KEY, value text NOT NULL)`);
      await db.execute(sql2`INSERT INTO notification_system_meta (key, value) VALUES ('version', ${VERSION}) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`);
      try {
        await db.execute(sql2`DELETE FROM notifications n WHERE (n.type = 'leave_rejected' AND (n.related_leave_id IS NULL OR NOT EXISTS (SELECT 1 FROM leave_requests l WHERE l.id = n.related_leave_id AND LOWER(COALESCE(l.status,'')) = 'rejected')))`);
      } catch (error) {
        console.warn("[Notifications v2] cleanup skipped:", error);
      }
    } else if (!fs.existsSync(LOCAL_FILE)) writeLocal([]);
  })().catch((error) => {
    readyPromise = null;
    throw error;
  });
  return readyPromise;
}
async function ensureNotificationStorage() {
  await ensureReady();
}
async function listForUser(userId) {
  await ensureReady();
  const id = clean2(userId);
  if (!id) return [];
  if (USE_DATABASE) {
    const rows = await db.select().from(notifications).where(eq(notifications.recipientId, id));
    let leaveRows = [];
    try {
      leaveRows = await db.select({ id: leaveRequests.id, status: leaveRequests.status }).from(leaveRequests);
    } catch (error) {
      console.warn("[Notifications v2] leave validation skipped:", error);
    }
    const validRejectedLeaveIds = new Set(leaveRows.filter((row) => String(row.status || "").toLowerCase() === "rejected").map((row) => String(row.id)));
    const validLeaveIds = new Set(leaveRows.map((row) => String(row.id)));
    const normalized = rows.map((row) => withTarget({ ...row, id: String(row.id), recipientId: String(row.recipientId) })).filter((item) => leaveRows.length === 0 || (item.type === "leave_rejected" ? Boolean(item.relatedLeaveId && validRejectedLeaveIds.has(String(item.relatedLeaveId))) : !(item.type.startsWith("leave_") && item.relatedLeaveId && !validLeaveIds.has(String(item.relatedLeaveId)))));
    return mergeDuplicates(normalized);
  }
  return mergeDuplicates(readLocal().filter((item) => item.recipientId === id).map((item) => normalize(item)).filter((item) => Boolean(item)));
}
async function saveOne(input) {
  const item = normalize(input);
  if (!item) return null;
  await ensureReady();
  if (!USE_DATABASE) {
    const items = readLocal();
    const key2 = semanticKey(item);
    const index = items.findIndex((existing2) => semanticKey(existing2) === key2 || existing2.id === item.id);
    if (index >= 0) {
      const existing2 = items[index];
      items[index] = { ...existing2, ...item, id: existing2.id, isRead: Boolean(existing2.isRead || item.isRead), updatedAt: nowIso() };
    } else items.push(item);
    writeLocal(mergeDuplicates(items));
    return withTarget(items.find((existing2) => semanticKey(existing2) === key2) || item);
  }
  const key = semanticKey(item);
  const allRows = await db.select().from(notifications).where(eq(notifications.recipientId, item.recipientId));
  const existing = allRows.find((row) => String(row.id) === item.id) || allRows.find((row) => semanticKey(row) === key);
  if (existing) {
    const existingTime = new Date(existing.updatedAt || existing.createdAt || 0).getTime();
    const incomingTime = new Date(item.updatedAt || item.createdAt || 0).getTime();
    if (existing.isRead && !item.isRead) return withTarget({ ...existing, id: String(existing.id), recipientId: String(existing.recipientId) });
    if (Number.isFinite(existingTime) && Number.isFinite(incomingTime) && incomingTime < existingTime) return withTarget({ ...existing, id: String(existing.id), recipientId: String(existing.recipientId) });
    const merged = { ...item, id: String(existing.id), isRead: Boolean(existing.isRead || item.isRead), updatedAt: nowIso() };
    const { id: _ignoredId, link: _link2, targetUrl: _targetUrl2, ...changes } = merged;
    await db.update(notifications).set(changes).where(eq(notifications.id, String(existing.id)));
    return withTarget(merged);
  }
  const { link: _link, targetUrl: _targetUrl, ...dbItem } = item;
  await db.insert(notifications).values(dbItem).onConflictDoNothing({ target: notifications.id });
  const persisted = await db.select().from(notifications).where(eq(notifications.id, item.id));
  return persisted[0] ? withTarget({ ...persisted[0], id: String(persisted[0].id), recipientId: String(persisted[0].recipientId) }) : item;
}
async function markRead(id, recipientId) {
  await ensureReady();
  const notificationId = clean2(id);
  const userId = clean2(recipientId);
  if (!notificationId || !userId) return false;
  if (!USE_DATABASE) {
    const items = readLocal();
    const target2 = items.find((item) => item.id === notificationId && item.recipientId === userId);
    if (!target2) return false;
    const key2 = semanticKey(target2);
    const updated = items.map((item) => semanticKey(item) === key2 ? { ...item, isRead: true, updatedAt: nowIso() } : item);
    writeLocal(updated);
    return true;
  }
  const rows = await db.select().from(notifications).where(eq(notifications.recipientId, userId));
  let target = rows.find((row) => String(row.id) === notificationId);
  if (!target) {
    const byId = await db.select().from(notifications).where(eq(notifications.id, notificationId));
    target = byId[0];
  }
  if (!target || String(target.recipientId) !== userId) return false;
  const key = semanticKey(target);
  const matches = rows.filter((row) => semanticKey(row) === key);
  const ids = new Set(matches.map((row) => String(row.id)));
  ids.add(String(target.id));
  await Promise.all(Array.from(ids).map((notificationIdToUpdate) => db.update(notifications).set({ isRead: true, updatedAt: nowIso() }).where(eq(notifications.id, notificationIdToUpdate))));
  return true;
}
async function markAllRead(recipientId) {
  await ensureReady();
  const userId = clean2(recipientId);
  if (!userId) return 0;
  if (!USE_DATABASE) {
    const items = readLocal();
    let count = 0;
    const updated = items.map((item) => {
      if (item.recipientId === userId && !item.isRead) {
        count++;
        return { ...item, isRead: true, updatedAt: nowIso() };
      }
      return item;
    });
    writeLocal(updated);
    return count;
  }
  const rows = await db.select({ isRead: notifications.isRead }).from(notifications).where(eq(notifications.recipientId, userId));
  const unreadCount = rows.filter((row) => !Boolean(row.isRead)).length;
  await db.update(notifications).set({ isRead: true, updatedAt: nowIso() }).where(eq(notifications.recipientId, userId));
  return unreadCount;
}
function bodyOf(req) {
  return req.body && typeof req.body === "object" ? req.body : {};
}
function registerNotificationSystemV2(app2) {
  app2.get("/api/notifications", async (req, res) => {
    try {
      const notifications2 = await listForUser(clean2(req.query.userId));
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.json({ success: true, notifications: notifications2 });
    } catch (error) {
      console.error("[Notifications v2] GET failed", error);
      res.status(500).json({ success: false, notifications: [], error: "notifications_unavailable" });
    }
  });
  app2.put("/api/notifications/mark-all-read", async (req, res) => {
    try {
      const userId = clean2(bodyOf(req).userId || req.query.userId);
      const count = await markAllRead(userId);
      const notifications2 = await listForUser(userId);
      res.setHeader("Cache-Control", "no-store");
      res.json({ success: true, count, notifications: notifications2 });
    } catch (error) {
      console.error("[Notifications v2] mark-all-read failed", error);
      res.status(500).json({ success: false, count: 0 });
    }
  });
  app2.put("/api/notifications/:id/mark-read", async (req, res) => {
    try {
      const userId = clean2(bodyOf(req).userId || req.query.userId);
      const updated = await markRead(req.params.id, userId);
      const notifications2 = await listForUser(userId);
      res.setHeader("Cache-Control", "no-store");
      res.json({ success: updated, updated, notifications: notifications2 });
    } catch (error) {
      console.error("[Notifications v2] mark-read failed", error);
      res.status(500).json({ success: false, updated: false });
    }
  });
  app2.post("/api/notifications/emit", async (req, res) => {
    try {
      const notification = await saveOne(bodyOf(req).notification || bodyOf(req));
      if (!notification) return res.status(400).json({ success: false, error: "invalid_notification" });
      publishNotification(notification);
      res.setHeader("Cache-Control", "no-store");
      res.json({ success: true, notification });
    } catch (error) {
      console.error("[Notifications v2] emit failed", error);
      res.status(500).json({ success: false });
    }
  });
  void ensureReady().catch((error) => console.error("[Notifications v2] startup failed", error));
}

// server/request-notification-triggers.ts
import crypto2 from "crypto";
import { eq as eq2 } from "drizzle-orm";
var hasDatabase2 = () => Boolean(process.env.DATABASE_URL || process.env.SUPABASE_DB_URL);
var clean3 = (v) => String(v ?? "").trim();
var hashId = (recipientId, type, relatedId) => `n2_${crypto2.createHash("sha256").update(`${recipientId}|${type}|${relatedId}`).digest("hex").slice(0, 40)}`;
async function insertNotification(recipientId, type, title, message, relatedEmployeeId, relatedLeaveId, relatedOvertimeId, relatedShiftSwapId) {
  if (!recipientId) return;
  const relatedId = clean3(relatedLeaveId || relatedOvertimeId || relatedShiftSwapId);
  const id = hashId(recipientId, type, relatedId || `${title}|${message}`);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const inserted = await db.insert(notifications).values({ id, recipientId, type, title, message, relatedEmployeeId: relatedEmployeeId || null, relatedLeaveId: relatedLeaveId || null, relatedOvertimeId: relatedOvertimeId || null, relatedShiftSwapId: relatedShiftSwapId || null, isRead: false, createdAt: now, updatedAt: now }).onConflictDoNothing({ target: notifications.id }).returning({ id: notifications.id });
  if (!inserted.length) return;
  try {
    await sendPushToEmployee(recipientId, title, message, { type, relatedId });
  } catch (e) {
    console.warn("[FCM] request notification push failed", e);
  }
}
async function emitForSync(body) {
  if (!hasDatabase2()) return;
  await ensureNotificationStorage();
  const requestedLeaves = Array.isArray(body?.leaveRequests) ? body.leaveRequests : [];
  const requestedOvertimes = Array.isArray(body?.overtimeRequests) ? body.overtimeRequests : [];
  const requestedSwaps = Array.isArray(body?.shiftSwapRequests) ? body.shiftSwapRequests : [];
  if (!requestedLeaves.length && !requestedOvertimes.length && !requestedSwaps.length) return;
  const employees2 = await db.select().from(employees);
  const leaders = employees2.filter((e) => e.role === "leader" || e.role === "admin").map((e) => String(e.id));
  const employeeName = (id) => {
    const e = employees2.find((x) => String(x.id) === id);
    return clean3(e?.nameAr) || clean3(e?.nameEn) || id;
  };
  for (const requested of requestedLeaves) {
    const id = clean3(requested?.id);
    if (!id) continue;
    const rows = await db.select().from(leaveRequests).where(eq2(leaveRequests.id, id));
    const r = rows[0];
    if (!r) continue;
    const employeeId = clean3(r.employeeId), status = clean3(r.status).toLowerCase();
    if (!employeeId) continue;
    const start = clean3(r.startDate), end = clean3(r.endDate), kind = clean3(r.type) || "leave";
    if (status === "pending") {
      for (const recipientId of leaders) if (recipientId !== employeeId) await insertNotification(recipientId, "leave_requested", "\u0637\u0644\u0628 \u0625\u062C\u0627\u0632\u0629 \u062C\u062F\u064A\u062F", `${employeeName(employeeId)} \u0623\u0631\u0633\u0644 \u0637\u0644\u0628 ${kind} \u0645\u0646 ${start} \u0625\u0644\u0649 ${end}.`, employeeId, id);
    } else if (status === "approved" || status === "rejected") {
      const approved = status === "approved";
      await insertNotification(employeeId, approved ? "leave_approved" : "leave_rejected", approved ? "\u062A\u0645 \u0627\u0639\u062A\u0645\u0627\u062F \u0637\u0644\u0628 \u0627\u0644\u0625\u062C\u0627\u0632\u0629" : "\u062A\u0645 \u0631\u0641\u0636 \u0637\u0644\u0628 \u0627\u0644\u0625\u062C\u0627\u0632\u0629", approved ? `\u062A\u0645 \u0627\u0639\u062A\u0645\u0627\u062F \u0637\u0644\u0628 ${kind} \u0645\u0646 ${start} \u0625\u0644\u0649 ${end}.` : `\u062A\u0645 \u0631\u0641\u0636 \u0637\u0644\u0628 ${kind} \u0645\u0646 ${start} \u0625\u0644\u0649 ${end}.${clean3(r.reviewNotes) ? ` \u0627\u0644\u0633\u0628\u0628: ${clean3(r.reviewNotes)}` : ""}`, employeeId, id);
    }
  }
  for (const requested of requestedOvertimes) {
    const id = clean3(requested?.id);
    if (!id) continue;
    const rows = await db.select().from(overtimeRequests).where(eq2(overtimeRequests.id, id));
    const r = rows[0];
    if (!r) continue;
    const employeeId = clean3(r.employeeId), status = clean3(r.status).toLowerCase();
    if (!employeeId) continue;
    const date = clean3(r.date), seconds = Number(r.durationSeconds || 0);
    const duration = Number.isFinite(seconds) && seconds > 0 ? `${Math.round(seconds / 3600 * 100) / 100} \u0633\u0627\u0639\u0629` : "";
    if (status === "pending") {
      for (const recipientId of leaders) if (recipientId !== employeeId) await insertNotification(recipientId, "overtime_requested", "\u0637\u0644\u0628 \u0648\u0642\u062A \u0625\u0636\u0627\u0641\u064A \u062C\u062F\u064A\u062F", `${employeeName(employeeId)} \u0623\u0631\u0633\u0644 \u0637\u0644\u0628 \u0648\u0642\u062A \u0625\u0636\u0627\u0641\u064A \u0644\u064A\u0648\u0645 ${date}${duration ? ` \u0644\u0645\u062F\u0629 ${duration}` : ""}.`, employeeId, void 0, id);
    } else if (status === "approved" || status === "rejected") {
      const approved = status === "approved";
      await insertNotification(employeeId, approved ? "overtime_approved" : "overtime_rejected", approved ? "\u062A\u0645 \u0627\u0639\u062A\u0645\u0627\u062F \u0627\u0644\u0648\u0642\u062A \u0627\u0644\u0625\u0636\u0627\u0641\u064A" : "\u062A\u0645 \u0631\u0641\u0636 \u0627\u0644\u0648\u0642\u062A \u0627\u0644\u0625\u0636\u0627\u0641\u064A", approved ? `\u062A\u0645 \u0627\u0639\u062A\u0645\u0627\u062F \u0637\u0644\u0628 \u0627\u0644\u0648\u0642\u062A \u0627\u0644\u0625\u0636\u0627\u0641\u064A \u0644\u064A\u0648\u0645 ${date}${duration ? ` \u0644\u0645\u062F\u0629 ${duration}` : ""}.` : `\u062A\u0645 \u0631\u0641\u0636 \u0637\u0644\u0628 \u0627\u0644\u0648\u0642\u062A \u0627\u0644\u0625\u0636\u0627\u0641\u064A \u0644\u064A\u0648\u0645 ${date}.${clean3(r.reviewNotes) ? ` \u0627\u0644\u0633\u0628\u0628: ${clean3(r.reviewNotes)}` : ""}`, employeeId, void 0, id);
    }
  }
  if (requestedSwaps.length) {
    const settings2 = await db.select().from(settings).where(eq2(settings.key, "shiftSwapRequests"));
    const persistedSwaps = requestedSwaps.length ? requestedSwaps : Array.isArray(settings2[0]?.value) ? settings2[0].value : [];
    for (const requested of requestedSwaps) {
      const id = clean3(requested?.id);
      const r = persistedSwaps.find((x) => clean3(x?.id) === id);
      if (!r) continue;
      const requesterId = clean3(r.requesterId), targetId = clean3(r.targetEmployeeId), status = clean3(r.status).toLowerCase();
      if (!requesterId || !targetId) continue;
      const date = clean3(r.date);
      if (status === "awaiting_target") await insertNotification(targetId, "shift_swap_requested", "\u0637\u0644\u0628 \u062A\u0628\u062F\u064A\u0644 \u0634\u0641\u062A \u062C\u062F\u064A\u062F", `${employeeName(requesterId)} \u0623\u0631\u0633\u0644 \u0644\u0643 \u0637\u0644\u0628 \u062A\u0628\u062F\u064A\u0644 \u0634\u0641\u062A \u0644\u064A\u0648\u0645 ${date}. \u0631\u0627\u062C\u0639 \u0627\u0644\u0637\u0644\u0628 \u0648\u0627\u0636\u063A\u0637 \u0645\u0648\u0627\u0641\u0642\u0629 \u0623\u0648 \u0631\u0641\u0636.`, requesterId, void 0, void 0, id);
      else if (status === "pending") {
        const leaderId = clean3(employees2.find((e) => String(e.id) === requesterId)?.teamLeaderId);
        const recipients = leaderId ? [leaderId] : leaders;
        for (const recipientId of recipients) if (recipientId !== requesterId && recipientId !== targetId) await insertNotification(recipientId, "shift_swap_accepted", "\u062A\u0645\u062A \u0627\u0644\u0645\u0648\u0627\u0641\u0642\u0629 \u0639\u0644\u0649 Swap", `${employeeName(targetId)} \u0648\u0627\u0641\u0642 \u0639\u0644\u0649 \u062A\u0628\u062F\u064A\u0644 \u0627\u0644\u0634\u0641\u062A \u0645\u0639 ${employeeName(requesterId)} \u0644\u064A\u0648\u0645 ${date}. \u0623\u0635\u0628\u062D \u0627\u0644\u0637\u0644\u0628 \u062C\u0627\u0647\u0632\u064B\u0627 \u0644\u0645\u0631\u0627\u062C\u0639\u0629 \u0627\u0644\u0644\u064A\u062F\u0631.`, requesterId, void 0, void 0, id);
      } else if (status === "approved") {
        await insertNotification(requesterId, "shift_changed", "\u062A\u0645 \u0627\u0639\u062A\u0645\u0627\u062F \u062A\u0628\u062F\u064A\u0644 \u0627\u0644\u0634\u0641\u062A", `\u062A\u0645 \u0627\u0639\u062A\u0645\u0627\u062F \u062A\u0628\u062F\u064A\u0644 \u0627\u0644\u0634\u0641\u062A \u0645\u0639 ${employeeName(targetId)} \u0644\u064A\u0648\u0645 ${date}.`, requesterId, void 0, void 0, id);
        await insertNotification(targetId, "shift_changed", "\u062A\u0645 \u0627\u0639\u062A\u0645\u0627\u062F \u062A\u0628\u062F\u064A\u0644 \u0627\u0644\u0634\u0641\u062A", `\u062A\u0645 \u0627\u0639\u062A\u0645\u0627\u062F \u062A\u0628\u062F\u064A\u0644 \u0627\u0644\u0634\u0641\u062A \u0645\u0639 ${employeeName(requesterId)} \u0644\u064A\u0648\u0645 ${date}.`, targetId, void 0, void 0, id);
      } else if (status === "rejected") {
        await insertNotification(requesterId, "shift_swap_rejected", "\u062A\u0645 \u0631\u0641\u0636 \u0637\u0644\u0628 \u062A\u0628\u062F\u064A\u0644 \u0627\u0644\u0634\u0641\u062A", `\u062A\u0645 \u0631\u0641\u0636 \u0637\u0644\u0628 \u062A\u0628\u062F\u064A\u0644 \u0627\u0644\u0634\u0641\u062A \u0644\u064A\u0648\u0645 ${date}.`, requesterId, void 0, void 0, id);
        await insertNotification(targetId, "shift_swap_rejected", "\u062A\u0645 \u0631\u0641\u0636 \u0637\u0644\u0628 \u062A\u0628\u062F\u064A\u0644 \u0627\u0644\u0634\u0641\u062A", `\u062A\u0645 \u0631\u0641\u0636 \u0637\u0644\u0628 \u062A\u0628\u062F\u064A\u0644 \u0627\u0644\u0634\u0641\u062A \u0644\u064A\u0648\u0645 ${date}.`, targetId, void 0, void 0, id);
      }
    }
  }
}
function registerRequestNotificationTriggers(app2) {
  app2.use((req, res, next) => {
    if (req.method !== "POST" || !["/api/sync", "/sync"].includes(String(req.path || "").replace(/\/+$/, ""))) return next();
    const syncBody = req.body;
    const originalJson = res.json.bind(res);
    res.json = async (body) => {
      try {
        await emitForSync(syncBody || {});
      } catch (error) {
        console.error("[request-notification-triggers]", error);
      }
      return originalJson(body);
    };
    next();
  });
}

// server/attendance-realtime.ts
import { and, eq as eq3 } from "drizzle-orm";
var TZ = process.env.SERVER_TIME_ZONE || "Africa/Cairo";
function cairoParts() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(/* @__PURE__ */ new Date());
  const p = {};
  for (const x of parts) if (x.type !== "literal") p[x.type] = x.value;
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    time: `${p.hour}:${p.minute}:${p.second}`,
    iso: (/* @__PURE__ */ new Date()).toISOString()
  };
}
function normalizeAction(value) {
  const x = String(value || "").trim().toLowerCase().replace(/[-\s]/g, "_");
  if (x === "checkin" || x === "check_in" || x === "in") return "check_in";
  if (x === "checkout" || x === "check_out" || x === "out") return "check_out";
  if (x === "breakstart" || x === "break_start" || x === "start_break") return "break_start";
  if (x === "breakend" || x === "break_end" || x === "end_break") return "break_end";
  if (x === "forcebreakend" || x === "force_break_end" || x === "force_break_end_break") return "force_break_end";
  if (x === "update" || x === "edit" || x === "manual_update") return "update";
  return x;
}
var norm = (value) => String(value ?? "").trim().toLowerCase();
var allowedActions = ["check_in", "check_out", "break_start", "break_end", "force_break_end", "update"];
function registerAttendanceRealtime(app2) {
  app2.post("/api/punch", async (req, res) => {
    try {
      const requestedEmployeeId = String(req.body?.employeeId || req.body?.employee_id || "").trim();
      const action = normalizeAction(req.body?.action || req.body?.type);
      const bodyRecord = req.body?.record || {};
      if (!requestedEmployeeId) {
        return res.status(400).json({ success: false, error: "EMPLOYEE_ID_REQUIRED" });
      }
      if (!allowedActions.includes(action)) {
        console.warn("[attendance-realtime] invalid punch action", { action, requestedEmployeeId });
        return res.status(400).json({ success: false, error: "INVALID_PUNCH_ACTION", action, allowedActions });
      }
      if (action === "update" && !/^\d{4}-\d{2}-\d{2}$/.test(String(bodyRecord.date || "").slice(0, 10))) {
        return res.status(400).json({ success: false, error: "RECORD_DATE_REQUIRED" });
      }
      const clock = cairoParts();
      const employeePayload = req.body?.employee || null;
      const allEmployees = await db.select().from(employees);
      let employee = allEmployees.find((row) => norm(row.id) === norm(requestedEmployeeId));
      if (!employee) {
        employee = allEmployees.find(
          (row) => norm(row.code) === norm(requestedEmployeeId) || norm(row.email) === norm(requestedEmployeeId)
        );
      }
      if (!employee && employeePayload?.id) {
        const id = String(employeePayload.id).trim();
        const values = {
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
          role: employeePayload.role ?? "employee",
          joinedDate: employeePayload.joinedDate ?? null,
          status: employeePayload.status ?? "active",
          annualLeaveBalance: employeePayload.annualLeaveBalance ?? 15,
          casualLeaveBalance: employeePayload.casualLeaveBalance ?? 7,
          regularLeaveBalance: employeePayload.regularLeaveBalance ?? 8,
          sickLeaveBalance: employeePayload.sickLeaveBalance ?? 30,
          isPhotoRemoved: Boolean(employeePayload.isPhotoRemoved),
          updatedAt: (/* @__PURE__ */ new Date()).toISOString()
        };
        await db.insert(employees).values(values).onConflictDoNothing({ target: employees.id });
        const inserted = await db.select().from(employees).where(eq3(employees.id, id));
        employee = inserted[0];
      }
      if (!employee) {
        console.warn("[attendance-realtime] employee not found", { requestedEmployeeId, available: allEmployees.length });
        return res.status(404).json({ success: false, error: "EMPLOYEE_NOT_FOUND", employeeId: requestedEmployeeId });
      }
      const employeeId = String(employee.id);
      const recordDate = action === "update" ? String(bodyRecord.date).slice(0, 10) : clock.date;
      const rows = bodyRecord.id ? await db.select().from(attendanceRecords).where(eq3(attendanceRecords.id, String(bodyRecord.id))) : await db.select().from(attendanceRecords).where(and(
        eq3(attendanceRecords.employeeId, employeeId),
        eq3(attendanceRecords.date, recordDate)
      ));
      const existing = rows[0];
      if (existing && norm(existing.employeeId) !== norm(employeeId)) {
        return res.status(409).json({ success: false, error: "RECORD_EMPLOYEE_MISMATCH" });
      }
      const nowIso2 = (/* @__PURE__ */ new Date()).toISOString();
      const updatedRecord = {
        ...existing || {},
        ...bodyRecord,
        id: existing?.id || bodyRecord.id || `${employeeId}-${recordDate}`,
        employeeId,
        date: recordDate,
        updatedAt: nowIso2
      };
      if (action === "check_in") updatedRecord.checkIn = clock.time;
      if (action === "check_out") updatedRecord.checkOut = clock.time;
      if (action === "break_start") updatedRecord.breakStart = clock.time;
      if (action === "break_end" || action === "force_break_end") updatedRecord.breakEnd = clock.time;
      if (!existing) await db.insert(attendanceRecords).values(updatedRecord);
      else await db.update(attendanceRecords).set(updatedRecord).where(eq3(attendanceRecords.id, existing.id));
      const attendanceRecords2 = await db.select().from(attendanceRecords);
      return res.json({ success: true, record: updatedRecord, attendanceRecords: attendanceRecords2, employee, lastUpdated: Date.now() });
    } catch (error) {
      console.error("[attendance-realtime]", error);
      return res.status(500).json({ success: false, error: "Attendance update failed" });
    }
  });
}

// server/device-sync-v2.ts
import { and as and2, eq as eq4 } from "drizzle-orm";
var hasDatabase3 = () => Boolean(process.env.DATABASE_URL || process.env.SUPABASE_DB_URL);
var pick = (s, k) => {
  const o = {};
  for (const x of k) if (s?.[x] !== void 0) o[x] = s[x];
  return o;
};
var ms = (v) => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && /^\d{10,}$/.test(v.trim())) {
    const n = Number(v.trim());
    return Number.isFinite(n) ? n : 0;
  }
  const t = new Date(String(v || "")).getTime();
  return Number.isFinite(t) ? t : 0;
};
var stamp = (v) => {
  const t = ms(v);
  return t ? new Date(t).toISOString() : (/* @__PURE__ */ new Date()).toISOString();
};
var newestStamp = (item, syncTime) => {
  const itemTime = ms(item?.updatedAt);
  return itemTime ? stamp(itemTime) : stamp(syncTime);
};
var apiPath = (req) => String(req.path || req.url || "").split("?")[0].replace(/\/+$/, "") || "/";
var isDataPath = (req) => ["/api/data", "/data"].includes(apiPath(req));
var isSyncPath = (req) => ["/api/sync", "/sync"].includes(apiPath(req));
var tombstoneKey = (kind) => `__sync_deleted_ids:${kind}`;
async function getTombstones(kind) {
  const rows = await db.select().from(settings).where(eq4(settings.key, tombstoneKey(kind)));
  const v = rows[0]?.value;
  return new Set(Array.isArray(v) ? v.map(String) : []);
}
async function addTombstones(kind, ids) {
  if (!Array.isArray(ids) || !ids.length) return;
  const key = tombstoneKey(kind);
  const rows = await db.select().from(settings).where(eq4(settings.key, key));
  const old = Array.isArray(rows[0]?.value) ? rows[0].value.map(String) : [];
  const next = Array.from(/* @__PURE__ */ new Set([...old, ...ids.map((x) => String(x || "").trim()).filter(Boolean)])).slice(-5e3);
  if (rows[0]) await db.update(settings).set({ value: next }).where(eq4(settings.key, key));
  else await db.insert(settings).values({ key, value: next });
}
async function resolveShiftId(value) {
  const requested = String(value ?? "").trim();
  if (requested) {
    const exact = await db.select().from(shifts).where(eq4(shifts.id, requested));
    if (exact[0]) return exact[0].id;
  }
  if (!requested || requested === "shift-1") {
    const standard = await db.select().from(shifts).where(and2(eq4(shifts.startTime, "09:00"), eq4(shifts.endTime, "17:00")));
    if (standard[0]) return standard[0].id;
  }
  return requested || null;
}
async function upsert(table, id, values, existing) {
  if (!existing) return db.insert(table).values(values);
  const incoming = ms(values.updatedAt), current = ms(existing.updatedAt || existing.createdAt);
  if (!incoming) return;
  if (!current || incoming >= current) return db.update(table).set(values).where(eq4(table.id, id));
}
async function upsertEmployee(e, syncTime) {
  if (!e?.id) return;
  const id = String(e.id), v = pick(e, ["id", "code", "nameAr", "nameEn", "avatar", "email", "phone", "department", "jobTitleAr", "jobTitleEn", "shiftId", "pin", "role", "joinedDate", "status", "annualLeaveBalance", "casualLeaveBalance", "regularLeaveBalance", "sickLeaveBalance", "isPhotoRemoved", "updatedAt"]);
  v.shiftId = await resolveShiftId(v.shiftId);
  v.updatedAt = newestStamp(e, syncTime);
  const a = await db.select().from(employees).where(eq4(employees.id, id));
  if (!a[0]) {
    await db.insert(employees).values(v);
    return;
  }
  await upsert(employees, id, v, a[0]);
}
async function upsertAttendance(r, syncTime, tombs) {
  if (!r?.employeeId || !r?.date) return;
  const employeeId = String(r.employeeId), date = String(r.date).slice(0, 10), v = pick(r, ["id", "employeeId", "date", "checkIn", "checkOut", "breakStart", "breakEnd", "breaks", "totalBreakSeconds", "location", "deviceInfo", "lateMinutes", "lateSeconds", "earlyLeaveMinutes", "workHours", "overtimeHours", "minusHours", "status", "leaveType", "notes", "verifiedByFace", "isExcused", "excusedBy", "excusedReason", "updatedAt", "isExplicitCancelCheckOut"]);
  if (v.id && tombs.has(String(v.id))) return;
  v.employeeId = employeeId;
  v.date = date;
  v.updatedAt = newestStamp(r, syncTime);
  const a = await db.select().from(attendanceRecords).where(and2(eq4(attendanceRecords.employeeId, employeeId), eq4(attendanceRecords.date, date)));
  if (!a[0]) {
    await db.insert(attendanceRecords).values(v);
    return;
  }
  const incoming = ms(v.updatedAt), current = ms(a[0].updatedAt || a[0].createdAt);
  if (current && incoming < current) return;
  await db.update(attendanceRecords).set(v).where(eq4(attendanceRecords.id, a[0].id));
}
async function upsertLeave(r, syncTime, tombs) {
  if (!r?.id || !r?.employeeId) return;
  const id = String(r.id);
  if (tombs.has(id)) return;
  const v = pick(r, ["id", "employeeId", "type", "startDate", "endDate", "reason", "status", "createdAt", "updatedAt", "hours", "permissionSlot", "attachmentUrl", "attachmentName", "reviewedBy", "reviewNotes"]);
  v.updatedAt = newestStamp(r, syncTime);
  const a = await db.select().from(leaveRequests).where(eq4(leaveRequests.id, id));
  if (!a[0]) {
    await db.insert(leaveRequests).values(v);
    return;
  }
  await upsert(leaveRequests, id, v, a[0]);
}
async function upsertOvertime(r, syncTime) {
  if (!r?.id || !r?.employeeId) return;
  const id = String(r.id), v = pick(r, ["id", "employeeId", "date", "type", "durationSeconds", "reason", "status", "reviewedBy", "reviewNotes", "createdAt", "updatedAt"]);
  v.updatedAt = newestStamp(r, syncTime);
  const a = await db.select().from(overtimeRequests).where(eq4(overtimeRequests.id, id));
  if (!a[0]) {
    await db.insert(overtimeRequests).values(v);
    return;
  }
  await upsert(overtimeRequests, id, v, a[0]);
}
async function upsertShift(r, syncTime, tombs) {
  if (!r?.id || !r?.name && !r?.nameAr && !r?.nameEn || !r?.startTime || !r?.endTime) return;
  const id = String(r.id);
  if (tombs?.has(id)) return;
  const v = pick(r, ["id", "name", "nameAr", "nameEn", "startTime", "endTime", "durationMinutes", "breakMinutes", "gracePeriodMinutes", "overtimeEnabled", "isOvernight", "createdAt", "updatedAt"]);
  v.name = String(r.name || r.nameEn || r.nameAr || id);
  v.durationMinutes = Number(v.durationMinutes || 480);
  v.breakMinutes = Number(v.breakMinutes || 0);
  v.gracePeriodMinutes = Number(v.gracePeriodMinutes || 0);
  v.overtimeEnabled = Boolean(v.overtimeEnabled);
  v.isOvernight = Boolean(v.isOvernight || String(v.startTime) > String(v.endTime));
  v.updatedAt = newestStamp(r, syncTime);
  delete v.nameAr;
  delete v.nameEn;
  const a = await db.select().from(shifts).where(eq4(shifts.id, id));
  if (!a[0]) await db.insert(shifts).values(v);
  else await upsert(shifts, id, v, a[0]);
  if (r.breaks !== void 0) {
    const rows = await db.select().from(settings).where(eq4(settings.key, "shiftBreaks"));
    const map = rows[0]?.value && typeof rows[0].value === "object" && !Array.isArray(rows[0].value) ? { ...rows[0].value } : {};
    map[id] = Array.isArray(r.breaks) ? r.breaks : [];
    await setting("shiftBreaks", map, syncTime);
  }
}
async function upsertAssignment(r, syncTime) {
  if (!r?.id || !r?.employeeId || !r?.scheduleDate) return;
  const id = String(r.id), v = pick(r, ["id", "employeeId", "scheduleDate", "shiftTemplateId", "customStartTime", "customEndTime", "durationMinutes", "status", "createdAt", "updatedAt", "version"]);
  v.updatedAt = newestStamp(r, syncTime);
  const a = await db.select().from(employeeShiftAssignments).where(eq4(employeeShiftAssignments.id, id));
  if (!a[0]) {
    await db.insert(employeeShiftAssignments).values(v);
    return;
  }
  await upsert(employeeShiftAssignments, id, v, a[0]);
}
function collectionKey(x, index) {
  if (x?.id != null) return `id:${String(x.id)}`;
  if (x?.employeeId != null && x?.date != null) return `employee-date:${String(x.employeeId)}:${String(x.date)}`;
  if (x?.employeeId != null && x?.scheduleDate != null) return `employee-schedule:${String(x.employeeId)}:${String(x.scheduleDate)}`;
  return `index:${index}`;
}
function mergeCollection(existing, incoming) {
  const oldItems = Array.isArray(existing) ? existing : [], newItems = Array.isArray(incoming) ? incoming : [], map = /* @__PURE__ */ new Map();
  oldItems.forEach((x, i) => map.set(collectionKey(x, i), x));
  newItems.forEach((x, i) => {
    const key = collectionKey(x, i), old = map.get(key);
    if (!old) {
      map.set(key, x);
      return;
    }
    const incomingTs = ms(x?.updatedAt || x?.createdAt), oldTs = ms(old?.updatedAt || old?.createdAt);
    if (!incomingTs || !oldTs || incomingTs >= oldTs) map.set(key, x);
  });
  return Array.from(map.values());
}
async function setting(k, v, updatedAt) {
  const a = await db.select().from(settings).where(eq4(settings.key, k)), isCollection = k === "dailyShiftAssignments" || k === "shiftSwapRequests";
  if (!a[0]) {
    await db.insert(settings).values({ key: k, value: v });
    if (isCollection) {
      const stampKey2 = `__sync_updated_at:${k}`, next2 = stamp(updatedAt);
      await db.insert(settings).values({ key: stampKey2, value: next2 });
    }
    return;
  }
  const stampKey = `__sync_updated_at:${k}`, ts = ms(updatedAt);
  if (isCollection) {
    await db.update(settings).set({ value: mergeCollection(a[0].value, v) }).where(eq4(settings.key, k));
    const next2 = stamp(updatedAt);
    const t2 = await db.select().from(settings).where(eq4(settings.key, stampKey));
    if (!t2[0]) await db.insert(settings).values({ key: stampKey, value: next2 });
    else await db.update(settings).set({ value: next2 }).where(eq4(settings.key, stampKey));
    return;
  }
  if (!ts) return;
  const t = await db.select().from(settings).where(eq4(settings.key, stampKey)), current = ms(t[0]?.value);
  if (current && ts < current) return;
  await db.update(settings).set({ value: v }).where(eq4(settings.key, k));
  const next = stamp(updatedAt);
  if (!t[0]) await db.insert(settings).values({ key: stampKey, value: next });
  else await db.update(settings).set({ value: next }).where(eq4(settings.key, stampKey));
}
async function del(t, ids, kind) {
  if (!Array.isArray(ids)) return;
  const clean5 = ids.map((x) => String(x || "").trim()).filter(Boolean);
  if (!clean5.length) return;
  await addTombstones(kind, clean5);
  for (const id of clean5) await db.delete(t).where(eq4(t.id, id));
}
async function snapshot() {
  const [employees2, attendanceRecords2, leaveRequests2, overtimeRequests2, shifts2, settings2] = await Promise.all([db.select().from(employees), db.select().from(attendanceRecords), db.select().from(leaveRequests), db.select().from(overtimeRequests), db.select().from(shifts), db.select().from(settings)]);
  let employeeShiftAssignments2 = [];
  try {
    employeeShiftAssignments2 = await db.select().from(employeeShiftAssignments);
  } catch (e) {
    console.warn("[device-sync-v2] employee_shift_assignments table unavailable; continuing with settings-based schedule sync", e);
  }
  const m = new Map(settings2.filter((s) => !String(s.key).startsWith("__sync_updated_at:") && !String(s.key).startsWith("__sync_deleted_ids:")).map((s) => [s.key, s.value]));
  const breakMap = m.get("shiftBreaks") && typeof m.get("shiftBreaks") === "object" && !Array.isArray(m.get("shiftBreaks")) ? m.get("shiftBreaks") : {};
  const decorate = (x) => ({ ...x, breaks: Array.isArray(x?.breaks) ? x.breaks : Array.isArray(breakMap[String(x?.id)]) ? breakMap[String(x?.id)] : [] });
  const rawTemplates = m.get("shiftTemplates");
  const templateValue = Array.isArray(rawTemplates) && rawTemplates.length === 1 && rawTemplates[0] && typeof rawTemplates[0] === "object" && rawTemplates[0].value ? rawTemplates[0].value : rawTemplates;
  const effectiveShifts = (shifts2.length ? shifts2 : (Array.isArray(templateValue) ? templateValue : []).map((x) => ({ ...x, name: String(x?.name || x?.nameEn || x?.nameAr || x?.id || ""), durationMinutes: Number(x?.durationMinutes || 480), gracePeriodMinutes: Number(x?.gracePeriodMinutes || 0) }))).map(decorate);
  const shiftIds = new Set(effectiveShifts.map((s) => String(s.id)));
  const fallbackShift = effectiveShifts[0]?.id || null;
  const normalizedEmployees = employees2.map((e) => ({ ...e, shiftId: e.shiftId && shiftIds.has(String(e.shiftId)) ? e.shiftId : fallbackShift }));
  const all = [...employees2, ...attendanceRecords2, ...leaveRequests2, ...overtimeRequests2, ...shifts2, ...employeeShiftAssignments2];
  const syncSettingTimes = settings2.filter((s) => String(s.key).startsWith("__sync_updated_at:")).map((s) => ms(s.value));
  const lastUpdated = Math.max(0, ...all.map((x) => ms(x?.updatedAt || x?.createdAt)), ...syncSettingTimes);
  return { success: true, employees: normalizedEmployees, attendanceRecords: attendanceRecords2, leaveRequests: leaveRequests2, overtimeRequests: overtimeRequests2, shifts: effectiveShifts, dailyShiftAssignments: Array.isArray(m.get("dailyShiftAssignments")) ? m.get("dailyShiftAssignments") : [], shiftSwapRequests: Array.isArray(m.get("shiftSwapRequests")) ? m.get("shiftSwapRequests") : [], companyNameAr: m.get("companyNameAr") ?? null, companyNameEn: m.get("companyNameEn") ?? null, urgentNotice: m.get("urgentNotice") ?? null, employeeShiftAssignments: employeeShiftAssignments2, lastUpdated };
}
function registerDeviceSyncV2(app2) {
  app2.use(async (req, res, next) => {
    if (!hasDatabase3()) return next();
    if (req.method !== "GET" && req.method !== "POST") return next();
    const dataPath = isDataPath(req), syncPath = isSyncPath(req);
    if (!dataPath && !syncPath) return next();
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    try {
      if (req.method === "GET" && dataPath) return res.json(await snapshot());
      if (req.method !== "POST" || !syncPath) return next();
      const b = req.body || {}, has = ["employees", "attendanceRecords", "leaveRequests", "overtimeRequests", "shifts", "employeeShiftAssignments", "dailyShiftAssignments", "shiftSwapRequests", "companyNameAr", "companyNameEn", "urgentNotice", "deletedAttendanceIds", "deletedEmployeeIds", "deletedLeaveIds", "deletedShiftIds"].some((k) => b[k] !== void 0);
      if (!has) return res.json(await snapshot());
      const syncTime = stamp(b.lastUpdated || Date.now());
      const attendanceTombs = await getTombstones("attendance"), leaveTombs = await getTombstones("leave"), shiftTombs = await getTombstones("shift");
      for (const e of Array.isArray(b.employees) ? b.employees : []) await upsertEmployee(e, syncTime);
      for (const r of Array.isArray(b.attendanceRecords) ? b.attendanceRecords : []) await upsertAttendance(r, syncTime, attendanceTombs);
      for (const r of Array.isArray(b.leaveRequests) ? b.leaveRequests : []) await upsertLeave(r, syncTime, leaveTombs);
      for (const r of Array.isArray(b.overtimeRequests) ? b.overtimeRequests : []) await upsertOvertime(r, syncTime);
      for (const s of Array.isArray(b.shifts) ? b.shifts : []) await upsertShift(s, syncTime, shiftTombs);
      for (const a of Array.isArray(b.employeeShiftAssignments) ? b.employeeShiftAssignments : []) await upsertAssignment(a, syncTime);
      if (Array.isArray(b.dailyShiftAssignments)) await setting("dailyShiftAssignments", b.dailyShiftAssignments, syncTime);
      if (Array.isArray(b.shiftSwapRequests)) await setting("shiftSwapRequests", b.shiftSwapRequests, syncTime);
      if (b.companyNameAr !== void 0) await setting("companyNameAr", b.companyNameAr, syncTime);
      if (b.companyNameEn !== void 0) await setting("companyNameEn", b.companyNameEn, syncTime);
      if (b.urgentNotice !== void 0) await setting("urgentNotice", b.urgentNotice, syncTime);
      await del(attendanceRecords, b.deletedAttendanceIds, "attendance");
      await del(employees, b.deletedEmployeeIds, "employee");
      await del(shifts, b.deletedShiftIds, "shift");
      if (Array.isArray(b.deletedShiftIds) && b.deletedShiftIds.length) {
        const rows = await db.select().from(settings).where(eq4(settings.key, "shiftBreaks"));
        const map = rows[0]?.value && typeof rows[0].value === "object" && !Array.isArray(rows[0].value) ? { ...rows[0].value } : {};
        for (const id of b.deletedShiftIds.map((x) => String(x))) delete map[id];
        await setting("shiftBreaks", map, syncTime);
      }
      await del(employees, b.deletedEmployeeIds, "employee");
      await del(leaveRequests, b.deletedLeaveIds, "leave");
      return res.json(await snapshot());
    } catch (e) {
      console.error("[device-sync-v2]", e);
      return res.status(500).json({ success: false, error: "Cross-device sync failed" });
    }
  });
}

// server/schedule-sync-guard.ts
import { eq as eq5 } from "drizzle-orm";
var apiPath2 = (req) => String(req.path || req.originalUrl || req.url || "").split("?")[0].replace(/\/+$/, "") || "/";
var isSyncPath2 = (req) => ["/api/sync", "/sync"].includes(apiPath2(req));
var isSchedulePayload = (body) => Array.isArray(body?.dailyShiftAssignments);
var asBoolean = (value) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "off";
};
var dateKey = (value) => {
  const raw = String(value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
};
var timeMs = (value) => {
  const t = new Date(String(value ?? "")).getTime();
  return Number.isFinite(t) ? t : 0;
};
function normalizeAssignment(item, assignedBy, fallbackUpdatedAt) {
  const employeeId = String(item?.employeeId ?? item?.employee_id ?? "").trim();
  const date = dateKey(item?.date ?? item?.scheduleDate ?? item?.schedule_date);
  const rawShift = String(item?.shiftId ?? item?.shift_id ?? "").trim();
  const status = String(item?.status ?? "").trim().toUpperCase();
  const clear = Boolean(item?.clear || item?.isClear || item?.is_clear || status === "CLEAR");
  const isOffDay = !clear && !rawShift && (asBoolean(item?.isOffDay ?? item?.is_off_day) || status === "OFF");
  const shiftId = clear || isOffDay ? null : rawShift || null;
  const rawUpdatedAt = item?.updatedAt ?? item?.updated_at ?? fallbackUpdatedAt ?? "";
  return { employeeId, date, shiftId, isOffDay, clear, assignedBy: String(item?.assignedBy ?? item?.assigned_by ?? assignedBy ?? "").trim() || void 0, updatedAt: rawUpdatedAt ? String(rawUpdatedAt) : "" };
}
function mergeAssignments(existing, incoming) {
  const map = /* @__PURE__ */ new Map();
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
    if (current && !normalized.updatedAt) {
      ignoredStale += 1;
      continue;
    }
    if (current?.updatedAt && normalized.updatedAt && timeMs(normalized.updatedAt) < timeMs(current.updatedAt)) {
      ignoredStale += 1;
      continue;
    }
    if (normalized.clear) map.delete(key);
    else map.set(key, normalized);
  }
  return { assignments: Array.from(map.values()), ignoredStale };
}
function registerScheduleSyncGuard(app2) {
  app2.use(async (req, res, next) => {
    const scheduleRequest = req.method === "POST" && isSyncPath2(req) && isSchedulePayload(req.body);
    if (!scheduleRequest) return next();
    try {
      const incoming = req.body.dailyShiftAssignments.map((item) => normalizeAssignment(item, req.body?.assignedBy, item?.updatedAt ?? item?.updated_at));
      const invalid = incoming.find((item) => !item.employeeId || !/^\d{4}-\d{2}-\d{2}$/.test(item.date) || !item.isOffDay && !item.shiftId && !item.clear);
      if (invalid) return res.status(400).json({ success: false, code: "INVALID_SCHEDULE_PAYLOAD", message: "Each schedule assignment requires employee_id, YYYY-MM-DD date, shift_id, OFF, or CLEAR." });
      const settingsRows = await db.select().from(settings).where(eq5(settings.key, "dailyShiftAssignments"));
      const { assignments: merged } = mergeAssignments(settingsRows[0]?.value, incoming);
      req.body = { ...req.body, dailyShiftAssignments: void 0, __authoritativeScheduleSnapshot: merged };
      return next();
    } catch (error) {
      console.error("[schedule-sync] DATABASE PREPROCESS FAILED:", error);
      return res.status(500).json({ success: false, code: "SCHEDULE_DATABASE_PREPROCESS_FAILED", message: error?.message || "Schedule database preprocessing failed." });
    }
  });
}

// server/schedule-sync-direct.ts
import { eq as eq6 } from "drizzle-orm";
var asBoolean2 = (value) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "off";
};
var normalizeAssignment2 = (item) => {
  const employeeId = String(item?.employeeId ?? item?.employee_id ?? "").trim();
  const date = String(item?.date ?? item?.scheduleDate ?? item?.schedule_date ?? "").slice(0, 10);
  const rawShiftId = String(item?.shiftId ?? item?.shift_id ?? "").trim();
  const status = String(item?.status ?? "").trim().toUpperCase();
  const clear = Boolean(item?.clear || item?.isClear || item?.is_clear || status === "CLEAR");
  const isOffDay = !clear && !rawShiftId && (asBoolean2(item?.isOffDay ?? item?.is_off_day) || status === "OFF");
  const shiftId = clear || isOffDay ? "" : rawShiftId;
  return { employeeId, date, shiftId, isOffDay, clear, assignedBy: item?.assignedBy ?? item?.assigned_by, updatedAt: item?.updatedAt ?? item?.updated_at };
};
var normalizePattern = (item) => ({
  id: String(item?.id ?? "").trim(),
  name: String(item?.name ?? "").trim(),
  shiftIds: Array.isArray(item?.shiftIds) ? item.shiftIds.map((x) => String(x)).filter(Boolean) : [],
  createdAt: String(item?.createdAt ?? item?.created_at ?? (/* @__PURE__ */ new Date()).toISOString()),
  updatedAt: String(item?.updatedAt ?? item?.updated_at ?? (/* @__PURE__ */ new Date()).toISOString())
});
var normalizePatternItem = (item) => ({ id: String(item?.id ?? "").trim(), patternId: String(item?.patternId ?? item?.pattern_id ?? "").trim(), shiftId: String(item?.shiftId ?? item?.shift_id ?? "").trim(), sequence: Number(item?.sequence ?? 0) });
async function persistRotationPatterns(patterns, items) {
  for (const raw of patterns) {
    const p = normalizePattern(raw);
    if (!p.id || !p.name) continue;
    const existing = await db.select().from(rotationPatterns).where(eq6(rotationPatterns.id, p.id));
    if (existing[0]) await db.update(rotationPatterns).set(p).where(eq6(rotationPatterns.id, p.id));
    else await db.insert(rotationPatterns).values(p);
  }
  for (const raw of items) {
    const item = normalizePatternItem(raw);
    if (!item.id || !item.patternId || !item.shiftId) continue;
    const existing = await db.select().from(rotationPatternItems).where(eq6(rotationPatternItems.id, item.id));
    if (existing[0]) await db.update(rotationPatternItems).set(item).where(eq6(rotationPatternItems.id, item.id));
    else await db.insert(rotationPatternItems).values(item);
  }
}
async function deleteRotationRows(patternIds, itemIds) {
  for (const id of (Array.isArray(itemIds) ? itemIds : []).map(String).filter(Boolean)) await db.delete(rotationPatternItems).where(eq6(rotationPatternItems.id, id));
  for (const id of (Array.isArray(patternIds) ? patternIds : []).map(String).filter(Boolean)) {
    await db.delete(rotationPatternItems).where(eq6(rotationPatternItems.patternId, id));
    await db.delete(rotationPatterns).where(eq6(rotationPatterns.id, id));
  }
}
async function rotationSnapshot() {
  const [patterns, items] = await Promise.all([db.select().from(rotationPatterns), db.select().from(rotationPatternItems)]);
  return { rotationPatterns: patterns, rotationPatternItems: items };
}
function registerDirectScheduleSync(app2) {
  app2.get("/api/rotation-patterns", async (_req, res) => {
    try {
      return res.json({ success: true, ...await rotationSnapshot() });
    } catch (error) {
      console.error("[rotation-patterns] GET failed", error);
      return res.status(500).json({ success: false, error: "ROTATION_PATTERNS_READ_FAILED" });
    }
  });
  app2.post("/api/rotation-patterns", async (req, res) => {
    try {
      await persistRotationPatterns(Array.isArray(req.body?.rotationPatterns) ? req.body.rotationPatterns : req.body?.pattern ? [req.body.pattern] : [], Array.isArray(req.body?.rotationPatternItems) ? req.body.rotationPatternItems : []);
      await deleteRotationRows(req.body?.deletedRotationPatternIds, req.body?.deletedRotationPatternItemIds);
      return res.json({ success: true, ...await rotationSnapshot() });
    } catch (error) {
      console.error("[rotation-patterns] POST failed", error);
      return res.status(500).json({ success: false, error: "ROTATION_PATTERNS_SAVE_FAILED" });
    }
  });
  app2.use(async (req, res, next) => {
    const pathName = String(req.path || "").split("?")[0];
    if (req.method !== "POST" || !["/api/sync", "/sync"].includes(pathName)) return next();
    const body = req.body || {};
    const hasRotationPayload = Array.isArray(body.rotationPatterns) || Array.isArray(body.rotationPatternItems) || Array.isArray(body.deletedRotationPatternIds) || Array.isArray(body.deletedRotationPatternItemIds);
    if (!hasRotationPayload) return next();
    try {
      await persistRotationPatterns(body.rotationPatterns || [], body.rotationPatternItems || []);
      await deleteRotationRows(body.deletedRotationPatternIds, body.deletedRotationPatternItemIds);
      return next();
    } catch (error) {
      console.error("[rotation-sync] persistence failed", error);
      return res.status(500).json({ success: false, error: "Rotation sync failed" });
    }
  });
  app2.post("/api/schedule-sync", async (req, res) => {
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    try {
      console.log(`[schedule-sync] ${requestId} POST received`, { count: Array.isArray(req.body?.dailyShiftAssignments) ? req.body.dailyShiftAssignments.length : -1 });
      if (!Array.isArray(req.body?.dailyShiftAssignments)) return res.status(400).json({ success: false, error: "dailyShiftAssignments must be an array" });
      const received = req.body.dailyShiftAssignments.map(normalizeAssignment2).filter((x) => x.employeeId && /^\d{4}-\d{2}-\d{2}$/.test(x.date));
      const stamp2 = (/* @__PURE__ */ new Date()).toISOString();
      const incoming = received.map((x) => ({ ...x, updatedAt: x.updatedAt || stamp2 }));
      const existingRows = await db.select().from(settings).where(eq6(settings.key, "dailyShiftAssignments"));
      const existing = Array.isArray(existingRows[0]?.value) ? existingRows[0].value.map(normalizeAssignment2) : [];
      const merged = /* @__PURE__ */ new Map();
      for (const row of existing) if (row.employeeId && row.date) merged.set(`${row.employeeId}|${row.date}`, row);
      for (const row of incoming) {
        const key = `${row.employeeId}|${row.date}`;
        const previous = merged.get(key);
        const previousTime = Date.parse(String(previous?.updatedAt || ""));
        const incomingTime = Date.parse(String(row.updatedAt || stamp2));
        if (!previous || !Number.isFinite(previousTime) || !Number.isFinite(incomingTime) || incomingTime >= previousTime) {
          if (row.clear) merged.delete(key);
          else merged.set(key, row);
        }
      }
      const assignments = Array.from(merged.values()).map((row) => ({ employeeId: row.employeeId, date: row.date, shiftId: row.shiftId || "", isOffDay: Boolean(row.isOffDay), assignedBy: row.assignedBy, updatedAt: row.updatedAt || stamp2 }));
      if (existingRows[0]) await db.update(settings).set({ value: assignments }).where(eq6(settings.key, "dailyShiftAssignments"));
      else await db.insert(settings).values({ key: "dailyShiftAssignments", value: assignments });
      const stampKey = "__sync_updated_at:dailyShiftAssignments";
      const stampRow = await db.select().from(settings).where(eq6(settings.key, stampKey));
      if (stampRow[0]) await db.update(settings).set({ value: stamp2 }).where(eq6(settings.key, stampKey));
      else await db.insert(settings).values({ key: stampKey, value: stamp2 });
      console.log(`[schedule-sync] ${requestId} saved`, { received: received.length, total: assignments.length });
      return res.json({ success: true, dailyShiftAssignments: assignments, lastUpdated: Date.now(), updatedAt: stamp2, syncRequestId: requestId });
    } catch (error) {
      console.error(`[direct-schedule-sync] ${requestId} failed`, error);
      return res.status(500).json({ success: false, error: "DIRECT_SCHEDULE_SYNC_FAILED", syncRequestId: requestId });
    }
  });
}

// server/db-write-verification.ts
import crypto3 from "crypto";
import { sql as sql3, eq as eq7 } from "drizzle-orm";
var pathOf = (req) => String(req.path || req.url || "").split("?")[0].replace(/\/+$/, "") || "/";
var clean4 = (v) => String(v ?? "").trim();
var idHash = (v) => crypto3.createHash("sha256").update(clean4(v)).digest("hex").slice(0, 12);
async function verifyCollection(name, items) {
  if (!items.length) return { requested: 0, found: 0 };
  const ids = items.map((x) => clean4(x?.id)).filter(Boolean);
  if (!ids.length) return { requested: items.length, found: 0 };
  let found = 0;
  if (name === "employees") {
    const rows = await db.select({ id: employees.id }).from(employees);
    const set = new Set(rows.map((x) => String(x.id)));
    found = ids.filter((id) => set.has(id)).length;
  } else if (name === "attendanceRecords") {
    const rows = await db.select({ id: attendanceRecords.id }).from(attendanceRecords);
    const set = new Set(rows.map((x) => String(x.id)));
    found = ids.filter((id) => set.has(id)).length;
  } else if (name === "leaveRequests") {
    const rows = await db.select({ id: leaveRequests.id }).from(leaveRequests);
    const set = new Set(rows.map((x) => String(x.id)));
    found = ids.filter((id) => set.has(id)).length;
  } else if (name === "notifications") {
    const rows = await db.select({ id: notifications.id }).from(notifications);
    const set = new Set(rows.map((x) => String(x.id)));
    found = ids.filter((id) => set.has(id)).length;
  } else if (name === "shifts") {
    const rows = await db.select({ id: shifts.id }).from(shifts);
    const set = new Set(rows.map((x) => String(x.id)));
    found = ids.filter((id) => set.has(id)).length;
  } else if (name === "employeeShiftAssignments") {
    const rows = await db.select({ id: employeeShiftAssignments.id }).from(employeeShiftAssignments);
    const set = new Set(rows.map((x) => String(x.id)));
    found = ids.filter((id) => set.has(id)).length;
  }
  return { requested: items.length, found };
}
async function verifySchedule(items) {
  if (!items.length) return { requested: 0, found: 0, cleared: 0 };
  const rows = await db.select().from(settings).where(eq7(settings.key, "dailyShiftAssignments"));
  const stored = Array.isArray(rows[0]?.value) ? rows[0].value : [];
  const keys = new Set(stored.map((x) => `${clean4(x?.employeeId || x?.employee_id)}|${clean4(x?.date)}`));
  let found = 0;
  let cleared = 0;
  for (const item of items) {
    const key = `${clean4(item?.employeeId || item?.employee_id)}|${clean4(item?.date)}`;
    const isClear = Boolean(item?.clear) || String(item?.status || "").toUpperCase() === "CLEAR";
    if (isClear) {
      if (!keys.has(key)) cleared += 1;
    } else if (keys.has(key)) {
      found += 1;
    }
  }
  return { requested: items.length, found: found + cleared, cleared };
}
async function verifyDbIdentity() {
  const result = await db.execute(sql3`select current_database() as database_name, current_schema() as schema_name, current_user as db_user, inet_server_addr()::text as server_addr`);
  const row = result?.rows?.[0] || result?.[0] || {};
  return {
    database: row.database_name || null,
    schema: row.schema_name || null,
    user: row.db_user || null,
    serverHash: row.server_addr ? idHash(row.server_addr) : null
  };
}
function registerDbWriteVerification(app2) {
  app2.use((req, res, next) => {
    const p = pathOf(req);
    const isSync = req.method === "POST" && (p === "/api/sync" || p === "/sync");
    const isSchedule = req.method === "POST" && p === "/api/schedule-sync";
    if (!isSync && !isSchedule) return next();
    const originalJson = res.json.bind(res);
    res.json = async (body) => {
      try {
        const b = req.body || {};
        const verification = { database: await verifyDbIdentity() };
        if (isSync) {
          verification.employees = await verifyCollection("employees", Array.isArray(b.employees) ? b.employees : []);
          verification.attendanceRecords = await verifyCollection("attendanceRecords", Array.isArray(b.attendanceRecords) ? b.attendanceRecords : []);
          verification.leaveRequests = await verifyCollection("leaveRequests", Array.isArray(b.leaveRequests) ? b.leaveRequests : []);
          verification.notifications = await verifyCollection("notifications", Array.isArray(b.notifications) ? b.notifications : []);
          verification.shifts = await verifyCollection("shifts", Array.isArray(b.shifts) ? b.shifts : []);
          verification.employeeShiftAssignments = await verifyCollection("employeeShiftAssignments", Array.isArray(b.employeeShiftAssignments) ? b.employeeShiftAssignments : []);
          verification.dailyShiftAssignments = await verifySchedule(Array.isArray(b.dailyShiftAssignments) ? b.dailyShiftAssignments : []);
        } else {
          verification.dailyShiftAssignments = await verifySchedule(Array.isArray(b.dailyShiftAssignments) ? b.dailyShiftAssignments : []);
        }
        const failed = Object.entries(verification).some(([key, value]) => key !== "database" && Number(value?.requested || 0) > Number(value?.found || 0));
        if (failed) {
          console.error("[db-write-verification] persistence mismatch", JSON.stringify(verification));
          return originalJson({ success: false, error: "NEON_WRITE_VERIFICATION_FAILED", verification });
        }
        if (body && typeof body === "object" && !Array.isArray(body)) {
          body = { ...body, neonWriteVerified: true, neonVerification: verification };
        }
      } catch (error) {
        console.error("[db-write-verification] verification error:", error);
        return originalJson({ success: false, error: "NEON_WRITE_VERIFICATION_ERROR" });
      }
      return originalJson(body);
    };
    next();
  });
}

// server.ts
var app = express();
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
registerFcmRoutes(app);
var PORT = Number(process.env.PORT || 3e3);
var TZ2 = process.env.SERVER_TIME_ZONE || "Africa/Cairo";
var emptyState = () => ({ employees: [], attendanceRecords: [], leaveRequests: [], overtimeRequests: [], shifts: [], notifications: [], dailyShiftAssignments: [], shiftSwapRequests: [], companyNameAr: null, companyNameEn: null, urgentNotice: null, lastUpdated: Date.now() });
var localState = emptyState();
async function setting2(key, value) {
  await db.insert(settings).values({ key, value }).onConflictDoUpdate({ target: settings.key, set: { value } });
}
async function dbSnapshot() {
  const [employees2, attendanceRecords2, leaveRequests2, overtimeRequests2, shifts2, notifications2, settings2, employeeShiftAssignments2] = await Promise.all([db.select().from(employees), db.select().from(attendanceRecords), db.select().from(leaveRequests), db.select().from(overtimeRequests), db.select().from(shifts), db.select().from(notifications), db.select().from(settings), db.select().from(employeeShiftAssignments)]);
  const m = new Map(settings2.map((s) => [String(s.key), s.value]));
  const dailyShiftAssignments = Array.isArray(m.get("dailyShiftAssignments")) ? m.get("dailyShiftAssignments") : [];
  localState.employees = employees2;
  localState.attendanceRecords = attendanceRecords2;
  localState.leaveRequests = leaveRequests2;
  localState.overtimeRequests = overtimeRequests2;
  localState.shifts = shifts2;
  localState.notifications = notifications2;
  localState.dailyShiftAssignments = dailyShiftAssignments;
  localState.shiftSwapRequests = Array.isArray(m.get("shiftSwapRequests")) ? m.get("shiftSwapRequests") : [];
  return { success: true, employees: employees2, attendanceRecords: attendanceRecords2, leaveRequests: leaveRequests2, overtimeRequests: overtimeRequests2, shifts: shifts2, notifications: notifications2, employeeShiftAssignments: employeeShiftAssignments2, dailyShiftAssignments, shiftSwapRequests: localState.shiftSwapRequests, companyNameAr: m.get("companyNameAr") ?? null, companyNameEn: m.get("companyNameEn") ?? null, urgentNotice: m.get("urgentNotice") ?? null, lastUpdated: Date.now() };
}
registerNotificationSystemV2(app);
registerNotificationSse(app);
app.get("/api/data", async (_req, res) => {
  try {
    const result = await dbSnapshot();
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    return res.json(result);
  } catch (error) {
    console.error("[api/data] database snapshot failed:", error);
    return res.status(500).json({ success: false, error: "database_snapshot_failed" });
  }
});
registerRequestNotificationTriggers(app);
registerAttendanceRealtime(app);
registerScheduleSyncGuard(app);
app.use(async (req, res, next) => {
  const pathName = String(req.path || "").split("?")[0];
  if (req.method !== "POST" || !["/api/sync", "/sync"].includes(pathName)) return next();
  const body = req.body || {};
  const incoming = Array.isArray(body.leaveRequests) ? body.leaveRequests : [];
  const deleted = Array.isArray(body.deletedLeaveIds) ? body.deletedLeaveIds : [];
  if (!incoming.length && !deleted.length) return next();
  try {
    for (const item of incoming) {
      if (!item?.id || !item?.employeeId) continue;
      const id = String(item.id);
      const values = {};
      for (const key of ["id", "employeeId", "type", "startDate", "endDate", "reason", "status", "createdAt", "hours", "permissionSlot", "attachmentUrl", "attachmentName", "reviewedBy", "reviewNotes"]) if (item[key] !== void 0) values[key] = item[key];
      const existing = await db.select().from(leaveRequests).where(eq8(leaveRequests.id, id));
      if (!existing[0]) await db.insert(leaveRequests).values(values);
      else await db.update(leaveRequests).set(values).where(eq8(leaveRequests.id, id));
      await setting2(`__sync_updated_at:leave:${id}`, Date.now());
    }
    for (const rawId of deleted) {
      const id = String(rawId || "").trim();
      if (!id) continue;
      await db.delete(leaveRequests).where(eq8(leaveRequests.id, id));
      const rows = await db.select().from(settings).where(eq8(settings.key, "__sync_deleted_ids:leave"));
      const oldIds = Array.isArray(rows[0]?.value) ? rows[0].value.map(String) : [];
      await setting2("__sync_deleted_ids:leave", Array.from(/* @__PURE__ */ new Set([...oldIds, id])).slice(-5e3));
    }
    req.body = { ...body, leaveRequests: void 0, deletedLeaveIds: void 0 };
    return next();
  } catch (error) {
    console.error("[leave-sync-bridge] persistence failed:", error);
    return res.status(500).json({ success: false, error: "Leave sync failed" });
  }
});
app.use(async (req, res, next) => {
  if (req.method !== "POST" || !["/api/sync", "/sync"].includes(String(req.path || "").split("?")[0])) return next();
  const items = Array.isArray(req.body?.notifications) ? req.body.notifications : [];
  if (!items.length) return next();
  try {
    await ensureNotificationStorage();
    for (const item of items) {
      if (!item?.id || !item?.recipientId) continue;
      const id = String(item.id);
      const values = {};
      for (const key of ["id", "recipientId", "type", "title", "message", "relatedEmployeeId", "relatedLeaveId", "relatedOvertimeId", "relatedShiftSwapId", "isRead", "createdAt", "updatedAt"]) if (item[key] !== void 0) values[key] = item[key];
      const existing = await db.select().from(notifications).where(eq8(notifications.id, id));
      if (!existing[0]) await db.insert(notifications).values(values);
      else {
        const incoming = new Date(String(values.updatedAt || values.createdAt || "")).getTime();
        const current = new Date(String(existing[0].updatedAt || existing[0].createdAt || "")).getTime();
        if (Number.isFinite(incoming) && (!Number.isFinite(current) || incoming >= current)) await db.update(notifications).set(values).where(eq8(notifications.id, id));
      }
    }
  } catch (error) {
    console.error("[sync-bridge] notification persistence failed:", error);
    return res.status(500).json({ success: false, error: "Notification sync failed" });
  }
  return next();
});
registerDbWriteVerification(app);
registerDirectScheduleSync(app);
registerDeviceSyncV2(app);
var server_default = app;
if (process.env.VERCEL !== "1") app.listen(PORT, () => console.log(`Server running on port ${PORT} | Database: NEON`));
export {
  app,
  server_default as default
};
//# sourceMappingURL=server.js.map

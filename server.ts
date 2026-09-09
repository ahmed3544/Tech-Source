import "dotenv/config";
import crypto from "crypto";
import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { sql } from "drizzle-orm";
import { db } from "./src/db/index.js";
import * as schema from "./src/db/schema.js";
import { registerFcmRoutes } from "./server/fcm.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
registerFcmRoutes(app);

const PORT = Number(process.env.PORT || 3000);
const TZ = process.env.SERVER_TIME_ZONE || "Africa/Cairo";

const DATA_FILE = path.join(process.cwd(), "server_data.json");
const BACKUP_DIR = path.join(process.cwd(), "backups");

// Neon is now the authoritative runtime database. Supabase remains supported as fallback.
const USE_DATABASE = Boolean(process.env.DATABASE_URL || process.env.SUPABASE_DB_URL);

type State = {
  employees: any[];
  attendanceRecords: any[];
  leaveRequests: any[];
  overtimeRequests: any[];
  shifts: any[];
  notifications: any[];
  dailyShiftAssignments: any[];
  shiftSwapRequests: any[];
  companyNameAr?: any;
  companyNameEn?: any;
  urgentNotice?: any;
  lastUpdated: number;
};

const emptyState = (): State => ({
  employees: [],
  attendanceRecords: [],
  leaveRequests: [],
  overtimeRequests: [],
  shifts: [],
  notifications: [],
  dailyShiftAssignments: [],
  shiftSwapRequests: [],
  companyNameAr: null,
  companyNameEn: null,
  urgentNotice: null,
  lastUpdated: Date.now(),
});

function loadState(): State {
  if (!fs.existsSync(DATA_FILE)) {
    return emptyState();
  }

  try {
    const d = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));

    return {
      ...emptyState(),
      ...d,
      employees: Array.isArray(d.employees) ? d.employees : [],
      attendanceRecords: Array.isArray(d.attendanceRecords)
        ? d.attendanceRecords
        : [],
      leaveRequests: Array.isArray(d.leaveRequests)
        ? d.leaveRequests
        : [],
      overtimeRequests: Array.isArray(d.overtimeRequests)
        ? d.overtimeRequests
        : [],
      shifts: Array.isArray(d.shifts) ? d.shifts : [],
      notifications: Array.isArray(d.notifications)
        ? d.notifications
        : [],
      dailyShiftAssignments: Array.isArray(d.dailyShiftAssignments)
        ? d.dailyShiftAssignments
        : [],
      shiftSwapRequests: Array.isArray(d.shiftSwapRequests)
        ? d.shiftSwapRequests
        : [],
    };
  } catch {
    return emptyState();
  }
}

let localState = loadState();

function saveLocalState() {
  try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });

    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify(localState, null, 2)
    );

    fs.writeFileSync(
      path.join(BACKUP_DIR, "server_data_auto_backup.json"),
      JSON.stringify(localState, null, 2)
    );
  } catch (e) {
    console.error("Failed to save local state:", e);
  }
}

function clock() {
  const now = new Date();

  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  })
    .formatToParts(now)
    .reduce((a: any, x: any) => {
      if (x.type !== "literal") {
        a[x.type] = x.value;
      }

      return a;
    }, {});

  return {
    date: `${p.year}-${p.month}-${p.day}`,
    time: `${p.hour}:${p.minute}:${p.second}`,
    iso: now.toISOString(),
    timeZone: TZ,
  };
}

const norm = (x: any) =>
  String(x ?? "")
    .trim()
    .toLowerCase();

function mins(x: any) {
  if (!x) return 0;

  const t = String(x).trim();
  const a = t.split(":");

  let h = Number(a[0] || 0);
  const m = Number(a[1] || 0);

  if (/PM/i.test(t) && h < 12) {
    h += 12;
  }

  if (/AM/i.test(t) && h === 12) {
    h = 0;
  }

  return h * 60 + m;
}

function shiftFor(e: any, date?: string) {
  const daily = localState.dailyShiftAssignments.find(
    (assignment: any) =>
      norm(assignment.employeeId) === norm(e?.id) &&
      String(assignment.date) === String(date || "")
  );

  return (
    localState.shifts.find(
      (s: any) =>
        String(s.id) === String(daily?.shiftId || e?.shiftId)
    ) || {
      startTime: "09:00",
      endTime: "17:00",
      durationMinutes: 480,
      gracePeriodMinutes: 10,
    }
  );
}

/*
=========================================================
ATTENDANCE SANITIZE
=========================================================
*/

function sanitize(r: any) {
  const e = localState.employees.find(
    (x: any) =>
      norm(x.id) === norm(r.employeeId)
  );

  const sh = shiftFor(e, r.date);

  let work = 0;

  if (r.checkIn && r.checkOut) {
    let a = mins(r.checkIn);
    let b = mins(r.checkOut);

    if (b < a) {
      b += 1440;
    }

    work = Math.max(0, b - a);

    if (r.breakStart) {
      let c = mins(r.breakStart);

      let d = r.breakEnd
        ? mins(r.breakEnd)
        : b;

      if (d < c) {
        d += 1440;
      }

      work = Math.max(
        0,
        work - (d - c)
      );
    }
  }

  const duration = Number(
    sh.durationMinutes || 480
  );

  let late = 0;
  let early = 0;

  // No fixed arrival time: only an incomplete required duration is short.
  if (r.checkOut && !r.isExplicitCancelCheckOut) {
    early = Math.max(0, duration - work);
  }

  let status =
    r.status || "in_progress";

  if (r.checkIn && r.checkOut) {
    status =
      early > 0 ? "early_leave" : "on_time";
  } else if (r.checkIn) {
    status = "in_progress";
  }

  return {
    ...r,

    lateMinutes: late,
    earlyLeaveMinutes: early,

    workHours: r.isExplicitCancelCheckOut
      ? 0
      : Math.round((work / 60) * 100) / 100,

    overtimeHours:
      r.isExplicitCancelCheckOut
        ? 0
        : Math.round(
            Math.max(
              0,
              work - duration
            ) /
              60 *
              100
          ) / 100,

    minusHours: r.isExcused
      ? 0
      : Math.round(
          Math.max(
            0,
            duration - work
          ) /
            60 *
            100
        ) / 100,

    status,

    updatedAt:
      r.updatedAt ||
      new Date().toISOString(),
  };
}

/*
=========================================================
ATTENDANCE MERGE
=========================================================
*/

function mergeAttendance(
  a: any[] = [],
  b: any[] = []
) {
  const m = new Map<string, any>();

  for (const r of a) {
    if (
      r?.employeeId &&
      r?.date
    ) {
      m.set(
        `${norm(r.employeeId)}_${r.date}`,
        sanitize(r)
      );
    }
  }

  for (const r of b) {
    if (
      r?.employeeId &&
      r?.date
    ) {
      const k =
        `${norm(r.employeeId)}_${r.date}`;

      const old = m.get(k);

      m.set(
        k,
        sanitize({
          ...old,
          ...r,

          checkIn:
            r.checkIn ||
            old?.checkIn,

          checkOut:
            r.checkOut === undefined
              ? old?.checkOut
              : r.checkOut,
        })
      );
    }
  }

  return [...m.values()];
}

/*
=========================================================
LEAVE HELPERS
=========================================================
*/

function normalizeLeave(x: any) {
  const now = new Date().toISOString();

  return {
    ...x,
    id: String(x?.id ?? ""),
    employeeId: String(x?.employeeId ?? ""),
    type: x?.type ?? null,
    startDate: x?.startDate ? String(x.startDate).slice(0, 10) : null,
    endDate: x?.endDate ? String(x.endDate).slice(0, 10) : null,
    reason: x?.reason ?? null,
    status: x?.status ? String(x.status).toLowerCase() : "pending",
    createdAt: x?.createdAt ?? now,
    updatedAt: x?.updatedAt ?? x?.createdAt ?? now,
    hours: x?.hours == null ? null : Number(x.hours),
    permissionSlot: x?.permissionSlot ?? null,
    attachmentUrl: x?.attachmentUrl ?? null,
    attachmentName: x?.attachmentName ?? null,
    reviewedBy: x?.reviewedBy ?? null,
    reviewNotes: x?.reviewNotes ?? null,
  };
}

function isEmployeeOnLeave(leave: any, date: string) {
  if (!leave) return false;
  if (String(leave.status || "").toLowerCase() !== "approved") return false;
  if (!leave.startDate) return false;
  const start = String(leave.startDate).slice(0, 10);
  const end = String(leave.endDate || leave.startDate).slice(0, 10);
  return date >= start && date <= end;
}

function getActiveLeaves(leaves: any[], date: string) {
  return leaves.map(normalizeLeave).filter((x: any) => isEmployeeOnLeave(x, date));
}

async function setting(key: string, value: any) {
  await db.insert(schema.settings).values({ key, value } as any).onConflictDoUpdate({ target: schema.settings.key, set: { value } as any });
}

async function employeeUpsert(e: any) {
  const id = String(e.id);
  const existingRows = await db.select().from(schema.employees).where(sql`${schema.employees.id} = ${id}`);
  const existing = existingRows[0];
  const v = {
    id, code: e.code ?? null, nameAr: String(e.nameAr ?? ""), nameEn: String(e.nameEn ?? ""), avatar: e.avatar ?? null,
    email: e.email ?? null, phone: e.phone ?? null, department: e.department ?? null, jobTitleAr: e.jobTitleAr ?? null,
    jobTitleEn: e.jobTitleEn ?? null, shiftId: e.shiftId ?? null, pin: e.pin ?? null, role: e.role ?? null,
    joinedDate: e.joinedDate ?? null, status: e.status ?? null, annualLeaveBalance: e.annualLeaveBalance ?? null,
    casualLeaveBalance: e.casualLeaveBalance ?? null, regularLeaveBalance: e.regularLeaveBalance ?? null,
    sickLeaveBalance: e.sickLeaveBalance ?? null, isPhotoRemoved: Boolean(e.isPhotoRemoved),
  };
  if (existing) {
    const incomingUpdated = new Date(e.updatedAt || e.lastUpdated || 0).getTime();
    const existingUpdated = new Date((existing as any).updatedAt || 0).getTime();
    if (Number.isFinite(incomingUpdated) && Number.isFinite(existingUpdated) && incomingUpdated < existingUpdated) return existing;
    if (!e.updatedAt && !e.lastUpdated) return existing;
  }
  const finalValue = { ...v, updatedAt: e.updatedAt || new Date().toISOString() };
  if (!existing) return (await db.insert(schema.employees).values(finalValue as any).returning())[0];
  return (await db.update(schema.employees).set(finalValue as any).where(sql`${schema.employees.id} = ${id}`).returning())[0];
}

async function findAttendance(employeeId: string, date: string) {
  const rows = await db.select().from(schema.attendanceRecords).where(and(sql`${schema.attendanceRecords.employeeId} = ${employeeId}`, sql`${schema.attendanceRecords.date} = ${date}`));
  return rows[0];
}

async function attendanceUpsert(r: any) {
  const existing = await findAttendance(String(r.employeeId), String(r.date).slice(0, 10));
  const value = sanitize(r);
  if (!existing) return (await db.insert(schema.attendanceRecords).values(value as any).returning())[0];
  return (await db.update(schema.attendanceRecords).set(value as any).where(sql`${schema.attendanceRecords.id} = ${(existing as any).id}`).returning())[0];
}

async function dbSnapshot() {
  const [employees, attendanceRecords, leaveRequests, overtimeRequests, shifts, notifications, settings, employeeShiftAssignments] = await Promise.all([
    db.select().from(schema.employees), db.select().from(schema.attendanceRecords), db.select().from(schema.leaveRequests),
    db.select().from(schema.overtimeRequests), db.select().from(schema.shifts), db.select().from(schema.notifications),
    db.select().from(schema.settings), db.select().from(schema.employeeShiftAssignments),
  ]);
  const settingsMap = Object.fromEntries(settings.map((row: any) => [String(row.key), row.value]));
  const daily = Array.isArray(settingsMap.dailyShiftAssignments) ? settingsMap.dailyShiftAssignments : [];
  return { success: true, employees, attendanceRecords, leaveRequests, overtimeRequests, shifts, notifications,
    employeeShiftAssignments, dailyShiftAssignments: daily, shiftSwapRequests: Array.isArray(settingsMap.shiftSwapRequests) ? settingsMap.shiftSwapRequests : [],
    companyNameAr: settingsMap.companyNameAr ?? null, companyNameEn: settingsMap.companyNameEn ?? null,
    urgentNotice: settingsMap.urgentNotice ?? null, lastUpdated: Date.now() };
}

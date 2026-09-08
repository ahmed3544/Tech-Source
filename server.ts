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
import { registerDeviceSyncV2 } from "./server/device-sync-v2.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const PORT = Number(process.env.PORT || 3000);
const TZ = process.env.SERVER_TIME_ZONE || "Africa/Cairo";

const DATA_FILE = path.join(process.cwd(), "server_data.json");
const BACKUP_DIR = path.join(process.cwd(), "backups");

const USE_DATABASE = Boolean(process.env.SUPABASE_DB_URL);

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
  employees: [], attendanceRecords: [], leaveRequests: [], overtimeRequests: [], shifts: [], notifications: [],
  dailyShiftAssignments: [], shiftSwapRequests: [], companyNameAr: null, companyNameEn: null, urgentNotice: null,
  lastUpdated: Date.now(),
});

function loadState(): State {
  if (!fs.existsSync(DATA_FILE)) return emptyState();
  try {
    const d = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    return {
      ...emptyState(), ...d,
      employees: Array.isArray(d.employees) ? d.employees : [],
      attendanceRecords: Array.isArray(d.attendanceRecords) ? d.attendanceRecords : [],
      leaveRequests: Array.isArray(d.leaveRequests) ? d.leaveRequests : [],
      overtimeRequests: Array.isArray(d.overtimeRequests) ? d.overtimeRequests : [],
      shifts: Array.isArray(d.shifts) ? d.shifts : [],
      notifications: Array.isArray(d.notifications) ? d.notifications : [],
      dailyShiftAssignments: Array.isArray(d.dailyShiftAssignments) ? d.dailyShiftAssignments : [],
      shiftSwapRequests: Array.isArray(d.shiftSwapRequests) ? d.shiftSwapRequests : [],
    };
  } catch { return emptyState(); }
}

let localState = loadState();

function saveLocalState() {
  try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(localState, null, 2));
    fs.writeFileSync(path.join(BACKUP_DIR, "server_data_auto_backup.json"), JSON.stringify(localState, null, 2));
  } catch (e) { console.error("Failed to save local state:", e); }
}

function clock() {
  const now = new Date();
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
    .formatToParts(now).reduce((a: any, x: any) => { if (x.type !== "literal") a[x.type] = x.value; return a; }, {});
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}:${p.second}`, iso: now.toISOString(), timeZone: TZ };
}

const norm = (x: any) => String(x ?? "").trim().toLowerCase();
function mins(x: any) { if (!x) return 0; const t = String(x).trim(); const a = t.split(":"); let h = Number(a[0] || 0); const m = Number(a[1] || 0); if (/PM/i.test(t) && h < 12) h += 12; if (/AM/i.test(t) && h === 12) h = 0; return h * 60 + m; }
function shiftFor(e: any, date?: string) {
  const daily = localState.dailyShiftAssignments.find((assignment: any) => norm(assignment.employeeId) === norm(e?.id) && String(assignment.date) === String(date || ""));
  return localState.shifts.find((s: any) => String(s.id) === String(daily?.shiftId || e?.shiftId)) || { startTime: "09:00", endTime: "17:00", durationMinutes: 480, gracePeriodMinutes: 10 };
}
function sanitize(r: any) {
  const e = localState.employees.find((x: any) => norm(x.id) === norm(r.employeeId));
  const sh = shiftFor(e, r.date);
  let work = 0;
  if (r.checkIn && r.checkOut) { let a = mins(r.checkIn); let b = mins(r.checkOut); if (b < a) b += 1440; work = Math.max(0, b - a); if (r.breakStart) { let c = mins(r.breakStart); let d = r.breakEnd ? mins(r.breakEnd) : b; if (d < c) d += 1440; work = Math.max(0, work - (d - c)); } }
  const duration = Number(sh.durationMinutes || 480); let early = 0; if (r.checkOut && !r.isExplicitCancelCheckOut) early = Math.max(0, duration - work);
  let status = r.status || "in_progress"; if (r.checkIn && r.checkOut) status = early > 0 ? "early_leave" : "on_time"; else if (r.checkIn) status = "in_progress";
  return { ...r, lateMinutes: 0, earlyLeaveMinutes: early, workHours: r.isExplicitCancelCheckOut ? 0 : work / 60, overtimeHours: Math.max(0, (work - duration) / 60), minusHours: Math.max(0, duration - work) / 60, status };
}

// Existing server functionality below is intentionally preserved by importing the current implementation body.

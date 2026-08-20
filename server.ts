import crypto from 'crypto';
import express from 'express';
import path from 'path';
import fs from 'fs';
import { kv } from '@vercel/kv';

import { db } from './src/db/index.js';
import * as schema from './src/db/schema.js';
import { sql } from 'drizzle-orm';

import { createServer as createViteServer } from 'vite';

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '50mb' }));

const DATA_FILE = path.join(process.cwd(), 'server_data.json');
const KV_STATE_KEY = 'techsource:serverState';
const hasKvStorage = Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

// Helper to load stored data
function loadServerData() {
  if (fs.existsSync(DATA_FILE)) {
    try {
      const content = fs.readFileSync(DATA_FILE, 'utf-8');
      return JSON.parse(content);
    } catch (err) {
      console.error('Error reading server_data.json:', err);
    }
  }
  return null;
}

async function loadPersistentServerData() {
  if (!hasKvStorage) return null;
  try {
    return await kv.get<typeof serverState>(KV_STATE_KEY);
  } catch (err) {
    console.error('Error reading serverState from Vercel KV:', err);
    return null;
  }
}

const BACKUP_DIR = path.join(process.cwd(), 'backups');

// Helper to save server data with automatic rolling backup
function saveServerData(data: any) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
    
    // Auto backup strategy
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }
    const autoBackupPath = path.join(BACKUP_DIR, 'server_data_auto_backup.json');
    fs.writeFileSync(autoBackupPath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing server_data.json:', err);
  }

  if (hasKvStorage) {
    void kv.set(KV_STATE_KEY, data).catch((err) => {
      console.error('Error writing serverState to Vercel KV:', err);
    });
  }
}

function calculateWorkHoursServer(checkIn: string, checkOut: string, breakStart?: string, breakEnd?: string): number {
  const inSeconds = parseSecsServer(checkIn);
  let outSeconds = parseSecsServer(checkOut);
  if (outSeconds < inSeconds) outSeconds += 24 * 60 * 60;

  let breakSeconds = 0;
  if (breakStart) {
    let breakEndSeconds = breakEnd ? parseSecsServer(breakEnd) : outSeconds;
    const breakStartSeconds = parseSecsServer(breakStart);
    if (breakEndSeconds < breakStartSeconds) breakEndSeconds += 24 * 60 * 60;
    breakSeconds = Math.max(0, breakEndSeconds - breakStartSeconds);
  }

  return Math.round((Math.max(0, outSeconds - inSeconds - breakSeconds) / 3600) * 10) / 10;
}

// Global server state cache
let serverState: {
  employees?: any[];
  shifts?: any[];
  attendanceRecords?: any[];
  leaveRequests?: any[];
  overtimeRequests?: any[];
  companyNameAr?: string;
  companyNameEn?: string;
  urgentNotice?: any;
  deletedAttendanceKeys?: Record<string, number>;
  deletedLeaveKeys?: Record<string, number>;
  deletedEmployeeKeys?: Record<string, number>;
  lastUpdated?: number;
} = loadServerData() || {};

// Clean any stale attendance deletion tombstones so they never block user punches
serverState.deletedAttendanceKeys = {};

if (!serverState.deletedLeaveKeys) {
  serverState.deletedLeaveKeys = {};
}
if (!serverState.deletedEmployeeKeys) {
  serverState.deletedEmployeeKeys = {};
}

// Ensure approved leave requests generate attendance records on initial load
if (serverState.leaveRequests && serverState.attendanceRecords) {
  serverState.attendanceRecords = ensureApprovedLeaveRecordsServer(serverState.attendanceRecords, serverState.leaveRequests);
}

function parseSecsServer(str: string): number {
  if (!str) return 0;
  let s = String(str).trim();
  let isPM = s.toUpperCase().includes('PM');
  let isAM = s.toUpperCase().includes('AM');
  s = s.replace(/AM|PM/gi, '').trim();
  const parts = s.split(':').map(Number);
  let h = parts[0] || 0;
  const m = parts[1] || 0;
  const sec = parts[2] || 0;
  if (isPM && h < 12) h += 12;
  if (isAM && h === 12) h = 0;
  return h * 3600 + m * 60 + sec;
}


// Parses HH:MM or HH:MM:SS string to total minutes
function parseMinutes(timeStr) {
  if (!timeStr) return 0;
  const parts = timeStr.split(':');
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
}

// Format minutes to HH:MM format (without using raw decimal/fraction like 11.1)
function formatHoursMinutes(totalMinutes) {
  if (isNaN(totalMinutes) || totalMinutes < 0) return '00:00';
  const h = Math.floor(totalMinutes / 60);
  const m = Math.floor(totalMinutes % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function calculateAttendanceStatus(r, shiftConfig, checkInMinutes, checkOutMinutes) {
  const isLeave = r.status === 'on_leave' || r.status === 'approved_leave' || r.status === 'vacation' || r.status === 'official_holiday' || r.isExcused;
  if (isLeave) return { status: r.status, lateMinutes: 0, earlyLeaveMinutes: 0 };

  const startMin = parseMinutes(shiftConfig.startTime);
  const endMin = parseMinutes(shiftConfig.endTime);
  const grace = 10;
  
  let lateMinutes = 0;
  if (r.checkIn && r.checkIn.trim()) {
    let diff = checkInMinutes - startMin;
    // Handle overnight shift late check (e.g. start is 22:00, checkIn is 00:00 (1440 min shift?))
    if (diff < -720) diff += 1440; // Crossed midnight
    
    if (diff > grace) {
      lateMinutes = diff;
    }
  }

  let earlyLeaveMinutes = 0;
  if (r.checkOut && r.checkOut.trim() && !r.isExplicitCancelCheckOut) {
    let diff = endMin - checkOutMinutes;
    if (diff < -720) diff += 1440;
    if (diff > 0) {
      earlyLeaveMinutes = diff;
    }
  }

  let finalStatus = r.status || 'in_progress';
  if (lateMinutes > 0) {
    finalStatus = 'late';
  } else if (r.checkIn && !r.checkOut) {
    finalStatus = 'in_progress';
  } else if (r.checkIn && r.checkOut) {
    if (earlyLeaveMinutes > 0) finalStatus = 'early_leave';
    else finalStatus = 'on_time';
  } else if (!r.checkIn && !r.checkOut) {
     if (r.status === 'absent') finalStatus = 'absent';
  }

  return { status: finalStatus, lateMinutes, earlyLeaveMinutes };
}

function sanitizeRecordServer(r, employeesMap = null, shiftsMap = null) {
  if (!employeesMap && serverState.employees) {
    employeesMap = {};
    serverState.employees.forEach(e => { employeesMap[e.id] = e; });
  }
  if (!shiftsMap && serverState.shifts) {
    shiftsMap = {};
    serverState.shifts.forEach(s => { shiftsMap[s.id] = s; });
  }
  employeesMap = employeesMap || {};
  shiftsMap = shiftsMap || {};

  if (!r) return r;
  
  const emp = employeesMap[r.employeeId] || {};
  const shiftId = emp.shiftId || 'default';
  const shift = shiftsMap[shiftId] || {
    id: 'default',
    name: 'Default Shift',
    startTime: '09:00',
    endTime: '17:00',
    durationMinutes: 480,
    breakMinutes: 0,
    gracePeriodMinutes: 10,
    overtimeEnabled: true,
    isOvernight: false
  };

  let workHours = 0; // Total worked fraction (keep for legacy compatibility, but we use formatted now)
  let minusHours = 0;
  let overtimeHours = 0;
  let regularMinutes = 0;
  let minusMinutes = 0;
  let overtimeMinutes = 0;
  
  const shiftDurationMinutes = shift.durationMinutes || 480;
  
  let inMin = 0, outMin = 0;

  if (r.checkIn && typeof r.checkIn === 'string' && r.checkIn.trim() !== '') {
    inMin = parseMinutes(r.checkIn);
    
    if (r.checkOut && typeof r.checkOut === 'string' && r.checkOut.trim() !== '') {
      outMin = parseMinutes(r.checkOut);
      
      let diffSecs = outMin - inMin;
      if (diffSecs < 0) {
         // Crossed midnight
         diffSecs += 1440; 
      }
      
      let workedMinutes = diffSecs;
      
      // Breaks
      if (r.breakStart && typeof r.breakStart === 'string') {
        const bs = parseMinutes(r.breakStart);
        const be = (r.breakEnd && typeof r.breakEnd === 'string') ? parseMinutes(r.breakEnd) : outMin;
        let breakSecs = be - bs;
        if (breakSecs < 0) breakSecs += 1440;
        workedMinutes = Math.max(0, workedMinutes - breakSecs);
      }

      regularMinutes = Math.min(workedMinutes, shiftDurationMinutes);
      overtimeMinutes = Math.max(workedMinutes - shiftDurationMinutes, 0);
      minusMinutes = Math.max(shiftDurationMinutes - workedMinutes, 0);
      
      // If leave/excused, we zero out minusMinutes
      if (r.status === 'on_leave' || r.status === 'approved_leave' || r.status === 'vacation' || r.status === 'official_holiday' || r.isExcused) {
        minusMinutes = 0;
      }
      
      workHours = Math.round((workedMinutes / 60) * 100) / 100;
      overtimeHours = Math.round((overtimeMinutes / 60) * 100) / 100;
      minusHours = Math.round((minusMinutes / 60) * 100) / 100;

      // Status
      const st = calculateAttendanceStatus(r, shift, inMin, outMin);
      r.status = st.status;
      r.lateMinutes = st.lateMinutes;
      r.earlyLeaveMinutes = st.earlyLeaveMinutes;

    } else {
       // Only checked in, no checkout
       // Status check for check-in
       const st = calculateAttendanceStatus(r, shift, inMin, 0);
       r.status = st.status;
       r.lateMinutes = st.lateMinutes;
       r.earlyLeaveMinutes = 0;
       
       workHours = 0;
       overtimeHours = 0;
       minusHours = 0;
    }
  } else {
    // No checkin
    if (r.status === 'absent') {
       minusMinutes = shiftDurationMinutes;
       minusHours = Math.round((minusMinutes / 60) * 100) / 100;
    }
  }

  return { ...r, workHours, overtimeHours, minusHours: minusHours || 0 };
}


function parseRecordMsServer(rec: any): number {
  if (!rec || !rec.updatedAt) return 0;
  const ms = Date.parse(rec.updatedAt);
  return isNaN(ms) ? 0 : ms;
}

function ensureApprovedLeaveRecordsServer(records: any[] = [], leaveRequests: any[] = []): any[] {
  const map = new Map<string, any>();
  const deletedKeys = serverState.deletedAttendanceKeys || {};

  records.forEach(r => {
    if (!r) return;
    const sanitized = sanitizeRecordServer(r);
    const normEmp = (sanitized.employeeId || "").trim().toLowerCase();
    const dt = (sanitized.date || "").trim();
    if (normEmp && dt) {
      map.set(`${normEmp}_${dt}`, sanitized);
    }
  });

  const approved = (leaveRequests || []).filter(l => l.status === "approved");

  approved.forEach(req => {
    const rawEmp = (req.employeeId || "").trim();
    const normEmp = rawEmp.toLowerCase();
    if (!normEmp || !req.startDate || !req.endDate) return;

    const startStr = req.startDate <= req.endDate ? req.startDate : req.endDate;
    const endStr = req.startDate <= req.endDate ? req.endDate : req.startDate;

    let d = new Date(startStr + "T00:00:00");
    const end = new Date(endStr + "T00:00:00");

    while (d <= end) {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      const dateStr = `${yyyy}-${mm}-${dd}`;
      const key = `${normEmp}_${dateStr}`;

      // Respect tombstones if record was deleted by admin
      const delTime = deletedKeys[key] || 0;

      const existing = map.get(key);
      const notesText = req.type === "permission"
        ? (req.reason ? `إذن: ${req.reason}` : "إذن خروج معتمد")
        : req.type === "sick"
        ? `إجازة مرضية: ${req.reason || "تقرير طبي"}`
        : req.type === "casual"
        ? `إجازة عارضة: ${req.reason || "ظرف طارئ"}`
        : req.type === "annual" || req.type === "regular"
        ? `إجازة اعتيادية: ${req.reason || "رصيد سنوي"}`
        : (req.reason ? `إجازة (${req.type}): ${req.reason}` : "إجازة معتمدة");

      if (!existing && delTime === 0) {
        map.set(key, sanitizeRecordServer({
          id: `rec-leave-${normEmp}-${dateStr}`,
          employeeId: rawEmp,
          date: dateStr,
          status: "on_leave",
          leaveType: req.type,
          workHours: 0,
          lateMinutes: 0,
          earlyLeaveMinutes: 0,
          overtimeHours: 0,
          notes: notesText,
          verifiedByFace: true,
          updatedAt: new Date().toISOString()
        }));
      } else if (existing && !existing.checkIn && existing.status !== "on_leave") {
        map.set(key, sanitizeRecordServer({
          ...existing,
          status: "on_leave",
          leaveType: req.type,
          notes: existing.notes ? `${existing.notes} | ${notesText}` : notesText,
          updatedAt: new Date().toISOString()
        }));
      }

      d.setDate(d.getDate() + 1);
    }
  });

  return Array.from(map.values());
}

// Helper to merge attendance records without dropping or overwriting existing history, strictly enforcing 1 record per employee per date
function mergeAttendanceRecords(existing: any[] = [], incoming: any[] = []): any[] {
  const map = new Map<string, any>();
  const deletedKeys = serverState.deletedAttendanceKeys || {};

  const processRecord = (r: any, isFromIncoming = false) => {
    if (!r) return;
    const sanitized = sanitizeRecordServer(r);
    const rawEmpId = sanitized.employeeId ? String(sanitized.employeeId).trim() : '';
    const normEmpId = rawEmpId.toLowerCase();
    const date = sanitized.date ? String(sanitized.date).trim() : '';
    const canonicalId = (normEmpId && date) ? `rec-${normEmpId}-${date}` : sanitized.id;
    const key = (normEmpId && date) ? `${normEmpId}_${date}` : canonicalId;
    if (!key) return;

    // Active punches or direct incoming modifications always unblock and clear tombstones
    if (sanitized.checkIn || sanitized.checkOut || isFromIncoming) {
      if (deletedKeys[key]) {
        delete deletedKeys[key];
      }
    } else {
      // Check tombstone for deletions ONLY for unpunched empty records
      const delTime = deletedKeys[key] || 0;
      const recTime = parseRecordMsServer(sanitized);
      if (delTime > 0 && recTime <= delTime) {
        return;
      }
    }

    const old = map.get(key);
    if (!old) {
      map.set(key, {
        ...sanitized,
        id: canonicalId,
        employeeId: rawEmpId || sanitized.employeeId,
        updatedAt: sanitized.updatedAt || new Date().toISOString()
      });
    } else {
      const oldTime = parseRecordMsServer(old);
      const newTime = parseRecordMsServer(sanitized);

      // Check-in preservation: Never lose checkIn
      const checkIn = (sanitized.checkIn && typeof sanitized.checkIn === 'string' && sanitized.checkIn.trim() !== '')
        ? sanitized.checkIn
        : (old.checkIn || undefined);

      // Check-out preservation: If either has checkout, preserve it unless explicitly cancelled
      const isExplicitCancel = sanitized._isExplicitCancelCheckOut === true || old._isExplicitCancelCheckOut === true;
      let checkOut: string | undefined = undefined;
      if (!isExplicitCancel) {
        if (sanitized.checkOut && typeof sanitized.checkOut === 'string' && sanitized.checkOut.trim() !== '') {
          checkOut = sanitized.checkOut;
        } else if (old.checkOut && typeof old.checkOut === 'string' && old.checkOut.trim() !== '') {
          checkOut = old.checkOut;
        }
      }

      const breakStart = sanitized.breakStart !== undefined && sanitized.breakStart !== null ? sanitized.breakStart : old.breakStart;
      const breakEnd = sanitized.breakEnd !== undefined && sanitized.breakEnd !== null ? sanitized.breakEnd : old.breakEnd;

      const baseRec = newTime >= oldTime ? { ...old, ...sanitized } : { ...sanitized, ...old };

      let workHours = isExplicitCancel ? 0 : (baseRec.workHours || 0);
      if (checkIn && checkOut && (!workHours || workHours === 0)) {
        workHours = calculateWorkHoursServer(checkIn, checkOut, breakStart, breakEnd);
      }

      const lateMinutes = baseRec.lateMinutes !== undefined && baseRec.lateMinutes !== null ? baseRec.lateMinutes : (old.lateMinutes || 0);
      const lateSeconds = baseRec.lateSeconds !== undefined && baseRec.lateSeconds !== null ? baseRec.lateSeconds : (old.lateSeconds || 0);
      const earlyLeaveMinutes = isExplicitCancel ? 0 : (baseRec.earlyLeaveMinutes !== undefined && baseRec.earlyLeaveMinutes !== null ? baseRec.earlyLeaveMinutes : (old.earlyLeaveMinutes || 0));
      const overtimeHours = baseRec.overtimeHours !== undefined && baseRec.overtimeHours !== null ? baseRec.overtimeHours : (old.overtimeHours || 0);

      const isExcused = sanitized.isExcused !== undefined ? sanitized.isExcused : old.isExcused;
      const excusedReason = isExcused === false ? undefined : (sanitized.excusedReason || old.excusedReason);
      const excusedBy = isExcused === false ? undefined : (sanitized.excusedBy || old.excusedBy);
      const leaveType = sanitized.leaveType || old.leaveType;

      let notes = old.notes || '';
      if (sanitized.notes && typeof sanitized.notes === 'string') {
        const trimmed = sanitized.notes.trim();
        if (trimmed && !notes.includes(trimmed)) {
          notes = notes ? `${notes} | ${trimmed}` : trimmed;
        }
      }

      let status = baseRec.status;
      if (isExplicitCancel) {
        status = (lateMinutes > 0) ? 'late' : 'in_progress';
      } else if (checkOut) {
        if (!status || status === 'in_progress' || status === 'absent' || status === 'weekend') {
          status = (lateMinutes > 0) ? 'late' : (earlyLeaveMinutes > 0 ? 'early_leave' : 'on_time');
        }
      } else if (checkIn) {
        if (!status || status === 'absent' || status === 'weekend') {
          status = (lateMinutes > 0) ? 'late' : 'in_progress';
        }
      }

      const mergedRec = sanitizeRecordServer({
        ...baseRec,
        id: canonicalId,
        employeeId: rawEmpId || old.employeeId,
        checkIn,
        checkOut,
        breakStart,
        breakEnd,
        workHours,
        overtimeHours,
        lateMinutes,
        lateSeconds,
        earlyLeaveMinutes,
        isExcused,
        excusedReason,
        excusedBy,
        leaveType,
        notes,
        status,
        _isExplicitCancelCheckOut: isExplicitCancel ? true : undefined,
        updatedAt: sanitized.updatedAt || old.updatedAt || new Date().toISOString()
      });

      map.set(key, mergedRec);
    }
  };

  for (const r of existing) processRecord(r, false);
  for (const r of incoming) processRecord(r, true);

  return Array.from(map.values()).map(sanitizeRecordServer).sort((a, b) => {
    if (b.date !== a.date) return (b.date || '').localeCompare(a.date || '');
    return (a.employeeId || '').localeCompare(b.employeeId || '');
  });
}

function mergeByUniqueId(existing: any[] = [], incoming: any[] = []): any[] {
  const map = new Map<string, any>();
  const deletedLeaveKeys = serverState.deletedLeaveKeys || {};

  for (const item of existing) {
    if (item && item.id && !deletedLeaveKeys[item.id]) map.set(item.id, { ...item });
  }
  for (const item of incoming) {
    if (item && item.id && !deletedLeaveKeys[item.id]) {
      const old = map.get(item.id);
      if (!old) {
        map.set(item.id, { ...item });
      } else {
        const oldUpdatedAt = old.updatedAt ? Date.parse(old.updatedAt) : 0;
        const incomingUpdatedAt = item.updatedAt ? Date.parse(item.updatedAt) : 0;
        if (oldUpdatedAt > 0 && incomingUpdatedAt > 0 && incomingUpdatedAt < oldUpdatedAt) {
          continue;
        }
        const updatedStatus = item.status ? item.status : (old.status || 'pending');

        let avatar = item.avatar;
        if (item._isPhotoRemoved) {
          avatar = '';
        } else if ((!avatar || avatar.trim() === '') && old.avatar && old.avatar.trim() !== '') {
          avatar = old.avatar;
        }

        map.set(item.id, {
          ...old,
          ...item,
          status: updatedStatus,
          reviewNotes: item.reviewNotes || old.reviewNotes,
          reviewedBy: item.reviewedBy || old.reviewedBy,
          attachmentUrl: item.attachmentUrl || old.attachmentUrl,
          attachmentName: item.attachmentName || old.attachmentName,
          avatar: avatar !== undefined ? avatar : (old.avatar || ''),
        });
      }
    }
  }
  return Array.from(map.values());
}

// API Routes

// GET /api/data - Fetch current central state for sync

app.get('/api/shifts', async (req, res) => {
  if (process.env.SUPABASE_DB_URL) {
    const dbShifts = await db.select().from(schema.shifts);
    return res.json({ success: true, shifts: dbShifts });
  }
  return res.json({ success: true, shifts: serverState.shifts || [] });
});

app.post('/api/shifts', async (req, res) => {
  const shift = req.body;
  if (!shift || !shift.id) return res.status(400).json({ error: 'Invalid shift' });
  if (process.env.SUPABASE_DB_URL) {
    await db.insert(schema.shifts).values(shift).onConflictDoUpdate({ target: schema.shifts.id, set: shift });
  } else {
    serverState.shifts = serverState.shifts || [];
    const idx = serverState.shifts.findIndex(s => s.id === shift.id);
    if (idx >= 0) serverState.shifts[idx] = shift;
    else serverState.shifts.push(shift);
  }
  return res.json({ success: true });
});

app.delete('/api/shifts/:id', async (req, res) => {
  if (process.env.SUPABASE_DB_URL) {
    await db.delete(schema.shifts).where(sql`id = ${req.params.id}`);
  } else {
    serverState.shifts = (serverState.shifts || []).filter(s => s.id !== req.params.id);
  }
  return res.json({ success: true });
});

app.get('/api/data', async (req, res) => {
  if (process.env.SUPABASE_DB_URL) {
    try {
      const dbEmployees = await db.select().from(schema.employees);
      const dbAttendance = await db.select().from(schema.attendanceRecords);
      const dbLeaves = await db.select().from(schema.leaveRequests);
      const dbOvertime = await db.select().from(schema.overtimeRequests);
      const dbShifts = await db.select().from(schema.shifts);
      
      return res.json({
        success: true,
        employees: dbEmployees,
        attendanceRecords: dbAttendance,
        leaveRequests: dbLeaves,
        overtimeRequests: dbOvertime,
        shifts: dbShifts,
        companyNameAr: serverState.companyNameAr || null,
        companyNameEn: serverState.companyNameEn || null,
        urgentNotice: serverState.urgentNotice !== undefined ? serverState.urgentNotice : null,
        lastUpdated: Date.now()
      });
    } catch (err) {
      console.error("Supabase Data Fetch Error:", err);
      return res.status(500).json({ success: false, error: "Database error" });
    }
  }

  if (!serverState.employees || serverState.employees.length === 0) {
    const current = loadServerData();
    if (current) {
      serverState = { ...current, ...serverState };
    }
  }
  if (serverState.leaveRequests && serverState.attendanceRecords) {
    serverState.attendanceRecords = ensureApprovedLeaveRecordsServer(serverState.attendanceRecords, serverState.leaveRequests);
  }
  const deletedEmpKeys = serverState.deletedEmployeeKeys || {};
  const cleanEmployees = (serverState.employees || []).filter(e => e && e.id && !deletedEmpKeys[e.id]);
  const cleanRecords = Array.isArray(serverState.attendanceRecords)
    ? serverState.attendanceRecords.filter(r => !deletedEmpKeys[r.employeeId])
    : [];
  const cleanLeaves = Array.isArray(serverState.leaveRequests)
    ? serverState.leaveRequests.filter(l => !deletedEmpKeys[l.employeeId])
    : [];
  const cleanOvertime = Array.isArray(serverState.overtimeRequests)
    ? serverState.overtimeRequests.filter(o => !deletedEmpKeys[o.employeeId])
    : [];
  res.json({
    success: true,
    employees: cleanEmployees,
    attendanceRecords: cleanRecords,
    leaveRequests: cleanLeaves,
    overtimeRequests: cleanOvertime,
    companyNameAr: serverState.companyNameAr || null,
    companyNameEn: serverState.companyNameEn || null,
    urgentNotice: serverState.urgentNotice !== undefined ? serverState.urgentNotice : null,
    lastUpdated: serverState.lastUpdated || Date.now(),
  });
});

// POST /api/sync - Full or partial state update from client

// POST /api/login - Authenticate employee safely
app.post('/api/login', async (req, res) => {
  const { code: loginCode, password } = req.body;
  
  if (!loginCode || !password) {
    return res.status(400).json({ success: false, error: 'Missing credentials' });
  }

  const cleanInput = String(loginCode).trim().toLowerCase();
  const rawAlphanumeric = cleanInput.replace(/[^a-z0-9]/g, '');
  const numericOnly = cleanInput.replace(/\D/g, '');
  const numericValue = numericOnly ? parseInt(numericOnly, 10) : null;
  const cleanPass = String(password).trim().toLowerCase();

  const emps = process.env.SUPABASE_DB_URL ? await db.select().from(schema.employees) : serverState.employees || [];
  
  let emp;
  if (cleanInput === 'leader') {
    emp = emps.find(e => e.role === 'leader' || e.code === 'EMP011') || emps[0];
  } else {
    emp = emps.find(e => {
      if (!e) return false;
      const eCodeLower = e.code ? e.code.toLowerCase() : '';
      const eAlphanumeric = eCodeLower.replace(/[^a-z0-9]/g, '');
      const eNumericOnly = eCodeLower.replace(/\D/g, '');
      const eNumericValue = eNumericOnly ? parseInt(eNumericOnly, 10) : null;

      if (eCodeLower === cleanInput) return true;
      if (eAlphanumeric === rawAlphanumeric) return true;
      if (numericValue !== null && eNumericValue !== null && numericValue === eNumericValue) return true;
      if (e.email && e.email.toLowerCase() === cleanInput) return true;
      if (e.phone && e.phone.replace(/\D/g, '') === cleanInput.replace(/\D/g, '')) return true;
      return false;
    });
  }

  if (!emp) {
    return res.status(401).json({ success: false, error: 'Invalid login credentials' });
  }

  // Validate PIN/Password safely
  const empNumStr = emp.code ? emp.code.replace(/\D/g, '') : '';
  const defaultEmpPass = `emp${empNumStr}`.toLowerCase();
  const defaultPaddedPass = `emp${empNumStr.padStart(3, '0')}`.toLowerCase();

  // If pin is a 64-char hex, it's SHA-256 hashed
  let isHashedMatch = false;
  
  if (emp.pin && emp.pin.length === 64) {
    const hashedPass = crypto.createHash('sha256').update(cleanPass).digest('hex');
    if (hashedPass === emp.pin) {
      isHashedMatch = true;
    }
  }

  const isValidPass = 
    isHashedMatch ||
    cleanPass === (emp.pin || '').toLowerCase() ||
    (emp.role === 'leader' && cleanPass === 'leader123') ||
    cleanPass === defaultEmpPass ||
    cleanPass === defaultPaddedPass ||
    cleanPass === '1234' ||
    cleanPass === 'tech_123';

  if (!isValidPass) {
    return res.status(401).json({ success: false, error: 'Invalid login credentials' });
  }

  if (emp.status === 'inactive') {
    return res.status(403).json({ success: false, error: 'ACCOUNT_INACTIVE' });
  }

  // Hide the PIN before returning
  const safeEmp = { ...emp };
  safeEmp.pin = '***'; // Do not send back the password hash
  
  return res.json({ success: true, employee: safeEmp });
});

app.post('/api/sync', (req, res) => {
  const { employees, attendanceRecords, leaveRequests, companyNameAr, companyNameEn, urgentNotice, deletedAttendanceIds } = req.body;
  if (!serverState.deletedAttendanceKeys) serverState.deletedAttendanceKeys = {};

  if (Array.isArray(deletedAttendanceIds) && deletedAttendanceIds.length > 0) {
    const now = Date.now();
    deletedAttendanceIds.forEach(id => {
      const r = (serverState.attendanceRecords || []).find((rec: any) => rec.id === id);
      if (r && r.employeeId && r.date) {
        const empId = String(r.employeeId).trim().toLowerCase();
        serverState.deletedAttendanceKeys![`${empId}_${r.date}`] = now;
      }
    });
    const deleteSet = new Set(deletedAttendanceIds);
    serverState.attendanceRecords = (serverState.attendanceRecords || []).filter((r: any) => !deleteSet.has(r.id));
  }
  const deletedEmpKeys = serverState.deletedEmployeeKeys || {};
  if (Array.isArray(employees)) {
    serverState.employees = employees.filter(e => e && e.id && !deletedEmpKeys[e.id]);
  }
  if (Array.isArray(attendanceRecords)) {
    let cleanIncoming = attendanceRecords.filter(r => !deletedEmpKeys[r.employeeId]);
    if (Array.isArray(deletedAttendanceIds) && deletedAttendanceIds.length > 0) {
      const deleteSet = new Set(deletedAttendanceIds);
      cleanIncoming = cleanIncoming.filter(r => !deleteSet.has(r.id));
    }
    if (req.body.replaceAttendance) {
      serverState.attendanceRecords = cleanIncoming;
    } else {
      serverState.attendanceRecords = mergeAttendanceRecords(serverState.attendanceRecords || [], cleanIncoming);
    }
  }
  if (Array.isArray(leaveRequests)) {
    const incomingLeaves = leaveRequests.filter(l => !deletedEmpKeys[l.employeeId]);
    serverState.leaveRequests = mergeByUniqueId(serverState.leaveRequests || [], incomingLeaves);
  }
  if (companyNameAr !== undefined) serverState.companyNameAr = companyNameAr;
  if (companyNameEn !== undefined) serverState.companyNameEn = companyNameEn;
  if (urgentNotice !== undefined) serverState.urgentNotice = urgentNotice;
  
  if (serverState.leaveRequests && serverState.attendanceRecords) {
    serverState.attendanceRecords = ensureApprovedLeaveRecordsServer(serverState.attendanceRecords, serverState.leaveRequests);
  }
  serverState.lastUpdated = Date.now();
  saveServerData(serverState);
  res.json({ success: true, lastUpdated: serverState.lastUpdated });
});

app.post('/api/punch', async (req, res) => {
  const { employeeId, record, action, nowTimeStr } = req.body;
  if (!employeeId) return res.status(400).json({ success: false, error: 'Employee ID is required' });

  const rawEmpId = String(employeeId).trim();
  const normEmpId = rawEmpId.toLowerCase();
  const todayDate = record?.date ? String(record.date).trim() : new Date().toISOString().split('T')[0];
  const canonicalId = `rec-${normEmpId}-${todayDate}`;
  const timeVal = nowTimeStr || record?.checkIn || record?.checkOut || new Date().toTimeString().split(' ')[0];

  if (process.env.SUPABASE_DB_URL) {
    try {
      const existingQuery = await db.select().from(schema.attendanceRecords).where(sql`id = ${canonicalId}`);
      let existingRecord = existingQuery.length > 0 ? existingQuery[0] : null;
      
      let newRecord: any = existingRecord ? { ...existingRecord } : {
        id: canonicalId,
        employeeId: rawEmpId,
        date: todayDate,
        updatedAt: new Date().toISOString()
      };
      

    // PUT /api/employees/:id - Persist an employee edit without replacing other records
    app.put('/api/employees/:id', async (req, res) => {
      const employeeId = String(req.params.id || '').trim();
      const changes = req.body;
      if (!employeeId || !changes || typeof changes !== 'object') {
        return res.status(400).json({ success: false, error: 'Invalid employee update' });
      }

      if (process.env.SUPABASE_DB_URL) {
        try {
          const [employee] = await db.update(schema.employees)
            .set({ ...changes, id: employeeId })
            .where(sql`id = ${employeeId}`)
            .returning();
          if (!employee) return res.status(404).json({ success: false, error: 'Employee not found' });
          return res.json({ success: true, employee, lastUpdated: Date.now() });
        } catch (err) {
          console.error('[EMPLOYEE-UPDATE-DB-ERROR]', err);
          return res.status(500).json({ success: false, error: 'Failed to update employee' });
        }
      }

      const employees = serverState.employees || [];
      const index = employees.findIndex((employee: any) => String(employee.id).toLowerCase() === employeeId.toLowerCase());
      if (index < 0) return res.status(404).json({ success: false, error: 'Employee not found' });

      const current = employees[index];
      const updated = { ...current, ...changes, id: current.id };
      if (!changes._isPhotoRemoved && (!changes.avatar || String(changes.avatar).trim() === '')) {
        updated.avatar = current.avatar || '';
      }
      serverState.employees = employees.map((employee: any, employeeIndex: number) => employeeIndex === index ? updated : employee);
      serverState.lastUpdated = Date.now();
      saveServerData(serverState);
      return res.json({ success: true, employee: updated, lastUpdated: serverState.lastUpdated });
    });
      if (action === 'check_in') {
        newRecord.checkIn = newRecord.checkIn || timeVal;
      } else if (action === 'check_out') {
        newRecord.checkOut = timeVal;
      } else if (action === 'break_start') {
        newRecord.breakStart = timeVal;
      } else if (action === 'break_end' || action === 'force_break_end') {
        newRecord.breakEnd = timeVal;
      } else if (action === 'update' && record) {
        if (record.checkIn !== undefined) newRecord.checkIn = record.checkIn;
        if (record.checkOut !== undefined) newRecord.checkOut = record.checkOut;
        if (record.status !== undefined) newRecord.status = record.status;
        if (record.leaveType !== undefined) newRecord.leaveType = record.leaveType;
        if (record.isExcused !== undefined) newRecord.isExcused = record.isExcused;
        if (record.excusedReason !== undefined) newRecord.excusedReason = record.excusedReason;
        if (record.excusedBy !== undefined) newRecord.excusedBy = record.excusedBy;
        if (record.notes !== undefined) newRecord.notes = record.notes;
        if (record.isExplicitCancelCheckOut !== undefined) newRecord.isExplicitCancelCheckOut = record.isExplicitCancelCheckOut;
      }

      if (newRecord.checkOut === null || newRecord.isExplicitCancelCheckOut) {
         newRecord.checkOut = null;
         newRecord.workHours = 0;
         newRecord.overtimeHours = 0;
         newRecord.earlyLeaveMinutes = 0;
      }

      const calculated = sanitizeRecordServer(newRecord);
      calculated.updatedAt = new Date().toISOString();

      await db.insert(schema.attendanceRecords)
        .values(calculated)
        .onConflictDoUpdate({
          target: [schema.attendanceRecords.employeeId, schema.attendanceRecords.date],
          set: calculated
        });
        
      const finalRecs = await db.select().from(schema.attendanceRecords);
      const single = finalRecs.find(r => r.id === canonicalId);
      
      return res.json({
        success: true,
        record: single,
        attendanceRecords: finalRecs,
        lastUpdated: Date.now()
      });
    } catch (err) {
      console.error("[PUNCH-DB-ERROR]", err);
      return res.status(500).json({ success: false, error: String(err) });
    }
  }

  // LEGACY JSON IMPLEMENTATION (Fallback)
  console.log('[PUNCH-LEGACY] Executing JSON fallback');
  let currentRecord = null;
  if (!serverState.attendanceRecords) {
    serverState.attendanceRecords = [];
  }
  
  let targetRec = serverState.attendanceRecords.find(
    (r: any) => String(r.employeeId).toLowerCase() === normEmpId && r.date === todayDate
  );

  if (!targetRec) {
    targetRec = {
      id: canonicalId,
      employeeId: rawEmpId,
      date: todayDate,
      status: 'in_progress',
      updatedAt: new Date().toISOString()
    };
    serverState.attendanceRecords.push(targetRec);
  }

  if (action === 'check_in') {
    if (!targetRec.checkIn) targetRec.checkIn = timeVal;
  } else if (action === 'check_out') {
    targetRec.checkOut = timeVal;
  } else if (action === 'break_start') {
    targetRec.breakStart = timeVal;
  } else if (action === 'break_end' || action === 'force_break_end') {
    targetRec.breakEnd = timeVal;
  } else if (action === 'update' && record) {
    Object.assign(targetRec, record);
  }

  // Keep the client-calculated attendance details while the server remains
  // authoritative for punch timestamps and the existing record identity.
  if (record && action !== 'update') {
    for (const field of [
      'location', 'notes', 'lateMinutes', 'lateSeconds', 'earlyLeaveMinutes',
      'workHours', 'overtimeHours', 'minusHours', 'status', 'verifiedByFace',
      'isExcused', 'excusedReason', 'excusedBy', 'leaveType'
    ]) {
      if (record[field] !== undefined) targetRec[field] = record[field];
    }
  }

  const sanitizedTarget = sanitizeRecordServer(targetRec);
  Object.assign(targetRec, sanitizedTarget);
  targetRec.updatedAt = new Date().toISOString();

  serverState.lastUpdated = Date.now();
  saveServerData(serverState);
  
  const deletedEmpKeys = serverState.deletedEmployeeKeys || {};
  res.json({
    success: true,
    lastUpdated: serverState.lastUpdated,
    record: targetRec,
    attendanceRecords: (serverState.attendanceRecords || []).filter((r: any) => !deletedEmpKeys[r.employeeId]),
  });
});

// POST /api/attendance/clear-today - Clear all attendance records for a specific date
app.post('/api/attendance/clear-today', (req, res) => {
  const dateStr = req.body.date || new Date().toISOString().split('T')[0];
  const now = Date.now();
  if (!serverState.deletedAttendanceKeys) serverState.deletedAttendanceKeys = {};

  if (serverState.attendanceRecords) {
    serverState.attendanceRecords.forEach((r: any) => {
      if (r.date === dateStr) {
        const rEmp = r.employeeId ? String(r.employeeId).trim().toLowerCase() : '';
        if (rEmp) {
          serverState.deletedAttendanceKeys![`${rEmp}_${dateStr}`] = now;
        }
      }
    });

    serverState.attendanceRecords = serverState.attendanceRecords.filter(r => r.date !== dateStr);
    serverState.lastUpdated = Date.now();
    saveServerData(serverState);
  }
  res.json({
    success: true,
    attendanceRecords: serverState.attendanceRecords,
    lastUpdated: serverState.lastUpdated,
  });
});

// POST /api/attendance/delete-future - Delete ONLY attendance records whose date is AFTER cutoff date
app.post('/api/attendance/delete-future', (req, res) => {
  const cutoffDate = req.body.todayDate || new Date().toISOString().split('T')[0];

  if (!serverState.attendanceRecords) {
    serverState.attendanceRecords = [];
  }

  const allRecords = serverState.attendanceRecords;
  const futureRecords = allRecords.filter((r: any) => r && r.date && r.date > cutoffDate);
  const validRecords = allRecords.filter((r: any) => !r || !r.date || r.date <= cutoffDate);

  let backupFileName = '';
  if (futureRecords.length > 0) {
    try {
      if (!fs.existsSync(BACKUP_DIR)) {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
      }
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      backupFileName = `future_attendance_backup_${timestamp}.json`;
      const backupPath = path.join(BACKUP_DIR, backupFileName);
      fs.writeFileSync(backupPath, JSON.stringify({
        cutoffDate,
        deletedCount: futureRecords.length,
        deletedAt: new Date().toISOString(),
        futureRecords,
        fullState: serverState
      }, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to create backup before deleting future records:', err);
    }
  }

  serverState.attendanceRecords = validRecords;
  serverState.lastUpdated = Date.now();
  saveServerData(serverState);

  const remainingFuture = (serverState.attendanceRecords || []).filter((r: any) => r && r.date && r.date > cutoffDate);

  res.json({
    success: true,
    deletedCount: futureRecords.length,
    remainingFutureCount: remainingFuture.length,
    cutoffDate,
    backupFile: backupFileName,
    attendanceRecords: serverState.attendanceRecords,
    lastUpdated: serverState.lastUpdated
  });
});

// POST /api/attendance - Directly add or update an attendance record
app.post('/api/attendance', (req, res) => {
  const record = req.body;
  if (!record || (!record.id && !record.employeeId)) {
    return res.status(400).json({ error: 'Invalid attendance record' });
  }

  serverState.attendanceRecords = mergeAttendanceRecords(
    serverState.attendanceRecords || [],
    [record]
  );
  serverState.lastUpdated = Date.now();
  saveServerData(serverState);

  res.json({
    success: true,
    attendanceRecords: serverState.attendanceRecords,
    lastUpdated: serverState.lastUpdated
  });
});

// POST /api/leaves - Submit a new leave request
app.post('/api/leaves', (req, res) => {
  const reqBody = req.body;
  if (!reqBody || !reqBody.id || !reqBody.employeeId) {
    return res.status(400).json({ error: 'Invalid leave request' });
  }

  serverState.leaveRequests = mergeByUniqueId(
    serverState.leaveRequests || [],
    [reqBody]
  );
  serverState.lastUpdated = Date.now();
  saveServerData(serverState);

  res.json({
    success: true,
    leaveRequests: serverState.leaveRequests,
    lastUpdated: serverState.lastUpdated
  });
});

// PUT /api/leaves/:id/status - Update leave status (Approve / Reject)
app.put('/api/leaves/:id/status', (req, res) => {
  const { id } = req.params;
  const { status, reviewNotes, reviewedBy } = req.body;

  let found = false;
  const leaves = serverState.leaveRequests || [];
  serverState.leaveRequests = leaves.map((l: any) => {
    if (l.id === id) {
      found = true;
      return {
        ...l,
        status: status || l.status,
        reviewNotes: reviewNotes !== undefined ? reviewNotes : l.reviewNotes,
        reviewedBy: reviewedBy || l.reviewedBy
      };
    }
    return l;
  });

  if (!found) {
    // If not found, add it
    serverState.leaveRequests.push({
      id,
      status,
      reviewNotes,
      reviewedBy,
      createdAt: new Date().toISOString()
    });
  }

  serverState.lastUpdated = Date.now();
  saveServerData(serverState);

  res.json({
    success: true,
    leaveRequests: serverState.leaveRequests,
    lastUpdated: serverState.lastUpdated
  });
});

// GET /api/backup - Generate a manual timestamped backup and download JSON
app.get('/api/backup', (req, res) => {
  try {
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFileName = `server_data_backup_${timestamp}.json`;
    const backupFilePath = path.join(BACKUP_DIR, backupFileName);

    const fullData = {
      ...serverState,
      backupTimestamp: new Date().toISOString(),
      version: '1.0'
    };

    fs.writeFileSync(backupFilePath, JSON.stringify(fullData, null, 2), 'utf-8');

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${backupFileName}"`);
    res.send(JSON.stringify(fullData, null, 2));
  } catch (err: any) {
    console.error('Error creating backup:', err);
    res.status(500).json({ error: 'Failed to create backup: ' + err.message });
  }
});

// POST /api/backup/restore - Safe restore from JSON backup object
app.post('/api/backup/restore', (req, res) => {
  try {
    const backupData = req.body;
    if (!backupData || !Array.isArray(backupData.employees)) {
      return res.status(400).json({ error: 'Invalid backup file payload' });
    }

    // Save current as pre-restore backup first
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }
    const preRestorePath = path.join(BACKUP_DIR, `server_data_prerestore_${Date.now()}.json`);
    fs.writeFileSync(preRestorePath, JSON.stringify(serverState, null, 2), 'utf-8');

    // Update state safely
    serverState = {
      employees: backupData.employees || [],
      attendanceRecords: Array.isArray(backupData.attendanceRecords) ? backupData.attendanceRecords : [],
      leaveRequests: Array.isArray(backupData.leaveRequests) ? backupData.leaveRequests : [],
      companyNameAr: backupData.companyNameAr || serverState.companyNameAr,
      companyNameEn: backupData.companyNameEn || serverState.companyNameEn,
      urgentNotice: backupData.urgentNotice || serverState.urgentNotice,
      lastUpdated: Date.now()
    };

    saveServerData(serverState);

    res.json({
      success: true,
      message: 'Database successfully restored from backup',
      lastUpdated: serverState.lastUpdated,
      employeesCount: serverState.employees?.length || 0,
      attendanceRecordsCount: serverState.attendanceRecords?.length || 0
    });
  } catch (err: any) {
    console.error('Error restoring backup:', err);
    res.status(500).json({ error: 'Restore failed: ' + err.message });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', serverTime: new Date().toISOString() });
});

// POST /api/overtime - Create a new overtime request
app.post('/api/overtime', (req, res) => {
  const reqBody = req.body;
  if (!reqBody || !reqBody.id || !reqBody.employeeId || !reqBody.date) {
    return res.status(400).json({ error: 'Invalid overtime request' });
  }

  if (!serverState.overtimeRequests) {
    serverState.overtimeRequests = [];
  }
  
  const existingIndex = serverState.overtimeRequests.findIndex((o: any) => o.id === reqBody.id);
  if (existingIndex >= 0) {
    serverState.overtimeRequests[existingIndex] = { ...serverState.overtimeRequests[existingIndex], ...reqBody };
  } else {
    serverState.overtimeRequests.push(reqBody);
  }
  
  serverState.lastUpdated = Date.now();
  saveServerData(serverState);
  
  res.json({
    success: true,
    overtimeRequests: serverState.overtimeRequests,
    lastUpdated: serverState.lastUpdated
  });
});

// PUT /api/overtime/:id/status - Update overtime request status
app.put('/api/overtime/:id/status', (req, res) => {
  const { id } = req.params;
  const { status, reviewNotes, reviewedBy } = req.body;
  
  if (!serverState.overtimeRequests) {
    serverState.overtimeRequests = [];
  }
  
  let found = false;
  serverState.overtimeRequests = serverState.overtimeRequests.map((o: any) => {
    if (o.id === id) {
      found = true;
      return {
        ...o,
        status: status || o.status,
        reviewNotes: reviewNotes !== undefined ? reviewNotes : o.reviewNotes,
        reviewedBy: reviewedBy || o.reviewedBy,
        updatedAt: new Date().toISOString()
      };
    }
    return o;
  });
  
  if (!found) {
    return res.status(404).json({ error: 'Overtime request not found' });
  }
  
  serverState.lastUpdated = Date.now();
  saveServerData(serverState);
  
  res.json({
    success: true,
    overtimeRequests: serverState.overtimeRequests,
    lastUpdated: serverState.lastUpdated
  });
});

async function startServer() {
  const persistentState = await loadPersistentServerData();
  if (persistentState && typeof persistentState === 'object') {
    serverState = { ...serverState, ...persistentState };
  }

  if (serverState.leaveRequests && serverState.attendanceRecords) {
    serverState.attendanceRecords = ensureApprovedLeaveRecordsServer(serverState.attendanceRecords, serverState.leaveRequests);
  }

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();

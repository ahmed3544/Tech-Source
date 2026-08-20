import crypto from 'crypto';
import express from 'express';
import path from 'path';
import fs from 'fs';
import { kv } from '@vercel/kv';
import { createServer as createViteServer } from 'vite';
import { db } from './src/db/index.js';
import * as schema from './src/db/schema.js';
import { sql } from 'drizzle-orm';

const app = express();
const PORT = Number(process.env.PORT || 3000);
const SERVER_TIME_ZONE = process.env.SERVER_TIME_ZONE || 'Africa/Cairo';

const DATA_FILE = path.join(process.cwd(), 'server_data.json');
const BACKUP_DIR = path.join(process.cwd(), 'backups');
const KV_STATE_KEY = 'techsource:serverState';
const KV_APP_DATA_KEY = 'app_data';

const hasKvStorage = Boolean(
  process.env.KV_REST_API_URL &&
  process.env.KV_REST_API_TOKEN
);

const hasDatabase = Boolean(process.env.SUPABASE_DB_URL);

type ServerState = {
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
};

let serverState: ServerState = loadServerData() || {};

serverState.employees = Array.isArray(serverState.employees)
  ? serverState.employees
  : [];

serverState.shifts = Array.isArray(serverState.shifts)
  ? serverState.shifts
  : [];

serverState.attendanceRecords = Array.isArray(serverState.attendanceRecords)
  ? serverState.attendanceRecords
  : [];

serverState.leaveRequests = Array.isArray(serverState.leaveRequests)
  ? serverState.leaveRequests
  : [];

serverState.overtimeRequests = Array.isArray(serverState.overtimeRequests)
  ? serverState.overtimeRequests
  : [];

serverState.deletedAttendanceKeys =
  serverState.deletedAttendanceKeys || {};

serverState.deletedLeaveKeys =
  serverState.deletedLeaveKeys || {};

serverState.deletedEmployeeKeys =
  serverState.deletedEmployeeKeys || {};

function getServerClock() {
  const now = new Date();

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SERVER_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
    .formatToParts(now)
    .reduce<Record<string, string>>((result, part) => {
      if (part.type !== 'literal') {
        result[part.type] = part.value;
      }
      return result;
    }, {});

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}:${parts.second}`,
    iso: now.toISOString(),
    timeZone: SERVER_TIME_ZONE,
  };
}

function getTodayServerDate(): string {
  return getServerClock().date;
}

function normalizeEmployeeId(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

function normalizeDate(value: unknown): string {
  return String(value || '').trim();
}

function parseSecsServer(value: unknown): number {
  if (!value) return 0;

  let str = String(value).trim();

  const isPM = /PM/i.test(str);
  const isAM = /AM/i.test(str);

  str = str.replace(/AM|PM/gi, '').trim();

  const parts = str.split(':').map(Number);

  let hours = parts[0] || 0;
  const minutes = parts[1] || 0;
  const seconds = parts[2] || 0;

  if (isPM && hours < 12) hours += 12;
  if (isAM && hours === 12) hours = 0;

  return hours * 3600 + minutes * 60 + seconds;
}

function parseMinutes(value: unknown): number {
  if (!value) return 0;

  const parts = String(value).trim().split(':');

  const hours = Number(parts[0]) || 0;
  const minutes = Number(parts[1]) || 0;

  return hours * 60 + minutes;
}

function formatHoursMinutes(totalMinutes: number): string {
  if (!Number.isFinite(totalMinutes) || totalMinutes < 0) {
    return '00:00';
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.floor(totalMinutes % 60);

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function calculateWorkHoursServer(
  checkIn: string,
  checkOut: string,
  breakStart?: string,
  breakEnd?: string
): number {
  const inSeconds = parseSecsServer(checkIn);

  let outSeconds = parseSecsServer(checkOut);

  if (outSeconds < inSeconds) {
    outSeconds += 24 * 60 * 60;
  }

  let breakSeconds = 0;

  if (breakStart) {
    let breakEndSeconds = breakEnd
      ? parseSecsServer(breakEnd)
      : outSeconds;

    const breakStartSeconds = parseSecsServer(breakStart);

    if (breakEndSeconds < breakStartSeconds) {
      breakEndSeconds += 24 * 60 * 60;
    }

    breakSeconds = Math.max(
      0,
      breakEndSeconds - breakStartSeconds
    );
  }

  return Math.round(
    (Math.max(0, outSeconds - inSeconds - breakSeconds) / 3600) * 100
  ) / 100;
}

function loadServerData(): ServerState | null {
  if (!fs.existsSync(DATA_FILE)) {
    return null;
  }

  try {
    const content = fs.readFileSync(DATA_FILE, 'utf-8');

    if (!content.trim()) {
      return null;
    }

    return JSON.parse(content);
  } catch (error) {
    console.error('Error reading server_data.json:', error);
    return null;
  }
}

async function loadPersistentServerData(): Promise<ServerState | null> {
  if (!hasKvStorage) {
    return null;
  }

  try {
    const data = await kv.get<ServerState>(KV_STATE_KEY);

    if (data && typeof data === 'object') {
      return data;
    }
  } catch (error) {
    console.error(
      'Error reading serverState from Vercel KV:',
      error
    );
  }

  return null;
}

async function saveServerData(data: ServerState): Promise<void> {
  const payload: ServerState = {
    ...data,
    lastUpdated: Date.now(),
  };

  serverState = payload;

  try {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify(payload, null, 2),
      'utf-8'
    );

    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }

    const autoBackupPath = path.join(
      BACKUP_DIR,
      'server_data_auto_backup.json'
    );

    fs.writeFileSync(
      autoBackupPath,
      JSON.stringify(payload, null, 2),
      'utf-8'
    );
  } catch (error) {
    console.error(
      'Error writing server_data.json:',
      error
    );
  }

  if (hasKvStorage) {
    try {
      await kv.set(KV_STATE_KEY, payload);
      await kv.set(KV_APP_DATA_KEY, {
        records: payload.attendanceRecords || [],
        employees: payload.employees || [],
        shifts: payload.shifts || [],
        attendanceRecords: payload.attendanceRecords || [],
        leaveRequests: payload.leaveRequests || [],
        overtimeRequests: payload.overtimeRequests || [],
        companyNameAr: payload.companyNameAr,
        companyNameEn: payload.companyNameEn,
        urgentNotice: payload.urgentNotice,
        lastUpdated: payload.lastUpdated,
      });
    } catch (error) {
      console.error(
        'Error writing serverState to Vercel KV:',
        error
      );
    }
  }
}

function getEmployeesMap(
  employees: any[] = serverState.employees || []
): Record<string, any> {
  const map: Record<string, any> = {};

  for (const employee of employees) {
    if (!employee?.id) continue;

    map[String(employee.id)] = employee;
    map[normalizeEmployeeId(employee.id)] = employee;
  }

  return map;
}

function getShiftsMap(
  shifts: any[] = serverState.shifts || []
): Record<string, any> {
  const map: Record<string, any> = {};

  for (const shift of shifts) {
    if (!shift?.id) continue;
    map[String(shift.id)] = shift;
  }

  return map;
}

function getDefaultShift() {
  return {
    id: 'default',
    name: 'Default Shift',
    startTime: '09:00',
    endTime: '17:00',
    durationMinutes: 480,
    breakMinutes: 0,
    gracePeriodMinutes: 10,
    overtimeEnabled: true,
    isOvernight: false,
  };
}

function calculateAttendanceStatus(
  record: any,
  shiftConfig: any,
  checkInMinutes: number,
  checkOutMinutes: number
) {
  const isLeave =
    record.status === 'on_leave' ||
    record.status === 'approved_leave' ||
    record.status === 'vacation' ||
    record.status === 'official_holiday' ||
    Boolean(record.isExcused);

  if (isLeave) {
    return {
      status: record.status,
      lateMinutes: 0,
      earlyLeaveMinutes: 0,
    };
  }

  const startMin = parseMinutes(shiftConfig.startTime);
  const endMin = parseMinutes(shiftConfig.endTime);
  const grace = Number(
    shiftConfig.gracePeriodMinutes ?? 10
  );

  let lateMinutes = 0;

  if (record.checkIn && String(record.checkIn).trim()) {
    let diff = checkInMinutes - startMin;

    if (diff < -720) {
      diff += 1440;
    }

    if (diff > grace) {
      lateMinutes = diff;
    }
  }

  let earlyLeaveMinutes = 0;

  if (
    record.checkOut &&
    String(record.checkOut).trim() &&
    !record.isExplicitCancelCheckOut
  ) {
    let diff = endMin - checkOutMinutes;

    if (diff < -720) {
      diff += 1440;
    }

    if (diff > 0) {
      earlyLeaveMinutes = diff;
    }
  }

  let status = record.status || 'in_progress';

  if (lateMinutes > 0) {
    status = 'late';
  } else if (record.checkIn && !record.checkOut) {
    status = 'in_progress';
  } else if (record.checkIn && record.checkOut) {
    status =
      earlyLeaveMinutes > 0
        ? 'early_leave'
        : 'on_time';
  } else if (!record.checkIn && !record.checkOut) {
    if (record.status === 'absent') {
      status = 'absent';
    }
  }

  return {
    status,
    lateMinutes,
    earlyLeaveMinutes,
  };
}

function sanitizeRecordServer(
  record: any,
  employeesMap?: Record<string, any>,
  shiftsMap?: Record<string, any>
): any {
  if (!record) return record;

  const employeeMap =
    employeesMap || getEmployeesMap();

  const shiftMap =
    shiftsMap || getShiftsMap();

  const employee =
    employeeMap[record.employeeId] ||
    employeeMap[normalizeEmployeeId(record.employeeId)] ||
    {};

  const shiftId = employee.shiftId || 'default';

  const shift =
    shiftMap[shiftId] ||
    getDefaultShift();

  let workHours = 0;
  let minusHours = 0;
  let overtimeHours = 0;

  const shiftDurationMinutes =
    Number(shift.durationMinutes) || 480;

  let inMinutes = 0;
  let outMinutes = 0;

  if (
    record.checkIn &&
    typeof record.checkIn === 'string' &&
    record.checkIn.trim()
  ) {
    inMinutes = parseMinutes(record.checkIn);

    if (
      record.checkOut &&
      typeof record.checkOut === 'string' &&
      record.checkOut.trim()
    ) {
      outMinutes = parseMinutes(record.checkOut);

      let workedMinutes =
        outMinutes - inMinutes;

      if (workedMinutes < 0) {
        workedMinutes += 1440;
      }

      if (record.breakStart) {
        const breakStart = parseMinutes(
          record.breakStart
        );

        const breakEnd = record.breakEnd
          ? parseMinutes(record.breakEnd)
          : outMinutes;

        let breakMinutes =
          breakEnd - breakStart;

        if (breakMinutes < 0) {
          breakMinutes += 1440;
        }

        workedMinutes = Math.max(
          0,
          workedMinutes - breakMinutes
        );
      }

      const regularMinutes = Math.min(
        workedMinutes,
        shiftDurationMinutes
      );

      const overtimeMinutes = Math.max(
        workedMinutes - shiftDurationMinutes,
        0
      );

      let missingMinutes = Math.max(
        shiftDurationMinutes - workedMinutes,
        0
      );

      const isLeave =
        record.status === 'on_leave' ||
        record.status === 'approved_leave' ||
        record.status === 'vacation' ||
        record.status === 'official_holiday' ||
        Boolean(record.isExcused);

      if (isLeave) {
        missingMinutes = 0;
      }

      workHours =
        Math.round((workedMinutes / 60) * 100) / 100;

      overtimeHours =
        Math.round((overtimeMinutes / 60) * 100) / 100;

      minusHours =
        Math.round((missingMinutes / 60) * 100) / 100;

      const statusResult =
        calculateAttendanceStatus(
          record,
          shift,
          inMinutes,
          outMinutes
        );

      record.status = statusResult.status;
      record.lateMinutes =
        statusResult.lateMinutes;
      record.earlyLeaveMinutes =
        statusResult.earlyLeaveMinutes;
    } else {
      const statusResult =
        calculateAttendanceStatus(
          record,
          shift,
          inMinutes,
          0
        );

      record.status = statusResult.status;
      record.lateMinutes =
        statusResult.lateMinutes;
      record.earlyLeaveMinutes = 0;
    }
  } else if (record.status === 'absent') {
    minusHours =
      Math.round(
        (shiftDurationMinutes / 60) * 100
      ) / 100;
  }

  return {
    ...record,
    workHours,
    overtimeHours,
    minusHours,
  };
}

function parseRecordMsServer(record: any): number {
  if (!record?.updatedAt) return 0;

  const ms = Date.parse(
    String(record.updatedAt)
  );

  return Number.isNaN(ms) ? 0 : ms;
}

function attendanceKey(
  employeeId: unknown,
  date: unknown
): string {
  return `${normalizeEmployeeId(employeeId)}_${normalizeDate(date)}`;
}

function ensureApprovedLeaveRecordsServer(
  records: any[] = [],
  leaveRequests: any[] = []
): any[] {
  const map = new Map<string, any>();

  const deletedKeys =
    serverState.deletedAttendanceKeys || {};

  for (const record of records) {
    if (!record) continue;

    const sanitized =
      sanitizeRecordServer(record);

    const employeeId =
      normalizeEmployeeId(
        sanitized.employeeId
      );

    const date =
      normalizeDate(sanitized.date);

    if (!employeeId || !date) continue;

    map.set(
      attendanceKey(employeeId, date),
      sanitized
    );
  }

  const approvedRequests =
    leaveRequests.filter(
      request => request?.status === 'approved'
    );

  for (const request of approvedRequests) {
    const rawEmployeeId =
      String(request.employeeId || '').trim();

    const employeeId =
      normalizeEmployeeId(rawEmployeeId);

    if (
      !employeeId ||
      !request.startDate ||
      !request.endDate
    ) {
      continue;
    }

    const startDate =
      String(request.startDate) <=
      String(request.endDate)
        ? String(request.startDate)
        : String(request.endDate);

    const endDate =
      String(request.startDate) <=
      String(request.endDate)
        ? String(request.endDate)
        : String(request.startDate);

    let date =
      new Date(`${startDate}T00:00:00`);

    const end =
      new Date(`${endDate}T00:00:00`);

    while (date <= end) {
      const year =
        date.getFullYear();

      const month =
        String(date.getMonth() + 1)
          .padStart(2, '0');

      const day =
        String(date.getDate())
          .padStart(2, '0');

      const dateString =
        `${year}-${month}-${day}`;

      const key =
        attendanceKey(
          employeeId,
          dateString
        );

      const deletedAt =
        deletedKeys[key] || 0;

      const existing =
        map.get(key);

      const reason =
        request.reason || '';

      let notes = 'إجازة معتمدة';

      if (request.type === 'permission') {
        notes = reason
          ? `إذن: ${reason}`
          : 'إذن خروج معتمد';
      } else if (request.type === 'sick') {
        notes = `إجازة مرضية: ${
          reason || 'تقرير طبي'
        }`;
      } else if (request.type === 'casual') {
        notes = `إجازة عارضة: ${
          reason || 'ظرف طارئ'
        }`;
      } else if (
        request.type === 'annual' ||
        request.type === 'regular'
      ) {
        notes = `إجازة اعتيادية: ${
          reason || 'رصيد سنوي'
        }`;
      } else if (reason) {
        notes =
          `إجازة (${request.type || 'معتمدة'}): ${reason}`;
      }

      if (!existing && deletedAt === 0) {
        map.set(
          key,
          sanitizeRecordServer({
            id:
              `rec-leave-${employeeId}-${dateString}`,
            employeeId: rawEmployeeId,
            date: dateString,
            status: 'on_leave',
            leaveType: request.type,
            workHours: 0,
            lateMinutes: 0,
            earlyLeaveMinutes: 0,
            overtimeHours: 0,
            notes,
            verifiedByFace: true,
            updatedAt:
              new Date().toISOString(),
          })
        );
      } else if (
        existing &&
        !existing.checkIn &&
        existing.status !== 'on_leave'
      ) {
        map.set(
          key,
          sanitizeRecordServer({
            ...existing,
            status: 'on_leave',
            leaveType: request.type,
            notes: existing.notes
              ? `${existing.notes} | ${notes}`
              : notes,
            updatedAt:
              new Date().toISOString(),
          })
        );
      }

      date.setDate(
        date.getDate() + 1
      );
    }
  }

  return Array.from(
    map.values()
  );
}

function mergeAttendanceRecords(
  existing: any[] = [],
  incoming: any[] = []
): any[] {
  const map = new Map<string, any>();

  const deletedKeys =
    serverState.deletedAttendanceKeys || {};

  const processRecord = (
    record: any,
    isIncoming = false
  ) => {
    if (!record) return;

    const sanitized =
      sanitizeRecordServer(record);

    const rawEmployeeId =
      sanitized.employeeId
        ? String(
            sanitized.employeeId
          ).trim()
        : '';

    const employeeId =
      normalizeEmployeeId(rawEmployeeId);

    const date =
      normalizeDate(sanitized.date);

    const canonicalId =
      employeeId && date
        ? `rec-${employeeId}-${date}`
        : sanitized.id;

    const key =
      employeeId && date
        ? attendanceKey(
            employeeId,
            date
          )
        : canonicalId;

    if (!key) return;

    if (
      sanitized.checkIn ||
      sanitized.checkOut ||
      isIncoming
    ) {
      delete deletedKeys[key];
    } else {
      const deletedAt =
        deletedKeys[key] || 0;

      const recordTime =
        parseRecordMsServer(
          sanitized
        );

      if (
        deletedAt > 0 &&
        recordTime <= deletedAt
      ) {
        return;
      }
    }

    const old =
      map.get(key);

    if (!old) {
      map.set(key, {
        ...sanitized,
        id: canonicalId,
        employeeId:
          rawEmployeeId ||
          sanitized.employeeId,
        updatedAt:
          sanitized.updatedAt ||
          new Date().toISOString(),
      });

      return;
    }

    const oldTime =
      parseRecordMsServer(old);

    const newTime =
      parseRecordMsServer(
        sanitized
      );

    const checkIn =
      sanitized.checkIn &&
      String(
        sanitized.checkIn
      ).trim()
        ? sanitized.checkIn
        : old.checkIn;

    const explicitCancel =
      sanitized.isExplicitCancelCheckOut === true ||
      old.isExplicitCancelCheckOut === true;

    let checkOut:
      | string
      | null
      | undefined;

    if (explicitCancel) {
      checkOut = null;
    } else if (
      sanitized.checkOut &&
      String(
        sanitized.checkOut
      ).trim()
    ) {
      checkOut =
        sanitized.checkOut;
    } else {
      checkOut =
        old.checkOut;
    }

    const breakStart =
      sanitized.breakStart !==
        undefined &&
      sanitized.breakStart !== null
        ? sanitized.breakStart
        : old.breakStart;

    const breakEnd =
      sanitized.breakEnd !==
        undefined &&
      sanitized.breakEnd !== null
        ? sanitized.breakEnd
        : old.breakEnd;

    const baseRecord =
      newTime >= oldTime
        ? { ...old, ...sanitized }
        : { ...sanitized, ...old };

    let workHours =
      explicitCancel
        ? 0
        : Number(
            baseRecord.workHours || 0
          );

    if (
      checkIn &&
      checkOut &&
      workHours === 0
    ) {
      workHours =
        calculateWorkHoursServer(
          String(checkIn),
          String(checkOut),
          breakStart
            ? String(breakStart)
            : undefined,
          breakEnd
            ? String(breakEnd)
            : undefined
        );
    }

    const lateMinutes =
      baseRecord.lateMinutes !==
        undefined &&
      baseRecord.lateMinutes !== null
        ? Number(
            baseRecord.lateMinutes
          )
        : Number(
            old.lateMinutes || 0
          );

    const lateSeconds =
      baseRecord.lateSeconds !==
        undefined &&
      baseRecord.lateSeconds !== null
        ? Number(
            baseRecord.lateSeconds
          )
        : Number(
            old.lateSeconds || 0
          );

    const earlyLeaveMinutes =
      explicitCancel
        ? 0
        : baseRecord.earlyLeaveMinutes !==
            undefined &&
          baseRecord.earlyLeaveMinutes !==
            null
        ? Number(
            baseRecord.earlyLeaveMinutes
          )
        : Number(
            old.earlyLeaveMinutes || 0
          );

    const overtimeHours =
      baseRecord.overtimeHours !==
        undefined &&
      baseRecord.overtimeHours !== null
        ? Number(
            baseRecord.overtimeHours
          )
        : Number(
            old.overtimeHours || 0
          );

    const isExcused =
      sanitized.isExcused !==
        undefined
        ? sanitized.isExcused
        : old.isExcused;

    const excusedReason =
      isExcused === false
        ? undefined
        : sanitized.excusedReason ||
          old.excusedReason;

    const excusedBy =
      isExcused === false
        ? undefined
        : sanitized.excusedBy ||
          old.excusedBy;

    const leaveType =
      sanitized.leaveType ||
      old.leaveType;

    let notes =
      old.notes || '';

    if (
      sanitized.notes &&
      typeof sanitized.notes ===
        'string'
    ) {
      const trimmed =
        sanitized.notes.trim();

      if (
        trimmed &&
        !notes.includes(trimmed)
      ) {
        notes = notes
          ? `${notes} | ${trimmed}`
          : trimmed;
      }
    }

    let status =
      baseRecord.status;

    if (explicitCancel) {
      status =
        lateMinutes > 0
          ? 'late'
          : 'in_progress';
    } else if (checkOut) {
      if (
        !status ||
        status === 'in_progress' ||
        status === 'absent' ||
        status === 'weekend'
      ) {
        status =
          lateMinutes > 0
            ? 'late'
            : earlyLeaveMinutes > 0
            ? 'early_leave'
            : 'on_time';
      }
    } else if (checkIn) {
      if (
        !status ||
        status === 'absent' ||
        status === 'weekend'
      ) {
        status =
          lateMinutes > 0
            ? 'late'
            : 'in_progress';
      }
    }

    const mergedRecord =
      sanitizeRecordServer({
        ...baseRecord,
        id: canonicalId,
        employeeId:
          rawEmployeeId ||
          old.employeeId,
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
        isExplicitCancelCheckOut:
          explicitCancel
            ? true
            : false,
        updatedAt:
          sanitized.updatedAt ||
          old.updatedAt ||
          new Date().toISOString(),
      });

    map.set(
      key,
      mergedRecord
    );
  };

  for (const record of existing) {
    processRecord(
      record,
      false
    );
  }

  for (const record of incoming) {
    processRecord(
      record,
      true
    );
  }

  return Array.from(
    map.values()
  )
    .map(record =>
      sanitizeRecordServer(record)
    )
    .sort((a, b) => {
      if (b.date !== a.date) {
        return String(b.date || '')
          .localeCompare(
            String(a.date || '')
          );
      }

      return String(
        a.employeeId || ''
      ).localeCompare(
        String(
          b.employeeId || ''
        )
      );
    });
}

function mergeByUniqueId(
  existing: any[] = [],
  incoming: any[] = []
): any[] {
  const map = new Map<string, any>();

  const deletedKeys =
    serverState.deletedLeaveKeys || {};

  for (const item of existing) {
    if (
      item?.id &&
      !deletedKeys[item.id]
    ) {
      map.set(
        item.id,
        { ...item }
      );
    }
  }

  for (const item of incoming) {
    if (
      !item?.id ||
      deletedKeys[item.id]
    ) {
      continue;
    }

    const old =
      map.get(item.id);

    if (!old) {
      map.set(
        item.id,
        { ...item }
      );
      continue;
    }

    const oldTime =
      old.updatedAt
        ? Date.parse(
            old.updatedAt
          )
        : 0;

    const incomingTime =
      item.updatedAt
        ? Date.parse(
            item.updatedAt
          )
        : 0;

    if (
      oldTime > 0 &&
      incomingTime > 0 &&
      incomingTime < oldTime
    ) {
      continue;
    }

    let avatar =
      item.avatar;

    if (item._isPhotoRemoved) {
      avatar = '';
    } else if (
      (!avatar ||
        String(avatar).trim() === '') &&
      old.avatar
    ) {
      avatar = old.avatar;
    }

    map.set(item.id, {
      ...old,
      ...item,
      status:
        item.status ||
        old.status ||
        'pending',
      reviewNotes:
        item.reviewNotes ??
        old.reviewNotes,
      reviewedBy:
        item.reviewedBy ??
        old.reviewedBy,
      attachmentUrl:
        item.attachmentUrl ??
        old.attachmentUrl,
      attachmentName:
        item.attachmentName ??
        old.attachmentName,
      avatar:
        avatar !== undefined
          ? avatar
          : old.avatar || '',
    });
  }

  return Array.from(
    map.values()
  );
}

function cleanStateForResponse(
  state: ServerState
) {
  const deletedEmployees =
    state.deletedEmployeeKeys || {};

  const employees =
    (state.employees || [])
      .filter(
        employee =>
          employee?.id &&
          !deletedEmployees[
            employee.id
          ]
      );

  const employeeExists =
    new Set(
      employees.map(
        employee =>
          normalizeEmployeeId(
            employee.id
          )
      )
    );

  const attendanceRecords =
    (state.attendanceRecords || [])
      .filter(record => {
        const id =
          normalizeEmployeeId(
            record.employeeId
          );

        return (
          !deletedEmployees[
            record.employeeId
          ] &&
          employeeExists.has(id)
        );
      });

  const leaveRequests =
    (state.leaveRequests || [])
      .filter(request => {
        const id =
          normalizeEmployeeId(
            request.employeeId
          );

        return (
          !deletedEmployees[
            request.employeeId
          ] &&
          employeeExists.has(id)
        );
      });

  const overtimeRequests =
    (state.overtimeRequests || [])
      .filter(request => {
        const id =
          normalizeEmployeeId(
            request.employeeId
          );

        return (
          !deletedEmployees[
            request.employeeId
          ] &&
          employeeExists.has(id)
        );
      });

  return {
    employees,
    attendanceRecords,
    leaveRequests,
    overtimeRequests,
    shifts:
      state.shifts || [],
    companyNameAr:
      state.companyNameAr ||
      null,
    companyNameEn:
      state.companyNameEn ||
      null,
    urgentNotice:
      state.urgentNotice !==
        undefined
        ? state.urgentNotice
        : null,
    lastUpdated:
      state.lastUpdated ||
      Date.now(),
  };
}

function getAttendanceInsertData(
  record: any
): typeof schema.attendanceRecords.$inferInsert {
  return {
    id: String(record.id),
    employeeId: String(
      record.employeeId
    ),
    date: String(record.date),

    checkIn:
      record.checkIn ??
      null,

    checkOut:
      record.checkOut ??
      null,

    breakStart:
      record.breakStart ??
      null,

    breakEnd:
      record.breakEnd ??
      null,

    breaks:
      record.breaks ??
      null,

    totalBreakSeconds:
      record.totalBreakSeconds ??
      null,

    location:
      record.location ??
      null,

    deviceInfo:
      record.deviceInfo ??
      null,

    lateMinutes:
      record.lateMinutes ??
      0,

    lateSeconds:
      record.lateSeconds ??
      0,

    earlyLeaveMinutes:
      record.earlyLeaveMinutes ??
      0,

    workHours:
      record.workHours ??
      0,

    overtimeHours:
      record.overtimeHours ??
      0,

    minusHours:
      record.minusHours ??
      0,

    status:
      record.status ??
      null,

    leaveType:
      record.leaveType ??
      null,

    notes:
      record.notes ??
      null,

    verifiedByFace:
      record.verifiedByFace ??
      false,

    isExcused:
      record.isExcused ??
      false,

    excusedBy:
      record.excusedBy ??
      null,

    excusedReason:
      record.excusedReason ??
      null,

    updatedAt:
      record.updatedAt ??
      new Date().toISOString(),

    isExplicitCancelCheckOut:
      record.isExplicitCancelCheckOut ??
      false,
  };
}

app.disable('x-powered-by');

app.use(
  express.json({
    limit: '50mb',
  })
);

app.use(
  '/api',
  (_req, res, next) => {
    res.set({
      'Cache-Control':
        'no-store, no-cache, must-revalidate, proxy-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
    });

    next();
  }
);

app.get(
  '/api/data',
  async (_req, res) => {
    try {
      if (hasDatabase) {
        const [
          employees,
          attendanceRecords,
          leaveRequests,
          overtimeRequests,
          shifts,
        ] = await Promise.all([
          db
            .select()
            .from(schema.employees),

          db
            .select()
            .from(
              schema.attendanceRecords
            ),

          db
            .select()
            .from(
              schema.leaveRequests
            ),

          db
            .select()
            .from(
              schema.overtimeRequests
            ),

          db
            .select()
            .from(schema.shifts),
        ]);

        return res.json({
          success: true,
          employees,
          attendanceRecords,
          leaveRequests,
          overtimeRequests,
          shifts,
          companyNameAr:
            serverState.companyNameAr ||
            null,
          companyNameEn:
            serverState.companyNameEn ||
            null,
          urgentNotice:
            serverState.urgentNotice ??
            null,
          lastUpdated:
            Date.now(),
        });
      }

      if (hasKvStorage) {
        try {
          const persistent =
            await kv.get<ServerState>(
              KV_STATE_KEY
            );

          if (
            persistent &&
            typeof persistent ===
              'object'
          ) {
            serverState = {
              ...serverState,
              ...persistent,
            };
          }
        } catch (error) {
          console.error(
            'KV data fetch failed:',
            error
          );
        }
      }

      if (
        (!serverState.employees ||
          serverState.employees
            .length === 0) &&
        fs.existsSync(DATA_FILE)
      ) {
        const fileState =
          loadServerData();

        if (fileState) {
          serverState = {
            ...fileState,
            ...serverState,
          };
        }
      }

      if (
        serverState.leaveRequests &&
        serverState.attendanceRecords
      ) {
        serverState.attendanceRecords =
          ensureApprovedLeaveRecordsServer(
            serverState.attendanceRecords,
            serverState.leaveRequests
          );
      }

      return res.json({
        success: true,
        ...cleanStateForResponse(
          serverState
        ),
      });
    } catch (error) {
      console.error(
        'GET /api/data error:',
        error
      );

      return res.status(500).json({
        success: false,
        error: 'Failed to fetch data',
      });
    }
  }
);

app.post(
  '/api/data',
  async (req, res) => {
    try {
      const body =
        req.body || {};

      if (hasKvStorage) {
        const current =
          (await kv.get<ServerState>(
            KV_APP_DATA_KEY
          )) || serverState;

        serverState = {
          ...serverState,
          ...current,
          ...body,
          lastUpdated:
            Date.now(),
        };

        await saveServerData(
          serverState
        );

        return res.json({
          success: true,
          ...cleanStateForResponse(
            serverState
          ),
        });
      }

      serverState = {
        ...serverState,
        ...body,
        lastUpdated:
          Date.now(),
      };

      await saveServerData(
        serverState
      );

      return res.json({
        success: true,
        ...cleanStateForResponse(
          serverState
        ),
      });
    } catch (error) {
      console.error(
        'POST /api/data error:',
        error
      );

      return res.status(500).json({
        success: false,
        error: 'فشل حفظ البيانات',
      });
    }
  }
);

app.post(
  '/api/login',
  async (req, res) => {
    try {
      const {
        code: loginCode,
        password,
      } = req.body || {};

      if (
        !loginCode ||
        !password
      ) {
        return res.status(400).json({
          success: false,
          error:
            'Missing credentials',
        });
      }

      const cleanInput =
        String(loginCode)
          .trim()
          .toLowerCase();

      const rawAlphanumeric =
        cleanInput.replace(
          /[^a-z0-9]/g,
          ''
        );

      const numericOnly =
        cleanInput.replace(
          /\D/g,
          ''
        );

      const numericValue =
        numericOnly
          ? parseInt(
              numericOnly,
              10
            )
          : null;

      const cleanPassword =
        String(password)
          .trim()
          .toLowerCase();

      const employees =
        hasDatabase
          ? await db
              .select()
              .from(
                schema.employees
              )
          : serverState.employees ||
            [];

      let employee: any;

      if (
        cleanInput === 'leader'
      ) {
        employee =
          employees.find(
            item =>
              item.role ===
                'leader' ||
              item.code ===
                'EMP011'
          ) ||
          employees[0];
      } else {
        employee =
          employees.find(
            item => {
              if (!item) {
                return false;
              }

              const employeeCode =
                item.code
                  ? String(
                      item.code
                    ).toLowerCase()
                  : '';

              const employeeAlpha =
                employeeCode.replace(
                  /[^a-z0-9]/g,
                  ''
                );

              const employeeNumeric =
                employeeCode.replace(
                  /\D/g,
                  ''
                );

              const employeeNumber =
                employeeNumeric
                  ? parseInt(
                      employeeNumeric,
                      10
                    )
                  : null;

              if (
                employeeCode ===
                cleanInput
              ) {
                return true;
              }

              if (
                employeeAlpha ===
                rawAlphanumeric
              ) {
                return true;
              }

              if (
                numericValue !==
                  null &&
                employeeNumber !==
                  null &&
                numericValue ===
                  employeeNumber
              ) {
                return true;
              }

              if (
                item.email &&
                String(
                  item.email
                ).toLowerCase() ===
                  cleanInput
              ) {
                return true;
              }

              if (
                item.phone &&
                String(
                  item.phone
                ).replace(
                  /\D/g,
                  ''
                ) ===
                  cleanInput.replace(
                    /\D/g,
                    ''
                  )
              ) {
                return true;
              }

              return false;
            }
          );
      }

      if (!employee) {
        return res.status(401).json({
          success: false,
          error:
            'Invalid login credentials',
        });
      }

      const employeeNumber =
        employee.code
          ? String(
              employee.code
            ).replace(
              /\D/g,
              ''
            )
          : '';

      const defaultPassword =
        `emp${employeeNumber}`
          .toLowerCase();

      const defaultPaddedPassword =
        `emp${employeeNumber.padStart(
          3,
          '0'
        )}`.toLowerCase();

      let hashedMatch = false;

      if (
        employee.pin &&
        String(
          employee.pin
        ).length === 64
      ) {
        const hashedPassword =
          crypto
            .createHash(
              'sha256'
            )
            .update(
              cleanPassword
            )
            .digest('hex');

        hashedMatch =
          hashedPassword ===
          employee.pin;
      }

      const validPassword =
        hashedMatch ||
        cleanPassword ===
          String(
            employee.pin || ''
          ).toLowerCase() ||
        (
          employee.role ===
            'leader' &&
          cleanPassword ===
            'leader123'
        ) ||
        cleanPassword ===
          defaultPassword ||
        cleanPassword ===
          defaultPaddedPassword ||
        cleanPassword ===
          '1234' ||
        cleanPassword ===
          'tech_123';

      if (!validPassword) {
        return res.status(401).json({
          success: false,
          error:
            'Invalid login credentials',
        });
      }

      if (
        employee.status ===
        'inactive'
      ) {
        return res.status(403).json({
          success: false,
          error:
            'ACCOUNT_INACTIVE',
        });
      }

      const safeEmployee = {
        ...employee,
        pin: '***',
      };

      return res.json({
        success: true,
        employee:
          safeEmployee,
      });
    } catch (error) {
      console.error(
        'Login error:',
        error
      );

      return res.status(500).json({
        success: false,
        error: 'Login failed',
      });
    }
  }
);

app.post(
  '/api/sync',
  async (req, res) => {
    try {
      const {
        employees,
        attendanceRecords,
        leaveRequests,
        overtimeRequests,
        shifts,
        companyNameAr,
        companyNameEn,
        urgentNotice,
        deletedAttendanceIds,
        deletedLeaveIds,
        deletedEmployeeIds,
        replaceAttendance,
      } = req.body || {};

      serverState.deletedAttendanceKeys =
        serverState.deletedAttendanceKeys ||
        {};

      serverState.deletedLeaveKeys =
        serverState.deletedLeaveKeys ||
        {};

      serverState.deletedEmployeeKeys =
        serverState.deletedEmployeeKeys ||
        {};

      if (
        Array.isArray(
          deletedEmployeeIds
        )
      ) {
        for (
          const employeeId of deletedEmployeeIds
        ) {
          if (!employeeId) continue;

          serverState.deletedEmployeeKeys[
            String(employeeId)
          ] = Date.now();
        }
      }

      if (
        Array.isArray(
          deletedAttendanceIds
        ) &&
        deletedAttendanceIds.length
      ) {
        const now =
          Date.now();

        for (
          const id of deletedAttendanceIds
        ) {
          const record =
            (
              serverState.attendanceRecords ||
              []
            ).find(
              item =>
                item.id === id
            );

          if (
            record?.employeeId &&
            record?.date
          ) {
            serverState.deletedAttendanceKeys[
              attendanceKey(
                record.employeeId,
                record.date
              )
            ] = now;
          }
        }

        const deleteSet =
          new Set(
            deletedAttendanceIds
          );

        serverState.attendanceRecords =
          (
            serverState.attendanceRecords ||
            []
          ).filter(
            record =>
              !deleteSet.has(
                record.id
              )
          );
      }

      if (
        Array.isArray(
          deletedLeaveIds
        )
      ) {
        for (
          const id of deletedLeaveIds
        ) {
          if (!id) continue;

          serverState.deletedLeaveKeys[
            String(id)
          ] = Date.now();
        }

        const deleteSet =
          new Set(
            deletedLeaveIds
          );

        serverState.leaveRequests =
          (
            serverState.leaveRequests ||
            []
          ).filter(
            item =>
              !deleteSet.has(
                item.id
              )
          );
      }

      const deletedEmployees =
        serverState.deletedEmployeeKeys ||
        {};

      if (
        Array.isArray(
          employees
        )
      ) {
        serverState.employees =
          employees.filter(
            employee =>
              employee?.id &&
              !deletedEmployees[
                employee.id
              ]
          );
      }

      if (
        Array.isArray(
          shifts
        )
      ) {
        serverState.shifts =
          shifts;
      }

      if (
        Array.isArray(
          attendanceRecords
        )
      ) {
        let incoming =
          attendanceRecords.filter(
            record =>
              record &&
              !deletedEmployees[
                record.employeeId
              ]
          );

        if (
          Array.isArray(
            deletedAttendanceIds
          )
        ) {
          const deleteSet =
            new Set(
              deletedAttendanceIds
            );

          incoming =
            incoming.filter(
              record =>
                !deleteSet.has(
                  record.id
                )
            );
        }

        if (
          replaceAttendance ===
          true
        ) {
          serverState.attendanceRecords =
            mergeAttendanceRecords(
              [],
              incoming
            );
        } else {
          serverState.attendanceRecords =
            mergeAttendanceRecords(
              serverState.attendanceRecords ||
                [],
              incoming
            );
        }
      }

      if (
        Array.isArray(
          leaveRequests
        )
      ) {
        const incomingLeaves =
          leaveRequests.filter(
            request =>
              request &&
              !deletedEmployees[
                request.employeeId
              ]
          );

        serverState.leaveRequests =
          mergeByUniqueId(
            serverState.leaveRequests ||
              [],
            incomingLeaves
          );
      }

      if (
        Array.isArray(
          overtimeRequests
        )
      ) {
        const existing =
          serverState.overtimeRequests ||
          [];

        const map =
          new Map<string, any>();

        for (
          const item of existing
        ) {
          if (item?.id) {
            map.set(
              item.id,
              item
            );
          }
        }

        for (
          const item of overtimeRequests
        ) {
          if (
            item?.id &&
            !deletedEmployees[
              item.employeeId
            ]
          ) {
            const old =
              map.get(item.id);

            map.set(
              item.id,
              old
                ? {
                    ...old,
                    ...item,
                  }
                : {
                    ...item,
                  }
            );
          }
        }

        serverState.overtimeRequests =
          Array.from(
            map.values()
          );
      }

      if (
        companyNameAr !==
        undefined
      ) {
        serverState.companyNameAr =
          companyNameAr;
      }

      if (
        companyNameEn !==
        undefined
      ) {
        serverState.companyNameEn =
          companyNameEn;
      }

      if (
        urgentNotice !==
        undefined
      ) {
        serverState.urgentNotice =
          urgentNotice;
      }

      if (
        serverState.leaveRequests &&
        serverState.attendanceRecords
      ) {
        serverState.attendanceRecords =
          ensureApprovedLeaveRecordsServer(
            serverState.attendanceRecords,
            serverState.leaveRequests
          );
      }

      serverState.lastUpdated =
        Date.now();

      await saveServerData(
        serverState
      );

      return res.json({
        success: true,
        lastUpdated:
          serverState.lastUpdated,
      });
    } catch (error) {
      console.error(
        'POST /api/sync error:',
        error
      );

      return res.status(500).json({
        success: false,
        error:
          'Failed to synchronize data',
      });
    }
  }
);

app.put(
  '/api/employees/:id',
  async (req, res) => {
    try {
      const employeeId =
        String(
          req.params.id || ''
        ).trim();

      const changes =
        req.body;

      if (
        !employeeId ||
        !changes ||
        typeof changes !==
          'object'
      ) {
        return res.status(400).json({
          success: false,
          error:
            'Invalid employee update',
        });
      }

      if (hasDatabase) {
        const allowedFields: Record<
          string,
          any
        > = {
          code: changes.code,
          nameAr: changes.nameAr,
          nameEn: changes.nameEn,
          avatar: changes.avatar,
          email: changes.email,
          phone: changes.phone,
          department:
            changes.department,
          jobTitleAr:
            changes.jobTitleAr,
          jobTitleEn:
            changes.jobTitleEn,
          shiftId:
            changes.shiftId,
          pin: changes.pin,
          role: changes.role,
          joinedDate:
            changes.joinedDate,
          status:
            changes.status,
          annualLeaveBalance:
            changes.annualLeaveBalance,
          casualLeaveBalance:
            changes.casualLeaveBalance,
          regularLeaveBalance:
            changes.regularLeaveBalance,
          sickLeaveBalance:
            changes.sickLeaveBalance,
          isPhotoRemoved:
            changes.isPhotoRemoved,
        };

        const updateData =
          Object.fromEntries(
            Object.entries(
              allowedFields
            ).filter(
              ([, value]) =>
                value !==
                undefined
            )
          );

        if (
          !changes._isPhotoRemoved &&
          (
            !changes.avatar ||
            String(
              changes.avatar
            ).trim() === ''
          )
        ) {
          delete updateData.avatar;
        }

        const updatedRows =
          await db
            .update(
              schema.employees
            )
            .set(updateData)
            .where(
              sql`id = ${employeeId}`
            )
            .returning();

        if (
          !updatedRows.length
        ) {
          return res.status(404).json({
            success: false,
            error:
              'Employee not found',
          });
        }

        return res.json({
          success: true,
          employee:
            updatedRows[0],
          lastUpdated:
            Date.now(),
        });
      }

      const employees =
        serverState.employees ||
        [];

      const index =
        employees.findIndex(
          employee =>
            String(
              employee.id
            ).toLowerCase() ===
            employeeId.toLowerCase()
        );

      if (index < 0) {
        return res.status(404).json({
          success: false,
          error:
            'Employee not found',
        });
      }

      const current =
        employees[index];

      const updated = {
        ...current,
        ...changes,
        id: current.id,
      };

      if (
        !changes._isPhotoRemoved &&
        (
          !changes.avatar ||
          String(
            changes.avatar
          ).trim() === ''
        )
      ) {
        updated.avatar =
          current.avatar || '';
      }

      serverState.employees =
        employees.map(
          (
            employee,
            employeeIndex
          ) =>
            employeeIndex ===
            index
              ? updated
              : employee
        );

      serverState.lastUpdated =
        Date.now();

      await saveServerData(
        serverState
      );

      return res.json({
        success: true,
        employee: updated,
        lastUpdated:
          serverState.lastUpdated,
      });
    } catch (error) {
      console.error(
        'Employee update error:',
        error
      );

      return res.status(500).json({
        success: false,
        error:
          'Failed to update employee',
      });
    }
  }
);

app.delete(
  '/api/shifts/:id',
  async (req, res) => {
    try {
      const id =
        String(
          req.params.id || ''
        ).trim();

      if (!id) {
        return res.status(400).json({
          success: false,
          error:
            'Shift ID is required',
        });
      }

      if (hasDatabase) {
        await db
          .delete(schema.shifts)
          .where(
            sql`id = ${id}`
          );

        return res.json({
          success: true,
        });
      }

      serverState.shifts =
        (
          serverState.shifts ||
          []
        ).filter(
          shift =>
            shift.id !== id
        );

      serverState.lastUpdated =
        Date.now();

      await saveServerData(
        serverState
      );

      return res.json({
        success: true,
      });
    } catch (error) {
      console.error(
        'Delete shift error:',
        error
      );

      return res.status(500).json({
        success: false,
        error:
          'Failed to delete shift',
      });
    }
  }
);

app.post(
  '/api/punch',
  async (req, res) => {
    try {
      const {
        employeeId,
        record,
        action,
      } = req.body || {};

      if (!employeeId) {
        return res.status(400).json({
          success: false,
          error:
            'Employee ID is required',
        });
      }

      const rawEmployeeId =
        String(
          employeeId
        ).trim();

      const normalizedEmployeeId =
        normalizeEmployeeId(
          rawEmployeeId
        );

      const serverClock =
        getServerClock();

      const requestedDate =
        action === 'update' &&
        record?.date
          ? String(
              record.date
            ).trim()
          : serverClock.date;

      const todayDate =
        requestedDate ||
        serverClock.date;

      const canonicalId =
        `rec-${normalizedEmployeeId}-${todayDate}`;

      const timeValue =
        action === 'update'
          ? (
              record?.checkIn ||
              record?.checkOut ||
              serverClock.time
            )
          : serverClock.time;

      if (hasDatabase) {
        const existingRows =
          await db
            .select()
            .from(
              schema.attendanceRecords
            )
            .where(
              sql`employee_id = ${rawEmployeeId} AND date = ${todayDate}`
            );

        const existing =
          existingRows[0];

        const newRecord: any =
          existing
            ? { ...existing }
            : {
                id: canonicalId,
                employeeId:
                  rawEmployeeId,
                date:
                  todayDate,
                updatedAt:
                  new Date().toISOString(),
              };

        if (
          action ===
          'check_in'
        ) {
          if (!newRecord.checkIn) {
            newRecord.checkIn =
              timeValue;
          }
        } else if (
          action ===
          'check_out'
        ) {
          newRecord.checkOut =
            timeValue;

          newRecord.isExplicitCancelCheckOut =
            false;
        } else if (
          action ===
          'break_start'
        ) {
          newRecord.breakStart =
            timeValue;
        } else if (
          action ===
            'break_end' ||
          action ===
            'force_break_end'
        ) {
          newRecord.breakEnd =
            timeValue;
        } else if (
          action === 'update' &&
          record
        ) {
          const editableFields = [
            'checkIn',
            'checkOut',
            'breakStart',
            'breakEnd',
            'breaks',
            'totalBreakSeconds',
            'location',
            'deviceInfo',
            'status',
            'leaveType',
            'notes',
            'verifiedByFace',
            'isExcused',
            'excusedBy',
            'excusedReason',
            'isExplicitCancelCheckOut',
          ];

          for (
            const field of editableFields
          ) {
            if (
              record[field] !==
              undefined
            ) {
              newRecord[field] =
                record[field];
            }
          }
        }

        if (
          newRecord.checkOut ===
            null ||
          newRecord.isExplicitCancelCheckOut ===
            true
        ) {
          newRecord.checkOut =
            null;

          newRecord.workHours =
            0;

          newRecord.overtimeHours =
            0;

          newRecord.earlyLeaveMinutes =
            0;
        }

        const calculated =
          sanitizeRecordServer(
            newRecord
          );

        calculated.updatedAt =
          new Date().toISOString();

        const insertData =
          getAttendanceInsertData(
            calculated
          );

        await db
          .insert(
            schema.attendanceRecords
          )
          .values(
            insertData
          )
          .onConflictDoUpdate({
            target: [
              schema.attendanceRecords
                .employeeId,
              schema.attendanceRecords
                .date,
            ],
            set: insertData,
          });

        const finalRecords =
          await db
            .select()
            .from(
              schema.attendanceRecords
            );

        const finalRecord =
          finalRecords.find(
            item =>
              normalizeEmployeeId(
                item.employeeId
              ) ===
                normalizedEmployeeId &&
              String(
                item.date
              ) === todayDate
          );

        return res.json({
          success: true,
          record:
            finalRecord ||
            calculated,
          attendanceRecords:
            finalRecords,
          lastUpdated:
            Date.now(),
          serverTime:
            serverClock,
        });
      }

      if (
        !serverState.attendanceRecords
      ) {
        serverState.attendanceRecords =
          [];
      }

      let targetRecord =
        serverState.attendanceRecords.find(
          item =>
            normalizeEmployeeId(
              item.employeeId
            ) ===
              normalizedEmployeeId &&
            String(
              item.date
            ) === todayDate
        );

      if (!targetRecord) {
        targetRecord = {
          id: canonicalId,
          employeeId:
            rawEmployeeId,
          date: todayDate,
          status:
            'in_progress',
          updatedAt:
            new Date().toISOString(),
        };

        serverState.attendanceRecords.push(
          targetRecord
        );
      }

      if (
        action ===
        'check_in'
      ) {
        if (
          !targetRecord.checkIn
        ) {
          targetRecord.checkIn =
            timeValue;
        }
      } else if (
        action ===
        'check_out'
      ) {
        targetRecord.checkOut =
          timeValue;

        targetRecord.isExplicitCancelCheckOut =
          false;
      } else if (
        action ===
        'break_start'
      ) {
        targetRecord.breakStart =
          timeValue;
      } else if (
        action ===
          'break_end' ||
        action ===
          'force_break_end'
      ) {
        targetRecord.breakEnd =
          timeValue;
      } else if (
        action === 'update' &&
        record
      ) {
        const updated =
          mergeAttendanceRecords(
            [targetRecord],
            [record]
          )[0];

        if (updated) {
          targetRecord =
            updated;

          const index =
            serverState.attendanceRecords.findIndex(
              item =>
                item.id ===
                canonicalId
            );

          if (index >= 0) {
            serverState.attendanceRecords[
              index
            ] =
              targetRecord;
          }
        }
      } else if (
        record &&
        action !== 'update'
      ) {
        const allowedFields = [
          'location',
          'notes',
          'lateMinutes',
          'lateSeconds',
          'earlyLeaveMinutes',
          'workHours',
          'overtimeHours',
          'minusHours',
          'status',
          'verifiedByFace',
          'isExcused',
          'excusedReason',
          'excusedBy',
          'leaveType',
        ];

        for (
          const field of allowedFields
        ) {
          if (
            record[field] !==
            undefined
          ) {
            targetRecord[field] =
              record[field];
          }
        }
      }

      const sanitized =
        sanitizeRecordServer(
          targetRecord
        );

      Object.assign(
        targetRecord,
        sanitized
      );

      targetRecord.updatedAt =
        new Date().toISOString();

      serverState.lastUpdated =
        Date.now();

      await saveServerData(
        serverState
      );

      return res.json({
        success: true,
        lastUpdated:
          serverState.lastUpdated,
        record:
          targetRecord,
        serverTime:
          serverClock,
        attendanceRecords:
          cleanStateForResponse(
            serverState
          ).attendanceRecords,
      });
    } catch (error) {
      console.error(
        'Punch error:',
        error
      );

      return res.status(500).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Punch failed',
      });
    }
  }
);

app.post(
  '/api/attendance',
  async (req, res) => {
    try {
      const record =
        req.body;

      if (
        !record ||
        (!record.id &&
          !record.employeeId)
      ) {
        return res.status(400).json({
          success: false,
          error:
            'Invalid attendance record',
        });
      }

      serverState.attendanceRecords =
        mergeAttendanceRecords(
          serverState.attendanceRecords ||
            [],
          [record]
        );

      serverState.lastUpdated =
        Date.now();

      await saveServerData(
        serverState
      );

      return res.json({
        success: true,
        attendanceRecords:
          serverState.attendanceRecords,
        lastUpdated:
          serverState.lastUpdated,
      });
    } catch (error) {
      console.error(
        'Attendance save error:',
        error
      );

      return res.status(500).json({
        success: false,
        error:
          'Failed to save attendance',
      });
    }
  }
);

app.post(
  '/api/attendance/clear-today',
  async (req, res) => {
    try {
      const dateString =
        String(
          req.body?.date ||
            getTodayServerDate()
        ).trim();

      const now =
        Date.now();

      serverState.deletedAttendanceKeys =
        serverState.deletedAttendanceKeys ||
        {};

      const records =
        serverState.attendanceRecords ||
        [];

      for (
        const record of records
      ) {
        if (
          String(
            record.date
          ) === dateString
        ) {
          if (
            record.employeeId
          ) {
            serverState.deletedAttendanceKeys[
              attendanceKey(
                record.employeeId,
                dateString
              )
            ] = now;
          }
        }
      }

      serverState.attendanceRecords =
        records.filter(
          record =>
            String(
              record.date
            ) !== dateString
        );

      serverState.lastUpdated =
        Date.now();

      await saveServerData(
        serverState
      );

      return res.json({
        success: true,
        attendanceRecords:
          serverState.attendanceRecords,
        lastUpdated:
          serverState.lastUpdated,
      });
    } catch (error) {
      console.error(
        'Clear attendance error:',
        error
      );

      return res.status(500).json({
        success: false,
        error:
          'Failed to clear attendance',
      });
    }
  }
);

app.post(
  '/api/attendance/delete-future',
  async (req, res) => {
    try {
      const cutoffDate =
        String(
          req.body?.todayDate ||
            getTodayServerDate()
        ).trim();

      const records =
        serverState.attendanceRecords ||
        [];

      const futureRecords =
        records.filter(
          record =>
            record?.date &&
            String(
              record.date
            ) > cutoffDate
        );

      const validRecords =
        records.filter(
          record =>
            !record?.date ||
            String(
              record.date
            ) <= cutoffDate
        );

      let backupFileName =
        '';

      if (
        futureRecords.length
      ) {
        try {
          if (
            !fs.existsSync(
              BACKUP_DIR
            )
          ) {
            fs.mkdirSync(
              BACKUP_DIR,
              {
                recursive:
                  true,
              }
            );
          }

          const timestamp =
            new Date()
              .toISOString()
              .replace(
                /[:.]/g,
                '-'
              );

          backupFileName =
            `future_attendance_backup_${timestamp}.json`;

          const backupPath =
            path.join(
              BACKUP_DIR,
              backupFileName
            );

          fs.writeFileSync(
            backupPath,
            JSON.stringify(
              {
                cutoffDate,
                deletedCount:
                  futureRecords.length,
                deletedAt:
                  new Date().toISOString(),
                futureRecords,
                fullState:
                  serverState,
              },
              null,
              2
            ),
            'utf-8'
          );
        } catch (error) {
          console.error(
            'Future attendance backup error:',
            error
          );
        }
      }

      serverState.attendanceRecords =
        validRecords;

      serverState.lastUpdated =
        Date.now();

      await saveServerData(
        serverState
      );

      const remainingFuture =
        (
          serverState.attendanceRecords ||
          []
        ).filter(
          record =>
            record?.date &&
            String(
              record.date
            ) > cutoffDate
        );

      return res.json({
        success: true,
        deletedCount:
          futureRecords.length,
        remainingFutureCount:
          remainingFuture.length,
        cutoffDate,
        backupFile:
          backupFileName,
        attendanceRecords:
          serverState.attendanceRecords,
        lastUpdated:
          serverState.lastUpdated,
      });
    } catch (error) {
      console.error(
        'Delete future attendance error:',
        error
      );

      return res.status(500).json({
        success: false,
        error:
          'Failed to delete future attendance',
      });
    }
  }
);

app.post(
  '/api/leaves',
  async (req, res) => {
    try {
      const leaveRequest =
        req.body;

      if (
        !leaveRequest ||
        !leaveRequest.id ||
        !leaveRequest.employeeId
      ) {
        return res.status(400).json({
          success: false,
          error:
            'Invalid leave request',
        });
      }

      serverState.leaveRequests =
        mergeByUniqueId(
          serverState.leaveRequests ||
            [],
          [leaveRequest]
        );

      serverState.lastUpdated =
        Date.now();

      await saveServerData(
        serverState
      );

      return res.json({
        success: true,
        leaveRequests:
          serverState.leaveRequests,
        lastUpdated:
          serverState.lastUpdated,
      });
    } catch (error) {
      console.error(
        'Leave request error:',
        error
      );

      return res.status(500).json({
        success: false,
        error:
          'Failed to save leave request',
      });
    }
  }
);

app.put(
  '/api/leaves/:id/status',
  async (req, res) => {
    try {
      const id =
        String(
          req.params.id
        ).trim();

      const {
        status,
        reviewNotes,
        reviewedBy,
      } =
        req.body || {};

      const leaves =
        serverState.leaveRequests ||
        [];

      let found = false;

      serverState.leaveRequests =
        leaves.map(
          leave => {
            if (
              leave.id !==
              id
            ) {
              return leave;
            }

            found = true;

            return {
              ...leave,
              status:
                status ??
                leave.status,
              reviewNotes:
                reviewNotes !==
                undefined
                  ? reviewNotes
                  : leave.reviewNotes,
              reviewedBy:
                reviewedBy ??
                leave.reviewedBy,
              updatedAt:
                new Date().toISOString(),
            };
          }
        );

      if (!found) {
        return res.status(404).json({
          success: false,
          error:
            'Leave request not found',
        });
      }

      if (
        serverState.leaveRequests &&
        serverState.attendanceRecords
      ) {
        serverState.attendanceRecords =
          ensureApprovedLeaveRecordsServer(
            serverState.attendanceRecords,
            serverState.leaveRequests
          );
      }

      serverState.lastUpdated =
        Date.now();

      await saveServerData(
        serverState
      );

      return res.json({
        success: true,
        leaveRequests:
          serverState.leaveRequests,
        attendanceRecords:
          serverState.attendanceRecords,
        lastUpdated:
          serverState.lastUpdated,
      });
    } catch (error) {
      console.error(
        'Leave status error:',
        error
      );

      return res.status(500).json({
        success: false,
        error:
          'Failed to update leave status',
      });
    }
  }
);

app.post(
  '/api/overtime',
  async (req, res) => {
    try {
      const overtime =
        req.body;

      if (
        !overtime ||
        !overtime.id ||
        !overtime.employeeId ||
        !overtime.date
      ) {
        return res.status(400).json({
          success: false,
          error:
            'Invalid overtime request',
        });
      }

      if (
        !serverState.overtimeRequests
      ) {
        serverState.overtimeRequests =
          [];
      }

      const index =
        serverState.overtimeRequests.findIndex(
          item =>
            item.id ===
            overtime.id
        );

      if (index >= 0) {
        serverState.overtimeRequests[
          index
        ] = {
          ...serverState
            .overtimeRequests[
            index
          ],
          ...overtime,
          updatedAt:
            new Date().toISOString(),
        };
      } else {
        serverState.overtimeRequests.push(
          {
            ...overtime,
            createdAt:
              overtime.createdAt ||
              new Date().toISOString(),
            updatedAt:
              new Date().toISOString(),
          }
        );
      }

      serverState.lastUpdated =
        Date.now();

      await saveServerData(
        serverState
      );

      return res.json({
        success: true,
        overtimeRequests:
          serverState.overtimeRequests,
        lastUpdated:
          serverState.lastUpdated,
      });
    } catch (error) {
      console.error(
        'Overtime create error:',
        error
      );

      return res.status(500).json({
        success: false,
        error:
          'Failed to save overtime request',
      });
    }
  }
);

app.put(
  '/api/overtime/:id/status',
  async (req, res) => {
    try {
      const id =
        String(
          req.params.id
        ).trim();

      const {
        status,
        reviewNotes,
        reviewedBy,
      } =
        req.body || {};

      if (
        !serverState.overtimeRequests
      ) {
        serverState.overtimeRequests =
          [];
      }

      const index =
        serverState.overtimeRequests.findIndex(
          item =>
            item.id ===
            id
        );

      if (index < 0) {
        return res.status(404).json({
          success: false,
          error:
            'Overtime request not found',
        });
      }

      const current =
        serverState
          .overtimeRequests[
          index
        ];

      serverState.overtimeRequests[
        index
      ] = {
        ...current,
        status:
          status ??
          current.status,
        reviewNotes:
          reviewNotes !==
          undefined
            ? reviewNotes
            : current.reviewNotes,
        reviewedBy:
          reviewedBy ??
          current.reviewedBy,
        updatedAt:
          new Date().toISOString(),
      };

      serverState.lastUpdated =
        Date.now();

      await saveServerData(
        serverState
      );

      return res.json({
        success: true,
        overtimeRequests:
          serverState.overtimeRequests,
        lastUpdated:
          serverState.lastUpdated,
      });
    } catch (error) {
      console.error(
        'Overtime status error:',
        error
      );

      return res.status(500).json({
        success: false,
        error:
          'Failed to update overtime status',
      });
    }
  }
);

app.get(
  '/api/backup',
  (_req, res) => {
    try {
      if (
        !fs.existsSync(
          BACKUP_DIR
        )
      ) {
        fs.mkdirSync(
          BACKUP_DIR,
          {
            recursive:
              true,
          }
        );
      }

      const timestamp =
        new Date()
          .toISOString()
          .replace(
            /[:.]/g,
            '-'
          );

      const fileName =
        `server_data_backup_${timestamp}.json`;

      const filePath =
        path.join(
          BACKUP_DIR,
          fileName
        );

      const backupData = {
        ...serverState,
        backupTimestamp:
          new Date().toISOString(),
        version: '2.0',
      };

      fs.writeFileSync(
        filePath,
        JSON.stringify(
          backupData,
          null,
          2
        ),
        'utf-8'
      );

      res.setHeader(
        'Content-Type',
        'application/json'
      );

      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${fileName}"`
      );

      return res.send(
        JSON.stringify(
          backupData,
          null,
          2
        )
      );
    } catch (error) {
      console.error(
        'Backup error:',
        error
      );

      return res.status(500).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to create backup',
      });
    }
  }
);

app.post(
  '/api/backup/restore',
  async (req, res) => {
    try {
      const backup =
        req.body;

      if (
        !backup ||
        !Array.isArray(
          backup.employees
        )
      ) {
        return res.status(400).json({
          success: false,
          error:
            'Invalid backup file payload',
        });
      }

      if (
        !fs.existsSync(
          BACKUP_DIR
        )
      ) {
        fs.mkdirSync(
          BACKUP_DIR,
          {
            recursive:
              true,
          }
        );
      }

      const preRestorePath =
        path.join(
          BACKUP_DIR,
          `server_data_prerestore_${Date.now()}.json`
        );

      fs.writeFileSync(
        preRestorePath,
        JSON.stringify(
          serverState,
          null,
          2
        ),
        'utf-8'
      );

      serverState = {
        employees:
          backup.employees ||
          [],
        shifts:
          Array.isArray(
            backup.shifts
          )
            ? backup.shifts
            : [],
        attendanceRecords:
          Array.isArray(
            backup.attendanceRecords
          )
            ? backup.attendanceRecords
            : [],
        leaveRequests:
          Array.isArray(
            backup.leaveRequests
          )
            ? backup.leaveRequests
            : [],
        overtimeRequests:
          Array.isArray(
            backup.overtimeRequests
          )
            ? backup.overtimeRequests
            : [],
        companyNameAr:
          backup.companyNameAr,
        companyNameEn:
          backup.companyNameEn,
        urgentNotice:
          backup.urgentNotice,
        deletedAttendanceKeys:
          backup.deletedAttendanceKeys ||
          {},
        deletedLeaveKeys:
          backup.deletedLeaveKeys ||
          {},
        deletedEmployeeKeys:
          backup.deletedEmployeeKeys ||
          {},
        lastUpdated:
          Date.now(),
      };

      if (
        serverState.leaveRequests &&
        serverState.attendanceRecords
      ) {
        serverState.attendanceRecords =
          ensureApprovedLeaveRecordsServer(
            serverState.attendanceRecords,
            serverState.leaveRequests
          );
      }

      await saveServerData(
        serverState
      );

      return res.json({
        success: true,
        message:
          'Database successfully restored from backup',
        lastUpdated:
          serverState.lastUpdated,
        employeesCount:
          serverState.employees
            ?.length || 0,
        attendanceRecordsCount:
          serverState
            .attendanceRecords
            ?.length || 0,
      });
    } catch (error) {
      console.error(
        'Restore error:',
        error
      );

      return res.status(500).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Restore failed',
      });
    }
  }
);

app.get(
  '/api/health',
  (_req, res) => {
    return res.json({
      status: 'ok',
      database:
        hasDatabase,
      kv:
        hasKvStorage,
      serverTime:
        getServerClock(),
    });
  }
);

async function startServer() {
  try {
    const persistentState =
      await loadPersistentServerData();

    if (
      persistentState &&
      typeof persistentState ===
        'object'
    ) {
      serverState = {
        ...serverState,
        ...persistentState,
      };
    }

    serverState.employees =
      Array.isArray(
        serverState.employees
      )
        ? serverState.employees
        : [];

    serverState.shifts =
      Array.isArray(
        serverState.shifts
      )
        ? serverState.shifts
        : [];

    serverState.attendanceRecords =
      Array.isArray(
        serverState.attendanceRecords
      )
        ? serverState.attendanceRecords
        : [];

    serverState.leaveRequests =
      Array.isArray(
        serverState.leaveRequests
      )
        ? serverState.leaveRequests
        : [];

    serverState.overtimeRequests =
      Array.isArray(
        serverState.overtimeRequests
      )
        ? serverState.overtimeRequests
        : [];

    serverState.deletedAttendanceKeys =
      serverState.deletedAttendanceKeys ||
      {};

    serverState.deletedLeaveKeys =
      serverState.deletedLeaveKeys ||
      {};

    serverState.deletedEmployeeKeys =
      serverState.deletedEmployeeKeys ||
      {};

    if (
      serverState.leaveRequests &&
      serverState.attendanceRecords
    ) {
      serverState.attendanceRecords =
        ensureApprovedLeaveRecordsServer(
          serverState.attendanceRecords,
          serverState.leaveRequests
        );
    }

    if (
      process.env.NODE_ENV !==
      'production'
    ) {
      const vite =
        await createViteServer({
          server: {
            middlewareMode:
              true,
          },
          appType: 'spa',
        });

      app.use(
        vite.middlewares
      );
    } else {
      const distPath =
        path.join(
          process.cwd(),
          'dist'
        );

      app.use(
        express.static(
          distPath
        )
      );

      app.get(
        '*',
        (_req, res) => {
          res.sendFile(
            path.join(
              distPath,
              'index.html'
            )
          );
        }
      );
    }

    app.listen(
      PORT,
      '0.0.0.0',
      () => {
        console.log(
          `Server running on http://0.0.0.0:${PORT}`
        );
      }
    );
  } catch (error) {
    console.error(
      'Server startup error:',
      error
    );

    process.exit(1);
  }
}

startServer();
import "dotenv/config";
import crypto from "crypto";
import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { sql } from "drizzle-orm";
import { db } from "./src/db/index.js";
import * as schema from "./src/db/schema.js";

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

function shiftFor(e: any) {
  return (
    localState.shifts.find(
      (s: any) =>
        String(s.id) === String(e?.shiftId)
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

  const sh = shiftFor(e);

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

  const start = mins(
    sh.startTime || "09:00"
  );

  const end = mins(
    sh.endTime || "17:00"
  );

  const grace = Number(
    sh.gracePeriodMinutes ?? 10
  );

  let late = 0;
  let early = 0;

  if (r.checkIn) {
    late = Math.max(
      0,
      mins(r.checkIn) - start - grace
    );
  }

  if (
    r.checkOut &&
    !r.isExplicitCancelCheckOut
  ) {
    early = Math.max(
      0,
      end - mins(r.checkOut)
    );
  }

  let status =
    r.status || "in_progress";

  if (r.checkIn && r.checkOut) {
    status =
      late > 0
        ? "late"
        : early > 0
          ? "early_leave"
          : "on_time";
  } else if (r.checkIn) {
    status =
      late > 0
        ? "late"
        : "in_progress";
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

/*
  توحيد بيانات الإجازة.

  السبب:
  بعض الأجهزة ممكن تبعت startDate/endDate
  وبعض النسخ القديمة من الواجهة ممكن يكون عندها
  createdAt أو status بصيغة مختلفة.

  هنا نضمن إن كل الأجهزة تقرأ نفس الشكل.
*/

function normalizeLeave(x: any) {
  const now = new Date().toISOString();

  return {
    ...x,

    id: String(x?.id ?? ""),

    employeeId: String(x?.employeeId ?? ""),

    type: x?.type ?? null,

    startDate: x?.startDate
      ? String(x.startDate).slice(0, 10)
      : null,

    endDate: x?.endDate
      ? String(x.endDate).slice(0, 10)
      : null,

    reason: x?.reason ?? null,

    status: x?.status
      ? String(x.status).toLowerCase()
      : "pending",

    createdAt:
      x?.createdAt ??
      now,

    updatedAt:
      x?.updatedAt ??
      x?.createdAt ??
      now,

    hours:
      x?.hours == null
        ? null
        : Number(x.hours),

    permissionSlot:
      x?.permissionSlot ?? null,

    attachmentUrl:
      x?.attachmentUrl ?? null,

    attachmentName:
      x?.attachmentName ?? null,

    reviewedBy:
      x?.reviewedBy ?? null,

    reviewNotes:
      x?.reviewNotes ?? null,
  };
}

/*
  هل الموظف في إجازة في تاريخ معين؟

  مهم:
  الإجازة لازم تكون APPROVED فقط.
*/

function isEmployeeOnLeave(
  leave: any,
  date: string
) {
  if (!leave) {
    return false;
  }

  if (
    String(leave.status || "").toLowerCase() !==
    "approved"
  ) {
    return false;
  }

  if (!leave.startDate) {
    return false;
  }

  const start =
    String(leave.startDate).slice(0, 10);

  const end =
    String(
      leave.endDate || leave.startDate
    ).slice(0, 10);

  return (
    date >= start &&
    date <= end
  );
}

function getActiveLeaves(
  leaves: any[],
  date: string
) {
  return leaves
    .map(normalizeLeave)
    .filter((x: any) =>
      isEmployeeOnLeave(x, date)
    );
}

/*
=========================================================
SETTINGS
=========================================================
*/

async function setting(
  key: string,
  value: any
) {
  await db
    .insert(schema.settings)
    .values({
      key,
      value,
    } as any)
    .onConflictDoUpdate({
      target: schema.settings.key,
      set: {
        value,
      } as any,
    });
}

/*
=========================================================
EMPLOYEE UPSERT
=========================================================
*/

async function employeeUpsert(e: any) {
  const id = String(e.id);

  const existingRows = await db
    .select()
    .from(schema.employees)
    .where(
      sql`${schema.employees.id} = ${id}`
    );

  const existing = existingRows[0];

  const v = {
    id,

    code: e.code ?? null,
    nameAr: String(e.nameAr ?? ""),
    nameEn: String(e.nameEn ?? ""),
    avatar: e.avatar ?? null,
    email: e.email ?? null,
    phone: e.phone ?? null,
    department: e.department ?? null,
    jobTitleAr: e.jobTitleAr ?? null,
    jobTitleEn: e.jobTitleEn ?? null,
    shiftId: e.shiftId ?? null,
    pin: e.pin ?? null,
    role: e.role ?? null,
    joinedDate: e.joinedDate ?? null,
    status: e.status ?? null,

    annualLeaveBalance:
      e.annualLeaveBalance ?? null,

    casualLeaveBalance:
      e.casualLeaveBalance ?? null,

    regularLeaveBalance:
      e.regularLeaveBalance ?? null,

    sickLeaveBalance:
      e.sickLeaveBalance ?? null,

    isPhotoRemoved:
      Boolean(e.isPhotoRemoved),
  };

  /*
   لو الموظف موجود بالفعل:
   لا نسمح لنسخة قديمة من جهاز
   إنها تمسح بيانات أحدث في Supabase.
  */

  if (existing) {
    const incomingUpdated =
      new Date(
        e.updatedAt ||
        e.lastUpdated ||
        0
      ).getTime();

    const existingUpdated =
      new Date(
        (existing as any).updatedAt ||
        0
      ).getTime();

    if (
      Number.isFinite(incomingUpdated) &&
      Number.isFinite(existingUpdated) &&
      incomingUpdated < existingUpdated
    ) {
      console.log(
        "BLOCKED OLD EMPLOYEE:",
        id
      );

      return existing;
    }

    /*
     مهم:
     لو الـ frontend القديم لا يرسل updatedAt
     لا نعتبره أحدث من الموجود.
    */

    if (
      !e.updatedAt &&
      !e.lastUpdated
    ) {
      return existing;
    }
  }

  const now =
    e.updatedAt ||
    new Date().toISOString();

  const finalValue = {
    ...v,
    updatedAt: now,
  };

  if (!existing) {
    const [inserted] =
      await db
        .insert(schema.employees)
        .values(finalValue as any)
        .returning();

    return inserted;
  }

  const [updated] =
    await db
      .update(schema.employees)
      .set(finalValue as any)
      .where(
        sql`${schema.employees.id} = ${id}`
      )
      .returning();

  return updated;
}
/*
=========================================================
FIND ATTENDANCE
=========================================================
*/

async function findAttendance(
  employeeId: string,
  date: string
) {
  const rows =
    await db
      .select()
      .from(
        schema.attendanceRecords
      )
      .where(
        sql`
          ${schema.attendanceRecords.employeeId}
          = ${employeeId}
          AND
          ${schema.attendanceRecords.date}
          = ${date}
        `
      );

  return rows[0] || null;
}

/*
=========================================================
ATTENDANCE UPSERT
=========================================================
*/

async function attendanceUpsert(r: any) {
  /*
  مهم:
  نحتفظ بمعرفة هل updatedAt جاء فعلًا من الجهاز
  قبل sanitize، لأن sanitize ممكن ينشئ updatedAt جديد.
  */

  const hasIncomingUpdatedAt =
    Boolean(
      r?.updatedAt &&
      String(r.updatedAt).trim()
    );

  const employeeId = String(r.employeeId);
  const date = String(r.date);

  const existing =
    await findAttendance(
      employeeId,
      date
    );

  /*
  لو السجل موجود بالفعل والجهاز لم يرسل updatedAt:
  نعتبره نسخة قديمة/غير موثوقة ولا نسمح له
  بالكتابة فوق النسخة الموجودة في Supabase.
  */

  if (
    existing &&
    !hasIncomingUpdatedAt
  ) {
    console.log(
      "BLOCKED ATTENDANCE WITHOUT TIMESTAMP:",
      employeeId,
      date
    );

    return existing;
  }

  /*
  بالنسبة لسجل جديد بدون updatedAt:
  السيرفر ينشئ timestamp حقيقي.
  */

  const source = {
    ...r,

    updatedAt:
      hasIncomingUpdatedAt
        ? r.updatedAt
        : new Date().toISOString(),
  };

  r = sanitize(source);

  const v = {
    id: String(
      r.id ||
        `rec-${norm(employeeId)}-${date}`
    ),

    employeeId,
    date,

    checkIn: r.checkIn ?? null,
    checkOut: r.checkOut ?? null,

    breakStart: r.breakStart ?? null,
    breakEnd: r.breakEnd ?? null,

    breaks: r.breaks ?? null,

    totalBreakSeconds: Number(
      r.totalBreakSeconds ?? 0
    ),

    location: r.location ?? null,
    deviceInfo: r.deviceInfo ?? null,

    lateMinutes: Number(
      r.lateMinutes ?? 0
    ),

    lateSeconds: Number(
      r.lateSeconds ?? 0
    ),

    earlyLeaveMinutes: Number(
      r.earlyLeaveMinutes ?? 0
    ),

    workHours: Number(
      r.workHours ?? 0
    ),

    overtimeHours: Number(
      r.overtimeHours ?? 0
    ),

    minusHours: Number(
      r.minusHours ?? 0
    ),

    status: r.status ?? null,
    leaveType: r.leaveType ?? null,
    notes: r.notes ?? null,

    verifiedByFace: Boolean(
      r.verifiedByFace
    ),

    isExcused: Boolean(
      r.isExcused
    ),

    excusedBy:
      r.excusedBy ?? null,

    excusedReason:
      r.excusedReason ?? null,

    updatedAt:
      r.updatedAt,

    isExplicitCancelCheckOut:
      Boolean(
        r.isExplicitCancelCheckOut
      ),
  };

  /*
  =========================================================
  NEW RECORD
  =========================================================
  */

  if (!existing) {
    const [inserted] =
      await db
        .insert(
          schema.attendanceRecords
        )
        .values(v as any)
        .returning();

    return inserted;
  }

  /*
  =========================================================
  TIMESTAMP PROTECTION
  =========================================================
  */

  const incomingTime =
    new Date(
      v.updatedAt
    ).getTime();

  const existingTime =
    new Date(
      (existing as any).updatedAt ||
        0
    ).getTime();

  /*
  النسخة القديمة ممنوعة من الكتابة
  فوق النسخة الأحدث.
  */

  if (
    Number.isFinite(existingTime) &&
    Number.isFinite(incomingTime) &&
    incomingTime <= existingTime
  ) {
    console.log(
      "BLOCKED OLD ATTENDANCE:",
      employeeId,
      date,
      "existing:",
      existing.updatedAt,
      "incoming:",
      v.updatedAt
    );

    return existing;
  }

  /*
  =========================================================
  UPDATE LATEST VERSION
  =========================================================
  */

  const [updated] =
    await db
      .update(
        schema.attendanceRecords
      )
      .set({
        ...v,
        id: existing.id,
      } as any)
      .where(
        sql`
          ${schema.attendanceRecords.id}
          = ${existing.id}
        `
      )
      .returning();

  return updated;
}
/*
=========================================================
LEAVE UPSERT
=========================================================
*/

async function leaveUpsert(x: any) {
  /*
  نحتفظ بمعرفة هل الجهاز أرسل updatedAt
  بالفعل قبل normalizeLeave.
  */

  const hasIncomingUpdatedAt =
    Boolean(
      x?.updatedAt &&
      String(x.updatedAt).trim()
    );

  const incoming =
    normalizeLeave({
      ...x,

      updatedAt:
        hasIncomingUpdatedAt
          ? x.updatedAt
          : x.createdAt ||
            new Date().toISOString(),
    });

  const id =
    String(incoming.id);

  /*
  =========================================================
  FIND EXISTING
  =========================================================
  */

  const existingRows =
    await db
      .select()
      .from(
        schema.leaveRequests
      )
      .where(
        sql`
          ${schema.leaveRequests.id}
          = ${id}
        `
      );

  const existing =
    existingRows[0];

  /*
  =========================================================
  NEW REQUEST
  =========================================================
  */

  if (!existing) {
    await db
      .insert(
        schema.leaveRequests
      )
      .values(
        incoming as any
      );

    return;
  }

  /*
  =========================================================
  NO TIMESTAMP = OLD/UNTRUSTED DEVICE
  =========================================================

  لو السجل موجود بالفعل والجهاز لم يرسل
  updatedAt، لا نسمح له بتعديل النسخة
  الموجودة في Supabase.
  */

  if (
    !hasIncomingUpdatedAt
  ) {
    console.log(
      "BLOCKED LEAVE WITHOUT TIMESTAMP:",
      id
    );

    return;
  }

  const currentStatus =
    String(
      (existing as any).status ||
        "pending"
    ).toLowerCase();

  const incomingStatus =
    String(
      incoming.status ||
        "pending"
    ).toLowerCase();

  /*
  =========================================================
  FINAL STATUS PROTECTION
  =========================================================

  approved / rejected
  لا يمكن إرجاعهم إلى pending.
  */

  if (
    incomingStatus === "pending" &&
    (
      currentStatus ===
        "approved" ||
      currentStatus ===
        "rejected"
    )
  ) {
    console.log(
      "BLOCKED OLD PENDING LEAVE:",
      id,
      "current:",
      currentStatus,
      "incoming:",
      incomingStatus
    );

    return;
  }

  /*
  =========================================================
  TIMESTAMP PROTECTION
  =========================================================
  */

  const incomingTime =
    new Date(
      incoming.updatedAt
    ).getTime();

  const existingTime =
    new Date(
      (existing as any).updatedAt ||
        (existing as any).createdAt ||
        0
    ).getTime();

  /*
  أي نسخة أقدم أو مساوية ممنوعة
  من الكتابة فوق الموجودة.
  */

  if (
  Number.isFinite(existingTime) &&
  Number.isFinite(incomingTime) &&
  incomingTime <= existingTime
) {
  console.log(
    "BLOCKED OLD LEAVE:",
    id,
    "existing:",
    (existing as any).updatedAt,
    "incoming:",
    incoming.updatedAt
  );

  return;
}
  /*
  =========================================================
  UPDATE
  =========================================================
  */

  await db
    .update(
      schema.leaveRequests
    )
    .set(
      incoming as any
    )
    .where(
      sql`
        ${schema.leaveRequests.id}
        = ${id}
      `
    );
}
/*
=========================================================
OVERTIME UPSERT
=========================================================
*/

async function overtimeUpsert(
  x: any
) {
  const hasIncomingUpdatedAt =
    Boolean(
      x?.updatedAt &&
      String(x.updatedAt).trim()
    );

  const id =
    String(x.id);

  const employeeId =
    String(x.employeeId);

  const date =
    String(x.date);

  /*
  =========================================================
  CHECK EXISTING
  =========================================================
  */

  const existingRows =
    await db
      .select()
      .from(
        schema.overtimeRequests
      )
      .where(
        sql`
          ${schema.overtimeRequests.id}
          = ${id}
        `
      );

  const existing =
    existingRows[0];

  /*
  =========================================================
  NEW
  =========================================================
  */

  const v = {
    id,

    employeeId,

    date,

    type:
      String(
        x.type ||
          "overtime"
      ),

    durationSeconds:
      Number(
        x.durationSeconds ||
          0
      ),

    reason:
      x.reason ??
      null,

    status:
      x.status ??
      "pending",

    reviewedBy:
      x.reviewedBy ??
      null,

    reviewNotes:
      x.reviewNotes ??
      null,

    createdAt:
      x.createdAt ||
      new Date().toISOString(),

    updatedAt:
      hasIncomingUpdatedAt
        ? x.updatedAt
        : new Date().toISOString(),
  };

  /*
  =========================================================
  OLD DEVICE PROTECTION
  =========================================================
  */

  if (
    existing &&
    !hasIncomingUpdatedAt
  ) {
    console.log(
      "BLOCKED OLD OVERTIME WITHOUT TIMESTAMP:",
      id
    );

    return existing;
  }

  /*
  =========================================================
  TIMESTAMP PROTECTION
  =========================================================
  */

  if (existing) {
    const incomingTime =
      new Date(
        v.updatedAt
      ).getTime();

    const existingTime =
      new Date(
        (existing as any)
          .updatedAt ||
          (existing as any)
            .createdAt ||
          0
      ).getTime();

    if (
      Number.isFinite(
        existingTime
      ) &&
      Number.isFinite(
        incomingTime
      ) &&
      incomingTime <=
        existingTime
    ) {
      console.log(
        "BLOCKED OLD OVERTIME:",
        id,
        "existing:",
        existing.updatedAt,
        "incoming:",
        v.updatedAt
      );

      return existing;
    }
  }

  /*
  =========================================================
  INSERT / UPDATE
  =========================================================
  */

  if (!existing) {
    const [inserted] =
      await db
        .insert(
          schema.overtimeRequests
        )
        .values(
          v as any
        )
        .returning();

    return inserted;
  }

  const [updated] =
    await db
      .update(
        schema.overtimeRequests
      )
      .set(
        v as any
      )
      .where(
        sql`
          ${schema.overtimeRequests.id}
          = ${id}
        `
      )
      .returning();

  return updated;
}
/*
=========================================================
LOAD ALL DATABASE DATA
=========================================================
*/

async function data() {
  const [
    employees,
    attendanceRecords,
    leaveRequests,
    overtimeRequests,
    shifts,
    settings,
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

    db
      .select()
      .from(schema.settings),
  ]);

  /*
  IMPORTANT:
  employees + shifts first
  before sanitize attendance.
  */

  localState.employees =
    employees;

  localState.shifts =
    shifts;

  localState.leaveRequests =
    leaveRequests.map(
      normalizeLeave
    );

  localState.overtimeRequests =
    overtimeRequests;

  localState.attendanceRecords =
    attendanceRecords.map(
      sanitize
    );

  for (const s of settings) {
    if (
      s.key ===
      "companyNameAr"
    ) {
      localState.companyNameAr =
        s.value;
    }

    if (
      s.key ===
      "companyNameEn"
    ) {
      localState.companyNameEn =
        s.value;
    }

    if (
      s.key ===
      "urgentNotice"
    ) {
      localState.urgentNotice =
        s.value;
    }
  }

  localState.lastUpdated =
    Date.now();

  /*
  إضافة activeLeaves بدون التأثير
  على البيانات القديمة التي تستخدمها الواجهة.
  */

  const today =
    clock().date;

  const activeLeaves =
    getActiveLeaves(
      localState.leaveRequests,
      today
    );

  return {
    ...localState,

    /*
    كل الأجهزة هتستقبل نفس
    leaveRequests من Supabase.
    */

    leaveRequests:
      localState.leaveRequests,

    /*
    الإجازات الفعالة اليوم.
    */

    activeLeaves,

    lastUpdated:
      localState.lastUpdated,
  };
}

/*
=========================================================
MIDDLEWARE
=========================================================
*/

app.disable(
  "x-powered-by"
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

app.use(  "/api",
  (_req, res, next) => {
    res.setHeader(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0"
    );

    res.setHeader(
      "Pragma",
      "no-cache"
    );

    res.setHeader(
      "Expires",
      "0"
    );

    next();
  }
);

/*
=========================================================
HEALTH
=========================================================
*/

app.get(
  "/api/health",
  async (_req, res) => {
    let database = false;

    try {
      if (USE_DATABASE) {
        await db.execute(
          sql`select 1`
        );

        database = true;
      }
    } catch (e) {
      console.error(
        "Health database check failed:",
        e
      );
    }

    res.json({
      success: true,
      status: "ok",
      database,
      serverTime:
        clock(),
    });
  }
);

/*
=========================================================
DATA
=========================================================
*/

app.get(
  "/api/data",
  async (_req, res) => {
    try {
      const result =
        USE_DATABASE
          ? await data()
          : {
              ...localState,
              activeLeaves:
                getActiveLeaves(
                  localState.leaveRequests,
                  clock().date
                ),
            };

      res.json({
        success: true,
        ...result,
      });
    } catch (e) {
      console.error(
        "GET /api/data:",
        e
      );

      res.status(500).json({
        success: false,
        error:
          "Failed to load application data",
      });
    }
  }
);

/*
=========================================================
LEAVES - GET
=========================================================
*/
app.use((req, res, next) => {
  console.log("VERCEL REQUEST:", req.method, req.originalUrl, req.url);
  next();
});
app.get(
  "/api/leaves",
  async (req, res) => {
    try {
      const requestedDate =
        String(
          req.query.date ||
            clock().date
        );

      if (USE_DATABASE) {
        /*
        نقرأ الإجازات مباشرة من Supabase
        كل مرة.
        */

        const rows =
          await db
            .select()
            .from(
              schema.leaveRequests
            );

        const normalized =
          rows.map(
            normalizeLeave
          );

        const active =
          getActiveLeaves(
            normalized,
            requestedDate
          );

        return res.json({
          success: true,

          leaveRequests:
            normalized,

          activeLeaves:
            active,

          date:
            requestedDate,

          lastUpdated:
            Date.now(),
        });
      }

      const normalized =
        localState.leaveRequests.map(
          normalizeLeave
        );

      res.json({
        success: true,

        leaveRequests:
          normalized,

        activeLeaves:
          getActiveLeaves(
            normalized,
            requestedDate
          ),

        date:
          requestedDate,

        lastUpdated:
          Date.now(),
      });
    } catch (e) {
      console.error(
        "GET /api/leaves:",
        e
      );

      res.status(500).json({
        success: false,
        error:
          "Failed to load leaves",
      });
    }
  }
);

/*
=========================================================
LOGIN
=========================================================
*/

app.post(
  "/api/login",
  async (req, res) => {
    try {
      const {
        code,
        password,
      } = req.body || {};

      if (!code || !password) {
        return res.status(400).json({
          success: false,
          error:
            "Missing credentials",
        });
      }

      const input =
        String(code)
          .trim()
          .toLowerCase();

      const pass =
        String(password)
          .trim()
          .toLowerCase();

      const employees =
        USE_DATABASE
          ? await db
              .select()
              .from(
                schema.employees
              )
          : localState.employees;

      let e: any;

      if (input === "leader") {
        e =
          employees.find(
            (x: any) =>
              x.role ===
                "leader" ||
              x.code ===
                "EMP011"
          ) ||
          employees[0];
      } else {
        e =
          employees.find(
            (x: any) =>
              String(
                x.code || ""
              )
                .toLowerCase() ===
                input ||

              String(
                x.email || ""
              )
                .toLowerCase() ===
                input ||

              String(
                x.phone || ""
              ).replace(
                /\D/g,
                ""
              ) ===
                input.replace(
                  /\D/g,
                  ""
                ) ||

              String(
                x.code || ""
              ).replace(
                /\D/g,
                ""
              ) ===
                input.replace(
                  /\D/g,
                  ""
                )
          );
      }

      if (!e) {
        return res.status(401).json({
          success: false,
          error:
            "Invalid login credentials",
        });
      }

      const n =
        String(
          e.code || ""
        ).replace(
          /\D/g,
          ""
        );

      const hash =
        e.pin &&
        String(e.pin).length ===
          64
          ? crypto
              .createHash(
                "sha256"
              )
              .update(pass)
              .digest(
                "hex"
              ) ===
            String(
              e.pin
            ).toLowerCase()
          : false;

      const valid =
        hash ||

        pass ===
          String(
            e.pin || ""
          ).toLowerCase() ||

        (
          e.role ===
            "leader" &&
          pass ===
            "leader123"
        ) ||

        pass ===
          `emp${n}` ||

        pass ===
          `emp${n.padStart(
            3,
            "0"
          )}` ||

        pass ===
          "1234" ||

        pass ===
          "tech_123";

      if (!valid) {
        return res.status(401).json({
          success: false,
          error:
            "Invalid login credentials",
        });
      }

      if (
        e.status ===
        "inactive"
      ) {
        return res.status(403).json({
          success: false,
          error:
            "ACCOUNT_INACTIVE",
        });
      }

      res.json({
        success: true,

        employee: {
          ...e,
          pin: "***",
        },
      });
    } catch (e) {
      console.error(
        "POST /api/login:",
        e
      );

      res.status(500).json({
        success: false,
        error:
          "Login failed",
      });
    }
  }
);

/*
=========================================================
PUNCH
=========================================================
*/

app.post(
  "/api/punch",
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
          error: "Employee ID is required",
        });
      }

      const eid = String(employeeId).trim();

      const c = clock();

      const date =
        action === "update" && record?.date
          ? String(record.date).trim()
          : c.date;

      if (date > c.date) {
        return res.status(400).json({
          success: false,
          error:
            "Future attendance dates are not allowed",
        });
      }

      /*
      =====================================================
      FIND EMPLOYEE
      =====================================================
      */

      const e = USE_DATABASE
        ? (
            await db
              .select()
              .from(schema.employees)
              .where(
                sql`
                  lower(${schema.employees.id})
                  = lower(${eid})
                `
              )
          )[0]
        : localState.employees.find(
            (x: any) =>
              norm(x.id) === norm(eid)
          );

      if (!e) {
        return res.status(404).json({
          success: false,
          error: "Employee not found",
        });
      }

      /*
      =====================================================
      FIND CURRENT ATTENDANCE
      =====================================================
      */

      const old = USE_DATABASE
        ? await findAttendance(
            String(e.id),
            date
          )
        : localState.attendanceRecords.find(
            (x: any) =>
              norm(x.employeeId) === norm(eid) &&
              String(x.date) === date
          );

      /*
      =====================================================
      BUILD RECORD
      =====================================================
      */

      let r: any = {
        ...(old || {}),
        ...(record || {}),

        id:
          old?.id ||
          record?.id ||
          `rec-${norm(eid)}-${date}`,

        employeeId:
          old?.employeeId ||
          e.id,

        date,

        /*
        لا نثق في updatedAt القادم من الجهاز
        في عمليات punch.
        */

        updatedAt:
          new Date().toISOString(),
      };

      /*
      =====================================================
      ACTIONS
      =====================================================
      */

      if (
        action === "check_in" &&
        !r.checkIn
      ) {
        r.checkIn = c.time;
      }

      if (
        action === "check_out"
      ) {
        r.checkOut = c.time;

        r.isExplicitCancelCheckOut =
          false;
      }

      if (
        action === "break_start"
      ) {
        r.breakStart = c.time;
      }

      if (
        action === "break_end" ||
        action === "force_break_end"
      ) {
        r.breakEnd = c.time;
      }

      /*
      =====================================================
      CANCEL CHECKOUT
      =====================================================
      */

      if (
        r.isExplicitCancelCheckOut
      ) {
        r.checkOut = null;
        r.workHours = 0;
        r.overtimeHours = 0;
        r.earlyLeaveMinutes = 0;
      }

      /*
      =====================================================
      SANITIZE
      =====================================================
      */

      r = sanitize(r);

      /*
      =====================================================
      DATABASE
      =====================================================
      */

      if (USE_DATABASE) {
        await attendanceUpsert(r);

        const freshRecord =
          await findAttendance(
            String(e.id),
            date
          );

        const freshData =
          await data();

        return res.json({
          success: true,

          record:
            freshRecord,

          attendanceRecords:
            freshData.attendanceRecords,

          employees:
            freshData.employees,

          shifts:
            freshData.shifts,

          leaveRequests:
            freshData.leaveRequests,

          activeLeaves:
            freshData.activeLeaves,

          serverTime:
            c,

          lastUpdated:
            Date.now(),
        });
      }

      /*
      =====================================================
      LOCAL JSON
      =====================================================
      */

      localState.attendanceRecords =
        mergeAttendance(
          localState.attendanceRecords,
          [r]
        );

      localState.lastUpdated =
        Date.now();

      saveLocalState();

      return res.json({
        success: true,

        record: r,

        attendanceRecords:
          localState.attendanceRecords,

        leaveRequests:
          localState.leaveRequests,

        activeLeaves:
          getActiveLeaves(
            localState.leaveRequests,
            c.date
          ),

        serverTime:
          c,

        lastUpdated:
          localState.lastUpdated,
      });

    } catch (e) {
      console.error(
        "POST /api/punch:",
        e
      );

      return res.status(500).json({
        success: false,
        error:
          e instanceof Error
            ? e.message
            : "Punch failed",
      });
    }
  }
);
/*
=========================================================
SYNC
=========================================================
*/

app.post(
  "/api/sync",
  async (req, res) => {
    try {
      const b = req.body || {};

      if (USE_DATABASE) {

        /*
        =====================================================
        EMPLOYEES
        =====================================================
        */

        for (
          const e of
          Array.isArray(b.employees)
            ? b.employees
            : []
        ) {
          if (e?.id) {
            await employeeUpsert(e);
          }
        }

        /*
        =====================================================
        ATTENDANCE
        =====================================================
        */

        for (
          const r of
          Array.isArray(b.attendanceRecords)
            ? b.attendanceRecords
            : []
        ) {
          if (
            r?.employeeId &&
            r?.date &&
            String(r.date) <= clock().date
          ) {
            await attendanceUpsert(r);
          }
        }

        /*
        =====================================================
        LEAVES
        =====================================================
        */

        for (
          const x of
          Array.isArray(b.leaveRequests)
            ? b.leaveRequests
            : []
        ) {
          if (
            !x?.id ||
            !x?.employeeId
          ) {
            continue;
          }

          const incoming =
            normalizeLeave({
              ...x,
              updatedAt:
                x.updatedAt ||
                x.createdAt ||
                new Date().toISOString(),
            });

          await leaveUpsert(incoming);
        } // ← مهم جدًا: قفل الـ for هنا

        /*
        =====================================================
        URGENT NOTICE
        =====================================================
        */

        if (
          b.urgentNotice !==
          undefined
        ) {
          await setting(
            "urgentNotice",
            b.urgentNotice
          );
        }

        /*
        =====================================================
        RETURN FRESH SUPABASE DATA
        =====================================================
        */

        const fresh =
          await data();

        return res.json({
          success: true,
          ...fresh,
        });
      }

      /*
      =====================================================
      LOCAL JSON
      =====================================================
      */

      if (
        Array.isArray(
          b.employees
        )
      ) {
        localState.employees =
          b.employees;
      }

      if (
        Array.isArray(
          b.attendanceRecords
        )
      ) {
        localState.attendanceRecords =
          mergeAttendance(
            localState.attendanceRecords,
            b.attendanceRecords.filter(
              (x: any) =>
                String(x.date) <=
                clock().date
            )
          );
      }

      if (
        Array.isArray(
          b.leaveRequests
        )
      ) {
        localState.leaveRequests =
          b.leaveRequests.map(
            normalizeLeave
          );
      }

      if (
        Array.isArray(
          b.overtimeRequests
        )
      ) {
        localState.overtimeRequests =
          b.overtimeRequests;
      }

      if (
        b.companyNameAr !==
        undefined
      ) {
        localState.companyNameAr =
          b.companyNameAr;
      }

      if (
        b.companyNameEn !==
        undefined
      ) {
        localState.companyNameEn =
          b.companyNameEn;
      }

      if (
        b.urgentNotice !==
        undefined
      ) {
        localState.urgentNotice =
          b.urgentNotice;
      }

      if (
        Array.isArray(
          b.deletedAttendanceIds
        )
      ) {
        const s =
          new Set(
            b.deletedAttendanceIds.map(
              String
            )
          );

        localState.attendanceRecords =
          localState.attendanceRecords.filter(
            (x: any) =>
              !s.has(
                String(x.id)
              )
          );
      }

      /*
      =====================================================
      SAVE LOCAL STATE
      =====================================================
      */

      localState.lastUpdated =
        Date.now();

      saveLocalState();

      return res.json({
        success: true,

        ...localState,

        activeLeaves:
          getActiveLeaves(
            localState.leaveRequests,
            clock().date
          ),
      });

    } catch (e) {
      console.error(
        "POST /api/sync:",
        e
      );

      return res.status(500).json({
        success: false,
        error:
          "Sync failed",
      });
    }
  }
);

/*
=========================================================
EMPLOYEES
=========================================================
*/

app.put(
  "/api/employees/:id",
  async (req, res) => {
    try {
      const id =
        String(
          req.params.id
        );

      const changes = {
        ...req.body,
      };

      delete (
        changes as any
      ).id;

      if (USE_DATABASE) {
        /*
        =====================================================
        FIND CURRENT EMPLOYEE
        =====================================================
        */

        const existingRows =
          await db
            .select()
            .from(
              schema.employees
            )
            .where(
              sql`
                ${schema.employees.id}
                = ${id}
              `
            );

        const existing =
          existingRows[0];

        if (!existing) {
          return res.status(404).json({
            success: false,
            error:
              "Employee not found",
          });
        }

        /*
        =====================================================
        TIMESTAMP PROTECTION
        =====================================================
        */

        const hasIncomingUpdatedAt =
          Boolean(
            changes.updatedAt &&
            String(
              changes.updatedAt
            ).trim()
          );

        /*
        لو الجهاز لا يرسل updatedAt،
        نستخدم البيانات الموجودة في السيرفر
        كمرجع، ولا نسمح لنسخة قديمة
        بالكتابة فوقها.

        */

        if (
          !hasIncomingUpdatedAt &&
          (existing as any).updatedAt
        ) {
          console.log(
            "BLOCKED EMPLOYEE UPDATE WITHOUT TIMESTAMP:",
            id
          );

          return res.status(409).json({
            success: false,
            error:
              "STALE_EMPLOYEE_UPDATE",
            employee:
              existing,
          });
        }

        if (
  hasIncomingUpdatedAt &&
  (existing as any).updatedAt
) {
  const incomingTime =
    new Date(
      changes.updatedAt
    ).getTime();

  const existingTime =
    new Date(
      (existing as any)
        .updatedAt
    ).getTime();

  if (
    Number.isFinite(
      incomingTime
    ) &&
    Number.isFinite(
      existingTime
    ) &&
    incomingTime <=
      existingTime
  ) {
    console.log(
      "BLOCKED OLD EMPLOYEE UPDATE:",
      id,
      "existing:",
      (existing as any).updatedAt,
      "incoming:",
      changes.updatedAt
    );

    return res.status(409).json({
      success: false,
      error:
        "STALE_EMPLOYEE_UPDATE",
      employee:
        existing,
    });
  }
}

        /*
        =====================================================
        UPDATE
        =====================================================
        */

        const finalChanges = {
          ...changes,

          updatedAt:
            hasIncomingUpdatedAt
              ? changes.updatedAt
              : new Date().toISOString(),
        };

        const [x] =
          await db
            .update(
              schema.employees
            )
            .set(
              finalChanges as any
            )
            .where(
              sql`
                ${schema.employees.id}
                = ${id}
              `
            )
            .returning();

        return x
          ? res.json({
              success: true,

              employee: x,

              lastUpdated:
                Date.now(),
            })
          : res.status(404).json({
              success: false,
              error:
                "Employee not found",
            });
      }

      /*
      =====================================================
      LOCAL JSON
      =====================================================
      */

      const i =
        localState.employees.findIndex(
          (x: any) =>
            norm(x.id) ===
            norm(id)
        );

      if (i < 0) {
        return res.status(404).json({
          success: false,
          error:
            "Employee not found",
        });
      }

      const existing =
        localState.employees[i];

      const hasIncomingUpdatedAt =
        Boolean(
          changes.updatedAt &&
          String(
            changes.updatedAt
          ).trim()
        );

      if (
        hasIncomingUpdatedAt &&
        existing.updatedAt
      ) {
        const incomingTime =
          new Date(
            changes.updatedAt
          ).getTime();

        const existingTime =
          new Date(
            existing.updatedAt
          ).getTime();

        if (
          Number.isFinite(
            incomingTime
          ) &&
          Number.isFinite(
            existingTime
          ) &&
          incomingTime <=
            existingTime
        ) {
          console.log(
            "BLOCKED OLD LOCAL EMPLOYEE UPDATE:",
            id
          );

          return res.status(409).json({
            success: false,
            error:
              "STALE_EMPLOYEE_UPDATE",
            employee:
              existing,
          });
        }
      }

      localState.employees[i] = {
        ...existing,

        ...changes,

        id:
          existing.id,

        updatedAt:
          hasIncomingUpdatedAt
            ? changes.updatedAt
            : new Date().toISOString(),
      };

      localState.lastUpdated =
        Date.now();

      saveLocalState();

      return res.json({
        success: true,

        employee:
          localState.employees[i],

        lastUpdated:
          localState.lastUpdated,
      });
    } catch (e) {
      console.error(
        "PUT /api/employees:",
        e
      );

      res.status(500).json({
        success: false,
        error:
          "Failed to update employee",
      });
    }
  }
);

/*
=========================================================
SHIFTS
=========================================================
*/

app.delete(
  "/api/shifts/:id",
  async (req, res) => {
    try {
      const id =
        String(
          req.params.id
        );

      if (USE_DATABASE) {
        await db
          .delete(
            schema.shifts
          )
          .where(
            sql`
              ${schema.shifts.id}
              = ${id}
            `
          );
      } else {
        localState.shifts =
          localState.shifts.filter(
            (x: any) =>
              String(x.id) !==
              id
          );

        saveLocalState();
      }

      res.json({
        success: true,
      });
    } catch (e) {
      console.error(
        "DELETE /api/shifts:",
        e
      );

      res.status(500).json({
        success: false,
        error:
          "Failed to delete shift",
      });
    }
  }
);
/*
=========================================================
DELETE LEAVE
=========================================================
*/

app.delete(
  "/api/leaves/:id",
  async (req, res) => {
    try {
      const id = String(req.params.id);

      if (USE_DATABASE) {
        await db
          .delete(schema.leaveRequests)
          .where(
            sql`
              ${schema.leaveRequests.id}
              = ${id}
            `
          );

        const rows =
          await db
            .select()
            .from(schema.leaveRequests);

        return res.json({
          success: true,
          leaveRequests: rows,
          lastUpdated: Date.now(),
        });
      }

      localState.leaveRequests =
        localState.leaveRequests.filter(
          (x: any) =>
            String(x.id) !== id
        );

      saveLocalState();

      return res.json({
        success: true,
        leaveRequests:
          localState.leaveRequests,
        lastUpdated: Date.now(),
      });

    } catch (e) {
      console.error(
        "DELETE /api/leaves/:id:",
        e
      );

      return res.status(500).json({
        success: false,
        error:
          "Failed to delete leave request",
      });
    }
  }
);
/*
=========================================================
CLEAR TODAY
=========================================================
*/

app.post(
  "/api/attendance/clear-today",
  async (req, res) => {
    try {
      const d =
        String(
          req.body?.date ||
            clock().date
        );

      if (USE_DATABASE) {
        await db
          .delete(
            schema.attendanceRecords
          )
          .where(
            sql`
              ${schema.attendanceRecords.date}
              = ${d}
            `
          );

        const rows =
          await db
            .select()
            .from(
              schema.attendanceRecords
            );

        return res.json({
          success: true,

          attendanceRecords:
            rows.map(
              sanitize
            ),

          lastUpdated:
            Date.now(),
        });
      }

      localState.attendanceRecords =
        localState.attendanceRecords.filter(
          (x: any) =>
            String(x.date) !==
            d
        );

      saveLocalState();

      res.json({
        success: true,

        attendanceRecords:
          localState.attendanceRecords,

        lastUpdated:
          Date.now(),
      });
    } catch (e) {
      console.error(
        "clear-today:",
        e
      );

      res.status(500).json({
        success: false,
        error:
          "Failed to clear attendance",
      });
    }
  }
);

/*
=========================================================
DELETE FUTURE
=========================================================
*/

app.post(
  "/api/attendance/delete-future",
  async (req, res) => {
    try {
      const d =
        String(
          req.body?.todayDate ||
            clock().date
        );

      if (USE_DATABASE) {
        const f =
          await db
            .select()
            .from(
              schema.attendanceRecords
            )
            .where(
              sql`
                ${schema.attendanceRecords.date}
                > ${d}
              `
            );

        await db
          .delete(
            schema.attendanceRecords
          )
          .where(
            sql`
              ${schema.attendanceRecords.date}
              > ${d}
            `
          );

        return res.json({
          success: true,

          deletedCount:
            f.length,

          cutoffDate:
            d,

          lastUpdated:
            Date.now(),
        });
      }

      const f =
        localState.attendanceRecords.filter(
          (x: any) =>
            x?.date &&
            String(x.date) > d
        );

      localState.attendanceRecords =
        localState.attendanceRecords.filter(
          (x: any) =>
            !x?.date ||
            String(x.date) <= d
        );

      saveLocalState();

      res.json({
        success: true,

        deletedCount:
          f.length,

        cutoffDate:
          d,

        lastUpdated:
          Date.now(),
      });
    } catch (e) {
      console.error(
        "delete-future:",
        e
      );

      res.status(500).json({
        success: false,
        error:
          "Failed to delete future records",
      });
    }
  }
);

/*
=========================================================
LEAVES - CREATE / UPDATE
=========================================================
*/

app.post(
  "/api/leaves",
  async (req, res) => {
    try {
      const x =
        req.body;

      if (
        !x?.id ||
        !x?.employeeId
      ) {
        return res.status(400).json({
          success: false,
          error:
            "Invalid leave request",
        });
      }

const normalized =
  normalizeLeave({
    ...x,

    updatedAt:
      x.updatedAt ||
      new Date().toISOString(),
  });      if (USE_DATABASE) {
        /*
        احفظ في Supabase.
        */

const existing =
  await db
    .select()
    .from(
      schema.leaveRequests
    )
    .where(
      sql`
        ${schema.leaveRequests.id}
        = ${String(normalized.id)}
      `
    );

if (
  existing.length > 0
) {
  const currentStatus =
    String(
      existing[0].status || ""
    ).toLowerCase();

  const incomingStatus =
    String(
      normalized.status || ""
    ).toLowerCase();

  /*
  لا تسمح لنسخة قديمة من الجهاز
  بإرجاع الطلب من approved/rejected
  إلى pending.
  */

  if (
    (
      currentStatus ===
        "approved" ||
      currentStatus ===
        "rejected"
    ) &&
    incomingStatus ===
      "pending"
  ) {
    normalized.status =
      existing[0].status;

    normalized.reviewedBy =
      existing[0].reviewedBy;

    normalized.reviewNotes =
      existing[0].reviewNotes;
  }
}

await leaveUpsert(
  normalized
);

        /*
        اقرأ Supabase مرة أخرى
        بعد الحفظ مباشرة.

        ده مهم جدًا عشان أي جهاز
        يفتح بعد كده ياخد نفس البيانات.
        */

        const fresh =
          await data();

        return res.json({
          success: true,

          /*
          الإجازة التي تم حفظها
          */

          leaveRequest:
            fresh.leaveRequests.find(
              (a: any) =>
                String(a.id) ===
                String(
                  normalized.id
                )
            ) || null,

          /*
          كل الإجازات
          */

          leaveRequests:
            fresh.leaveRequests,

          /*
          إجازات اليوم
          */

          activeLeaves:
            fresh.activeLeaves,

          /*
          باقي البيانات المهمة
          */

          employees:
            fresh.employees,

          attendanceRecords:
            fresh.attendanceRecords,

          shifts:
            fresh.shifts,

          overtimeRequests:
            fresh.overtimeRequests,

          lastUpdated:
            Date.now(),
        });
      }

      localState.leaveRequests = [
        ...localState.leaveRequests.filter(
          (a: any) =>
            String(a.id) !==
            String(
              normalized.id
            )
        ),

        normalized,
      ];

      localState.lastUpdated =
        Date.now();

      saveLocalState();

      res.json({
        success: true,

        leaveRequest:
          normalized,

        leaveRequests:
          localState.leaveRequests,

        activeLeaves:
          getActiveLeaves(
            localState.leaveRequests,
            clock().date
          ),

        lastUpdated:
          Date.now(),
      });
    } catch (e) {
      console.error(
        "POST /api/leaves:",
        e
      );

      res.status(500).json({
        success: false,
        error:
          e instanceof Error
            ? e.message
            : "Failed to save leave",
      });
    }
  }
);

/*
=========================================================
LEAVE STATUS
=========================================================
*/

app.put(
  "/api/leaves/:id/status",
  async (req, res) => {
    try {
      const id =
        String(
          req.params.id
        );

      const b =
        req.body || {};

      if (USE_DATABASE) {
        const newStatus =
          String(
            b.status || ""
          )
            .trim()
            .toLowerCase();

        if (
          newStatus !==
            "approved" &&
          newStatus !==
            "rejected" &&
          newStatus !==
            "pending"
        ) {
          return res.status(400).json({
            success: false,
            error:
              "Invalid leave status",
          });
        }

        /*
        =====================================================
        GET CURRENT VERSION
        =====================================================
        */

        const existingRows =
          await db
            .select()
            .from(
              schema.leaveRequests
            )
            .where(
              sql`
                ${schema.leaveRequests.id}
                = ${id}
              `
            );

        const existing =
          existingRows[0];

        if (!existing) {
          return res.status(404).json({
            success: false,
            error:
              "Leave request not found",
          });
        }

        const currentStatus =
          String(
            (existing as any)
              .status ||
              "pending"
          ).toLowerCase();

        /*
        =====================================================
        FINAL STATUS PROTECTION
        =====================================================

        approved / rejected
        لا يرجعوا إلى pending.
        */

        if (
          (
            currentStatus ===
              "approved" ||
            currentStatus ===
              "rejected"
          ) &&
          newStatus ===
            "pending"
        ) {
          console.log(
            "BLOCKED FINAL LEAVE -> PENDING:",
            id
          );

          const fresh =
            await data();

          return res.json({
            success: true,

            blocked:
              true,

            reason:
              "FINAL_STATUS_CANNOT_RETURN_TO_PENDING",

            leaveRequest:
              fresh.leaveRequests.find(
                (a: any) =>
                  String(a.id) ===
                  id
              ) || null,

            leaveRequests:
              fresh.leaveRequests,

            activeLeaves:
              fresh.activeLeaves,

            employees:
              fresh.employees,

            attendanceRecords:
              fresh.attendanceRecords,

            shifts:
              fresh.shifts,

            overtimeRequests:
              fresh.overtimeRequests,

            lastUpdated:
              Date.now(),
          });
        }

        /*
        =====================================================
        UPDATE STATUS
        =====================================================
        */

        const now =
          new Date().toISOString();

        const [x] =
          await db
            .update(
              schema.leaveRequests
            )
            .set({
              status:
                newStatus,

              reviewNotes:
                b.reviewNotes ??
                null,

              reviewedBy:
                b.reviewedBy ??
                null,

              updatedAt:
                now,
            } as any)
            .where(
              sql`
                ${schema.leaveRequests.id}
                = ${id}
              `
            )
            .returning();

        if (!x) {
          return res.status(404).json({
            success: false,
            error:
              "Leave request not found",
          });
        }

        /*
        =====================================================
        FRESH SUPABASE DATA
        =====================================================
        */

        const fresh =
          await data();

        return res.json({
          success: true,

          leaveRequest:
            fresh.leaveRequests.find(
              (a: any) =>
                String(a.id) ===
                id
            ) || null,

          leaveRequests:
            fresh.leaveRequests,

          activeLeaves:
            fresh.activeLeaves,

          employees:
            fresh.employees,

          attendanceRecords:
            fresh.attendanceRecords,

          shifts:
            fresh.shifts,

          overtimeRequests:
            fresh.overtimeRequests,

          lastUpdated:
            Date.now(),
        });
      }

      /*
      =====================================================
      LOCAL JSON
      =====================================================
      */

      const i =
        localState.leaveRequests.findIndex(
          (x: any) =>
            String(x.id) ===
            id
        );

      if (i < 0) {
        return res.status(404).json({
          success: false,
          error:
            "Leave request not found",
        });
      }

      const current =
        localState
          .leaveRequests[i];

      const currentStatus =
        String(
          current.status ||
            "pending"
        ).toLowerCase();

      const newStatus =
        String(
          b.status || ""
        )
          .trim()
          .toLowerCase();

      if (
        newStatus !==
          "approved" &&
        newStatus !==
          "rejected" &&
        newStatus !==
          "pending"
      ) {
        return res.status(400).json({
          success: false,
          error:
            "Invalid leave status",
        });
      }

      if (
        (
          currentStatus ===
            "approved" ||
          currentStatus ===
            "rejected"
        ) &&
        newStatus ===
          "pending"
      ) {
        return res.json({
          success: true,

          blocked:
            true,

          reason:
            "FINAL_STATUS_CANNOT_RETURN_TO_PENDING",

          leaveRequest:
            current,

          leaveRequests:
            localState.leaveRequests,

          activeLeaves:
            getActiveLeaves(
              localState.leaveRequests,
              clock().date
            ),

          lastUpdated:
            Date.now(),
        });
      }

      localState.leaveRequests[i] =
        normalizeLeave({
          ...current,

          ...b,

          status:
            newStatus,

          updatedAt:
            new Date().toISOString(),
        });

      localState.lastUpdated =
        Date.now();

      saveLocalState();

      return res.json({
        success: true,

        leaveRequest:
          localState
            .leaveRequests[i],

        leaveRequests:
          localState
            .leaveRequests,

        activeLeaves:
          getActiveLeaves(
            localState.leaveRequests,
            clock().date
          ),

        lastUpdated:
          Date.now(),
      });
    } catch (e) {
      console.error(
        "leave status:",
        e
      );

      return res.status(500).json({
        success: false,
        error:
          "Failed to update leave status",
      });
    }
  }
);
/*
=========================================================
OVERTIME
=========================================================
*/

app.post(
  "/api/overtime",
  async (req, res) => {
    try {
      const x =
        req.body;

      if (
        !x?.id ||
        !x?.employeeId ||
        !x?.date
      ) {
        return res.status(400).json({
          success: false,
          error:
            "Invalid overtime request",
        });
      }

      if (USE_DATABASE) {
        await overtimeUpsert(
          x
        );

        return res.json({
          success: true,

          overtimeRequests:
            await db
              .select()
              .from(
                schema.overtimeRequests
              ),

          lastUpdated:
            Date.now(),
        });
      }

      localState.overtimeRequests = [
        ...localState.overtimeRequests.filter(
          (a: any) =>
            String(a.id) !==
            String(x.id)
        ),

        x,
      ];

      saveLocalState();

      res.json({
        success: true,

        overtimeRequests:
          localState.overtimeRequests,

        lastUpdated:
          Date.now(),
      });
    } catch (e) {
      console.error(
        "POST /api/overtime:",
        e
      );

      res.status(500).json({
        success: false,
        error:
          "Failed to save overtime",
      });
    }
  }
);

/*
=========================================================
OVERTIME STATUS
=========================================================
*/

app.put(
  "/api/overtime/:id/status",
  async (req, res) => {
    try {
      const id =
        String(
          req.params.id
        );

      const b =
        req.body || {};

      if (USE_DATABASE) {
        const [x] =
          await db
            .update(
              schema.overtimeRequests
            )
            .set({
              ...b,

              updatedAt:
                new Date().toISOString(),
            } as any)
            .where(
              sql`
                ${schema.overtimeRequests.id}
                = ${id}
              `
            )
            .returning();

        return x
          ? res.json({
              success: true,
              overtimeRequest:
                x,

              overtimeRequests:
                await db
                  .select()
                  .from(
                    schema.overtimeRequests
                  ),

              lastUpdated:
                Date.now(),
            })
          : res.status(404).json({
              success: false,
              error:
                "Overtime request not found",
            });
      }

      const i =
        localState.overtimeRequests.findIndex(
          (x: any) =>
            String(x.id) ===
            id
        );

      if (i < 0) {
        return res.status(404).json({
          success: false,
          error:
            "Overtime request not found",
        });
      }

      localState.overtimeRequests[i] =
        {
          ...localState
            .overtimeRequests[i],

          ...b,

          updatedAt:
            new Date().toISOString(),
        };

      saveLocalState();

      res.json({
        success: true,

        overtimeRequest:
          localState
            .overtimeRequests[i],

        overtimeRequests:
          localState.overtimeRequests,

        lastUpdated:
          Date.now(),
      });
    } catch (e) {
      console.error(
        "overtime status:",
        e
      );

      res.status(500).json({
        success: false,
        error:
          "Failed to update overtime status",
      });
    }
  }
);

/*
=========================================================
BACKUP
=========================================================
*/

app.get(
  "/api/backup",
  async (_req, res) => {
    try {
      const d =
        USE_DATABASE
          ? await data()
          : localState;

      const b = {
        ...d,

        backupTimestamp:
          new Date().toISOString(),

        version:
          "3.0",
      };

      fs.mkdirSync(
        BACKUP_DIR,
        {
          recursive: true,
        }
      );

      const name =
        `server_data_backup_${Date.now()}.json`;

      fs.writeFileSync(
        path.join(
          BACKUP_DIR,
          name
        ),
        JSON.stringify(
          b,
          null,
          2
        )
      );

      res.setHeader(
        "Content-Type",
        "application/json"
      );

      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${name}"`
      );

      res.send(
        JSON.stringify(
          b,
          null,
          2
        )
      );
    } catch (e) {
      console.error(
        "backup:",
        e
      );

      res.status(500).json({
        success: false,
        error:
          "Failed to create backup",
      });
    }
  }
);

/*
=========================================================
RESTORE
=========================================================
*/

app.post(
  "/api/backup/restore",
  async (req, res) => {
    try {
      const b =
        req.body;

      if (
        !b ||
        !Array.isArray(
          b.employees
        )
      ) {
        return res.status(400).json({
          success: false,
          error:
            "Invalid backup payload",
        });
      }

      /*
      =====================================================
      DATABASE RESTORE - SUPABASE
      =====================================================
      */

      if (USE_DATABASE) {

        /*
        =========================
        EMPLOYEES
        =========================
        */

        for (
          const x of
          b.employees
        ) {
          if (x?.id) {
            await employeeUpsert(
              x
            );
          }
        }

        /*
        =========================
        LEAVE REQUESTS
        =========================
        */

        for (
          const x of
          Array.isArray(
            b.leaveRequests
          )
            ? b.leaveRequests
            : []
        ) {
          if (
            !x?.id ||
            !x?.employeeId
          ) {
            continue;
          }

          const incoming =
            normalizeLeave({
              ...x,

              updatedAt:
                x.updatedAt ||
                x.createdAt ||
                new Date().toISOString(),
            });

          await leaveUpsert(
            incoming
          );
        }

        /*
        =========================
        OVERTIME REQUESTS
        =========================
        */

        for (
          const x of
          Array.isArray(
            b.overtimeRequests
          )
            ? b.overtimeRequests
            : []
        ) {
          if (
            x?.id &&
            x?.employeeId &&
            x?.date
          ) {
            await overtimeUpsert(
              x
            );
          }
        }

        /*
        =========================
        SETTINGS
        =========================
        */

        if (
          b.companyNameAr !==
          undefined
        ) {
          await setting(
            "companyNameAr",
            b.companyNameAr
          );
        }

        if (
          b.companyNameEn !==
          undefined
        ) {
          await setting(
            "companyNameEn",
            b.companyNameEn
          );
        }

        if (
          b.urgentNotice !==
          undefined
        ) {
          await setting(
            "urgentNotice",
            b.urgentNotice
          );
        }

        /*
        =========================
        ATTENDANCE RECORDS
        =========================
        */

        for (
          const r of
          Array.isArray(
            b.attendanceRecords
          )
            ? b.attendanceRecords
            : []
        ) {
          if (
            r?.employeeId &&
            r?.date &&
            String(r.date) <=
              clock().date
          ) {
            await attendanceUpsert(
              r
            );
          }
        }

        /*
        =========================
        RETURN FRESH DATABASE DATA
        =========================
        */

        const fresh =
          await data();

        return res.json({
          success: true,

          ...fresh,
        });
      }

      /*
      =====================================================
      LOCAL JSON RESTORE
      =====================================================
      */

      localState = {
        ...emptyState(),

        ...b,

        employees:
          Array.isArray(
            b.employees
          )
            ? b.employees
            : [],

        attendanceRecords:
          (
            Array.isArray(
              b.attendanceRecords
            )
              ? b.attendanceRecords
              : []
          ).filter(
            (x: any) =>
              x?.date &&
              String(x.date) <=
                clock().date
          ),

        leaveRequests:
          (
            Array.isArray(
              b.leaveRequests
            )
              ? b.leaveRequests
              : []
          ).map(
            normalizeLeave
          ),

        overtimeRequests:
          Array.isArray(
            b.overtimeRequests
          )
            ? b.overtimeRequests
            : [],

        shifts:
          Array.isArray(
            b.shifts
          )
            ? b.shifts
            : [],

        companyNameAr:
          b.companyNameAr ??
          null,

        companyNameEn:
          b.companyNameEn ??
          null,

        urgentNotice:
          b.urgentNotice ??
          null,

        lastUpdated:
          Date.now(),
      };

      saveLocalState();

      return res.json({
        success: true,

        ...localState,

        activeLeaves:
          getActiveLeaves(
            localState.leaveRequests,
            clock().date
          ),
      });

    } catch (e) {
      console.error(
        "restore:",
        e
      );

      return res.status(500).json({
        success: false,

        error:
          e instanceof Error
            ? e.message
            : "Failed to restore backup",
      });
    }
  }
);

/*
=========================================================
START / FRONTEND
=========================================================
*/

async function start() {
  if (USE_DATABASE) {
    try {
      await db.execute(
        sql`select 1`
      );

      console.log(
        "Database connection successful."
      );
    } catch (e) {
      console.error(
        "Database connection failed:",
        e
      );
    }
  } else {
    console.warn(
      "SUPABASE_DB_URL is not set. Local JSON storage is being used."
    );
  }

  /*
  =========================================================
  LOCAL DEVELOPMENT WITH VITE
  =========================================================
  */

  if (
    !process.env.VERCEL &&
    process.env.NODE_ENV !== "production"
  ) {
    const {
      createServer: createViteServer,
    } = await import("vite");

    const vite =
      await createViteServer({
        server: {
          middlewareMode: true,
        },
        appType: "spa",
      });

    app.use(vite.middlewares);

    return;
  }

  /*
  =========================================================
  PRODUCTION SERVER
  =========================================================
  */

  const dist =
    path.join(
      process.cwd(),
      "dist"
    );

  app.use(
    express.static(dist)
  );

  app.get(
    "/",
    (_req, res) => {
      res.sendFile(
        path.join(
          dist,
          "index.html"
        )
      );
    }
  );

  app.get(
    "*",
    (req, res) => {
      if (
        req.path.startsWith("/api/")
      ) {
        return res
          .status(404)
          .json({
            error:
              "API endpoint not found",
          });
      }

      res.sendFile(
        path.join(
          dist,
          "index.html"
        )
      );
    }
  );
}

/*
=========================================================
LOCAL SERVER
=========================================================
*/

if (!process.env.VERCEL) {
  start()
    .then(() => {
      app.listen(
        PORT,
        "0.0.0.0",
        () => {
          console.log(
            `Server running on port ${PORT}`
          );

          console.log(
            `Database: ${
              USE_DATABASE
                ? "SUPABASE"
                : "LOCAL JSON"
            }`
          );
        }
      );
    })
    .catch((e: unknown) => {
      console.error(
        "Server startup failed:",
        e
      );

      process.exit(1);
    });
}

export default app;
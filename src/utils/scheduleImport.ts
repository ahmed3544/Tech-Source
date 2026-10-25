import { Employee, Language, Shift } from '../types';
import { ScheduleBreak } from './scheduleStatus';

/**
 * Excel → schedule import (round-trip of the weekly export format).
 *
 * Accepts the "Weekly Schedule / جدول أسبوعي" sheet produced by
 * src/utils/scheduleExport.ts:
 *   [Code, Employee, (Day dd/mm, Day Breaks) * 7]
 * Cells: "ShiftName\nHH:MM–HH:MM", "OFF — راحة أسبوعية",
 * "HOLIDAY — عطلة رسمية: ...", "ANNUAL LEAVE — إجازة سنوية",
 * "غير مُعيّن / Unassigned", breaks "HH:MM–HH:MM, HH:MM–HH:MM".
 *
 * Also tolerates generic sheets as long as header cells carry a date
 * (dd/mm, dd/mm/yyyy, yyyy-mm-dd) or a weekday name — all resolved
 * against the currently displayed week (import applies to what you see).
 */

export interface ImportContext {
  employees: Employee[];
  shifts: Shift[];
  /** The 7 date keys (YYYY-MM-DD) of the displayed week. */
  weekDateKeys: string[];
  lang: Language;
}

export interface ImportAssignmentRow {
  employeeId: string;
  date: string;
  shiftId: string;
  isOffDay: boolean;
  status: '' | 'OFF' | 'HOLIDAY' | 'ANNUAL';
  clear: boolean;
}

export interface ImportBreakEntry {
  employeeId: string;
  date: string;
  breaks: ScheduleBreak[];
}

export interface ImportPreview {
  assignments: ImportAssignmentRow[];
  breaks: ImportBreakEntry[];
  /** Unique employees referenced by the parsed rows. */
  employeeCount: number;
  /** Date keys that had at least one parsed cell. */
  matchedDates: string[];
  /** Human-readable problems: unmatched shift names, skipped rows… */
  warnings: string[];
}

const DAY_NAMES_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const DAY_NAMES_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const pad = (n: number) => String(n).padStart(2, '0');
const norm = (x: unknown) => String(x ?? '').replace(/\s+/g, ' ').trim();
const normLower = (x: unknown) => norm(x).toLowerCase();

const normalizeTime = (value: string): string => {
  const m = String(value).trim().match(/^(\d{1,2})[:.](\d{2})$/);
  if (!m) return '';
  return `${pad(Number(m[1]))}:${m[2]}`;
};

const TIME_RANGE_RE = /(\d{1,2}[:.]\d{2})\s*[–\-—ـ]\s*(\d{1,2}[:.]\d{2})/g;

/** "25/10" → "MM-DD"; "25/10/2027" → "YYYY-MM-DD"; "2026-10-25" → "YYYY-MM-DD" */
const dateFromHeader = (header: string): string => {
  const iso = header.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = header.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
  if (dmy) {
    const month = pad(Number(dmy[2]));
    const day = pad(Number(dmy[1]));
    if (dmy[3]) {
      const year = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
      return `${year}-${month}-${day}`;
    }
    return `${month}-${day}`;
  }
  return '';
};

const weekdayFromHeader = (header: string): number => {
  const lower = header.toLowerCase();
  const arIdx = DAY_NAMES_AR.findIndex((d) => header.includes(d));
  if (arIdx >= 0) return arIdx;
  const enIdx = DAY_NAMES_EN.findIndex((d) => lower.includes(d.toLowerCase().slice(0, 3)));
  return enIdx;
};

const matchShift = (text: string, shifts: Shift[]): Shift | undefined => {
  if (!shifts.length) return undefined;
  TIME_RANGE_RE.lastIndex = 0;
  const range = TIME_RANGE_RE.exec(text);
  const start = range ? normalizeTime(range[1]) : '';
  const end = range ? normalizeTime(range[2]) : '';
  const namePart = norm(text.replace(range ? range[0] : '', ' ').replace(TIME_RANGE_RE, ' '));
  const byName = shifts.find((s) => {
    const candidates = [s.name, s.nameAr, s.nameEn].map(normLower).filter(Boolean);
    return candidates.some((c) => c && (c === namePart.toLowerCase() || (namePart.length >= 3 && (namePart.toLowerCase().includes(c) || c.includes(namePart.toLowerCase())))));
  });
  if (byName) return byName;
  if (start && end) {
    return shifts.find((s) => (s.startTime === start && s.endTime === end) || (s.startTime === end && s.endTime === start));
  }
  return undefined;
};

const parseBreaksCell = (text: string, uniqueKey: string): ScheduleBreak[] => {
  const breaks: ScheduleBreak[] = [];
  TIME_RANGE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TIME_RANGE_RE.exec(text)) !== null) {
    const startTime = normalizeTime(m[1]);
    const endTime = normalizeTime(m[2]);
    if (!startTime || !endTime) continue;
    const durationMinutes = Math.max(0, Math.round((Date.parse(`2000-01-01T${endTime}:00Z`) - Date.parse(`2000-01-01T${startTime}:00Z`)) / 60000));
    // Unique per employee+date+slot — the server inserts the client-supplied id
    // as the primary key, so deterministic ids would collide across rows.
    breaks.push({ id: `import-${uniqueKey}-${breaks.length}-${Math.random().toString(36).slice(2, 8)}`, name: `Break ${breaks.length + 1}`, startTime, endTime, durationMinutes });
  }
  return breaks;
};

export function parseScheduleWorkbook(rows: unknown[][], ctx: ImportContext): ImportPreview {
  const warnings: string[] = [];
  const empty: ImportPreview = { assignments: [], breaks: [], employeeCount: 0, matchedDates: [], warnings };

  const grid = rows.filter((r): r is unknown[] => Array.isArray(r));
  if (grid.length < 2) {
    warnings.push(ctx.lang === 'ar' ? 'الملف فارغ أو لا يحتوي على صفوف بيانات.' : 'The file is empty or has no data rows.');
    return empty;
  }

  /* ---- 1. Classify header columns (break columns FIRST — "بريكات الأحد"
            also contains the weekday name). ---- */
  const header = (grid[0] ?? []).map((c) => norm(String(c ?? '')));
  const dayColumns: Array<{ col: number; key: string }> = [];
  const breakColumns: Array<{ col: number; key: string }> = [];
  for (let col = 2; col < header.length; col++) {
    const h = header[col];
    if (!h) continue;
    const isBreak = h.startsWith('بريكات') || /breaks?\b/i.test(h);
    let key = '';
    const parsed = dateFromHeader(h);
    if (parsed.length === 10) {
      key = ctx.weekDateKeys.includes(parsed) ? parsed : '';
    } else if (parsed.length === 5) {
      // Year omitted (dd/mm) — anchor to the displayed week by month+day.
      key = ctx.weekDateKeys.find((k) => k.slice(5) === parsed) ?? '';
    }
    if (!key) {
      const wd = weekdayFromHeader(h);
      if (wd >= 0) key = ctx.weekDateKeys.find((k) => new Date(`${k}T00:00:00`).getDay() === wd) ?? '';
    }
    if (!key) continue;
    if (isBreak) {
      if (!breakColumns.some((b) => b.key === key)) breakColumns.push({ col, key });
    } else {
      if (!dayColumns.some((d) => d.key === key)) dayColumns.push({ col, key });
    }
  }
  if (!dayColumns.length) {
    warnings.push(
      ctx.lang === 'ar'
        ? 'لم يتم العثور على أعمدة تواريخ مطابقة للأسبوع المعروض. استخدم ملف التصدير الأسبوعي وانتقل للأسبوع الصحيح قبل الاستيراد.'
        : 'No date columns matching the displayed week were found. Use the weekly export file and navigate to the matching week before importing.',
    );
    return empty;
  }

  /* ---- 2. Rows → per-employee values. ---- */
  const employeeByCode = new Map<string, Employee>();
  const employeeByName = new Map<string, Employee>();
  for (const e of ctx.employees) {
    const code = normLower(e.code);
    if (code) employeeByCode.set(code, e);
    for (const n of [e.nameAr, e.nameEn, (e as any).name]) {
      const key = normLower(n);
      if (key && !employeeByName.has(key)) employeeByName.set(key, e);
    }
  }

  const assignmentMap = new Map<string, ImportAssignmentRow>();
  const breakMap = new Map<string, ImportBreakEntry>();
  const employeeIds = new Set<string>();
  let unmatchedSamples = 0;

  for (let r = 1; r < grid.length; r++) {
    const row = grid[r] ?? [];
    const code = norm(row[0]);
    const name = norm(row[1]);
    if (!code && !name) continue;
    const employee = employeeByCode.get(code.toLowerCase()) ?? employeeByName.get(name.toLowerCase());
    if (!employee) {
      warnings.push(ctx.lang === 'ar' ? `تجاهل صف بكود غير معروف: "${code || name}"` : `Skipped row with unknown code: "${code || name}"`);
      continue;
    }
    employeeIds.add(employee.id);
    for (const { col, key } of dayColumns) {
      const cell = norm(row[col]);
      if (!cell) continue; // empty cell → leave the existing schedule untouched
      const clean = cell.replace(/\(\+1 day\)|\(لليوم التالي\)/g, ' ');
      let value: ImportAssignmentRow | null = null;
      if (/OFF|راحة أسبوعية/i.test(clean)) {
        value = { employeeId: employee.id, date: key, shiftId: '', isOffDay: true, status: 'OFF', clear: false };
      } else if (/HOLIDAY|عطلة رسمية/i.test(clean)) {
        value = { employeeId: employee.id, date: key, shiftId: '', isOffDay: false, status: 'HOLIDAY', clear: false };
      } else if (/ANNUAL|إجازة سنوية/i.test(clean)) {
        value = { employeeId: employee.id, date: key, shiftId: '', isOffDay: false, status: 'ANNUAL', clear: false };
      } else if (/^غير م|unassigned/i.test(clean)) {
        value = { employeeId: employee.id, date: key, shiftId: '', isOffDay: false, status: '', clear: true };
      } else {
        const shift = matchShift(clean, ctx.shifts);
        if (shift) {
          value = { employeeId: employee.id, date: key, shiftId: String(shift.id), isOffDay: false, status: '', clear: false };
        } else if (unmatchedSamples < 8) {
          unmatchedSamples++;
          warnings.push(ctx.lang === 'ar' ? `${code || name} ${key}: لم يتم التعرف على "${cell.slice(0, 40)}" — تم التجاهل.` : `${code || name} ${key}: unrecognized cell "${cell.slice(0, 40)}" — skipped.`);
        }
      }
      if (value) assignmentMap.set(`${value.employeeId}|${value.date}`, value);

      // Breaks column for the same date (export puts it right after the day).
      const breakCol = breakColumns.find((b) => b.key === key);
      if (breakCol) {
        const breakText = norm(row[breakCol.col]);
        if (breakText && !/^(—|-|لا يوجد|none)?$/i.test(breakText)) {
          const breaks = parseBreaksCell(breakText, `${employee.id}-${key}`);
          if (breaks.length) breakMap.set(`${employee.id}|${key}`, { employeeId: employee.id, date: key, breaks });
        }
      }
    }
  }

  if (!assignmentMap.size && !breakMap.size) {
    warnings.push(ctx.lang === 'ar' ? 'لم يتم العثور على بيانات قابلة للاستيراد في الصفوف.' : 'No importable data found in the rows.');
  }

  return {
    assignments: Array.from(assignmentMap.values()),
    breaks: Array.from(breakMap.values()),
    employeeCount: employeeIds.size,
    matchedDates: Array.from(new Set([...assignmentMap.values()].map((a) => a.date))).sort(),
    warnings,
  };
}

import { DailyShiftAssignment, Employee, Language, Shift } from '../types';
import { HolidayRange, LeaveRange, ScheduleBreak, isOvernightShift, resolveDayStatus } from './scheduleStatus';

/**
 * Schedule → Excel export (weekly + monthly views).
 *
 * Uses SheetJS (xlsx, already a project dependency) and builds a real .xlsx
 * workbook client-side:
 *   - Roster sheet: one row per employee, two columns per day
 *     (shift/status + breaks) covering OFF / Holiday / Annual Leave too.
 *   - Monthly layout: one row per calendar day, one column per employee
 *     (Teleopti-style monthly roster matrix).
 *   - "Breaks detail" sheet: one row per break per employee per date.
 */

export interface ScheduleExportInput {
  employees: Employee[];
  shifts: Shift[];
  assignments: DailyShiftAssignment[];
  leaves: LeaveRange[];
  holidays: HolidayRange[];
  lang: Language;
  /** Ordered YYYY-MM-DD list of dates to export (week = 7, month = 28–31). */
  dates: string[];
  /** Employee-specific breaks keyed by employeeId, then date. */
  breaksByEmployee: Record<string, Record<string, ScheduleBreak[]>>;
  /** File name base without extension, e.g. "TechSource-Schedule-Week-2026-10-19". */
  fileBase: string;
  /** Human title printed in the sheet header row. */
  title: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

const dayNames = (date: Date, lang: Language) => {
  const ar = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  const en = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return (lang === 'ar' ? ar : en)[date.getDay()];
};

const statusText = (
  resolved: ReturnType<typeof resolveDayStatus>,
  lang: Language,
): string => {
  switch (resolved.status) {
    case 'off':
      return lang === 'ar' ? 'OFF — راحة أسبوعية' : 'OFF';
    case 'holiday':
      return (lang === 'ar' ? 'HOLIDAY — عطلة رسمية' : 'HOLIDAY') + (resolved.holiday ? `: ${lang === 'ar' ? (resolved.holiday.nameAr ?? resolved.holiday.nameEn) : (resolved.holiday.nameEn ?? resolved.holiday.nameAr)}` : '');
    case 'annual':
      return lang === 'ar' ? 'ANNUAL LEAVE — إجازة سنوية' : 'ANNUAL LEAVE';
    case 'unassigned':
      return lang === 'ar' ? 'غير مُعيّن' : 'Unassigned';
    case 'working': {
      if (!resolved.shift) return lang === 'ar' ? 'غير مُعيّن' : 'Unassigned';
      const shift = resolved.shift;
      const name = lang === 'ar' ? (shift.nameAr || shift.name) : (shift.nameEn || shift.name);
      const suffix = isOvernightShift(shift.startTime, shift.endTime) ? (lang === 'ar' ? ' (لليوم التالي)' : ' (+1 day)') : '';
      return `${name}\n${shift.startTime}–${shift.endTime}${suffix}`;
    }
    default:
      return '';
  }
};

const breaksText = (breaks: ScheduleBreak[], lang: Language): string => {
  if (!breaks.length) return lang === 'ar' ? 'لا يوجد' : '—';
  return breaks.map((b) => `${b.startTime}–${b.endTime}`).join(', ');
};

const dateLabel = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return `${pad(d)}/${pad(m)}/${y}`;
};

const parseDate = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

export async function exportScheduleToExcel(input: ScheduleExportInput): Promise<void> {
  const { employees, shifts, assignments, leaves, holidays, lang, dates, breaksByEmployee, fileBase, title } = input;
  const XLSX = await import('xlsx');
  const isMonth = dates.length > 7;

  const resolvedFor = (employeeId: string, key: string) => {
    const assignment = assignments.find(
      (a) => String(a.employeeId ?? (a as any).employee_id).toLowerCase() === employeeId.toLowerCase() &&
        String(a.date ?? '').slice(0, 10) === key,
    );
    return resolveDayStatus({
      dateKey: key,
      employeeId,
      assignment: { ...(assignment ?? {}), __employeeBreaks: breaksByEmployee[employeeId]?.[key] ?? [] },
      shifts,
      leaves,
      holidays,
    });
  };

  const codeOf = (e: Employee) => String(e.code || '').trim();
  const nameOf = (e: Employee) => (lang === 'ar' ? e.nameAr || e.nameEn : e.nameEn || e.nameAr);

  /* ---------- Sheet 1: roster matrix ---------- */
  const roster: (string | number)[][] = [];
  const header: (string | number)[] = [
    lang === 'ar' ? 'الكود' : 'Code',
    lang === 'ar' ? 'الموظف' : 'Employee',
  ];
  if (!isMonth) {
    for (const key of dates) {
      const dayName = dayNames(parseDate(key), lang);
      header.push(`${dayName} ${dateLabel(key).slice(0, 5)}`);
      header.push(lang === 'ar' ? `بريكات ${dayName}` : `${dayName} Breaks`);
    }
  } else {
    header.push(title);
  }
  roster.push(header);

  for (const employee of employees) {
    const row: (string | number)[] = [codeOf(employee), nameOf(employee)];
    if (!isMonth) {
      for (const key of dates) {
        const resolved = resolvedFor(employee.id, key);
        row.push(statusText(resolved, lang));
        row.push(resolved.status === 'working' ? breaksText(resolved.effectiveBreaks, lang) : (lang === 'ar' ? '—' : '—'));
      }
    } else {
      const cells: string[] = [];
      for (const key of dates) {
        const resolved = resolvedFor(employee.id, key);
        const base = statusText(resolved, lang).replace(/\n/g, ' ');
        const withBreaks = resolved.status === 'working' && resolved.effectiveBreaks.length
          ? `${base} | ${lang === 'ar' ? 'بريك' : 'Break'}: ${breaksText(resolved.effectiveBreaks, lang)}`
          : base;
        cells.push(`${dateLabel(key)}: ${withBreaks}`);
      }
      row.push(cells.join('\n'));
    }
    roster.push(row);
  }

  /* ---------- Sheet 2: breaks detail ---------- */
  const detail: (string | number)[][] = [[
    lang === 'ar' ? 'التاريخ' : 'Date',
    lang === 'ar' ? 'اليوم' : 'Day',
    lang === 'ar' ? 'الكود' : 'Code',
    lang === 'ar' ? 'الموظف' : 'Employee',
    lang === 'ar' ? 'البريك' : 'Break',
    lang === 'ar' ? 'من' : 'From',
    lang === 'ar' ? 'إلى' : 'To',
    lang === 'ar' ? 'المدة (دقيقة)' : 'Duration (min)',
  ]];
  for (const employee of employees) {
    for (const key of dates) {
      const resolved = resolvedFor(employee.id, key);
      if (resolved.status !== 'working') continue;
      for (const brk of resolved.effectiveBreaks) {
        detail.push([
          dateLabel(key),
          dayNames(parseDate(key), lang),
          codeOf(employee),
          nameOf(employee),
          lang === 'ar' ? (brk.nameAr || brk.nameEn || (lang === 'ar' ? 'استراحة' : 'Break')) : (brk.nameEn || brk.nameAr || 'Break'),
          brk.startTime,
          brk.endTime,
          brk.durationMinutes || Math.max(0, Math.round((Date.parse(`2000-01-01T${brk.endTime}:00Z`) - Date.parse(`2000-01-01T${brk.startTime}:00Z`)) / 60000)),
        ]);
      }
    }
  }

  const workbook = XLSX.utils.book_new();
  const rosterSheet = XLSX.utils.aoa_to_sheet(roster);
  rosterSheet['!cols'] = isMonth
    ? [{ wch: 10 }, { wch: 26 }, { wch: 120 }]
    : [{ wch: 10 }, { wch: 24 }, ...Array.from({ length: dates.length * 2 }, () => ({ wch: 22 }))];
  XLSX.utils.book_append_sheet(workbook, rosterSheet, (isMonth ? (lang === 'ar' ? 'جدول شهري' : 'Monthly Roster') : (lang === 'ar' ? 'جدول أسبوعي' : 'Weekly Schedule')).slice(0, 31));

  const detailSheet = XLSX.utils.aoa_to_sheet(detail);
  detailSheet['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 24 }, { wch: 16 }, { wch: 9 }, { wch: 9 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(workbook, detailSheet, (lang === 'ar' ? 'تفاصيل البريكات' : 'Breaks Detail').slice(0, 31));

  XLSX.writeFile(workbook, `${fileBase}.xlsx`);
}

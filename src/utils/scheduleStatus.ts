import { Shift } from '../types';

/**
 * Weekly-schedule status model.
 *
 * Five supported statuses with a fixed precedence so a day can never display a
 * misleading combination (e.g. breaks on an OFF day):
 *   holiday > annual (approved annual leave) > off > working > unassigned
 */

export type DayStatus = 'holiday' | 'annual' | 'off' | 'working' | 'unassigned';

export interface HolidayRange {
  nameAr?: string;
  nameEn?: string;
  startDate: string;
  endDate: string;
}

export interface LeaveRange {
  employeeId: string;
  type: string;
  status: string;
  startDate: string;
  endDate: string;
}

export interface ScheduleBreak {
  id: string;
  name?: string;
  nameAr?: string;
  nameEn?: string;
  startTime: string;
  endTime: string;
  durationMinutes?: number;
}

const sameId = (a: unknown, b: unknown) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();

export const timeToMinutes = (value: string) => {
  const [hours, minutes] = String(value || '').split(':').map(Number);
  return Math.max(0, Math.min(24 * 60, (hours || 0) * 60 + (minutes || 0)));
};

export const isOvernightShift = (start: string, end: string) => timeToMinutes(end) <= timeToMinutes(start);

/** Segments (in % of a 24h timeline) covering a time range, wrapping overnight. */
export const timelineSegments = (start: string, end: string) => {
  const startMinutes = timeToMinutes(start);
  const endMinutes = timeToMinutes(end);
  if (endMinutes > startMinutes) return [{ left: (startMinutes / 1440) * 100, width: ((endMinutes - startMinutes) / 1440) * 100 }];
  if (endMinutes < startMinutes) return [
    { left: (startMinutes / 1440) * 100, width: ((1440 - startMinutes) / 1440) * 100 },
    { left: 0, width: (endMinutes / 1440) * 100 },
  ];
  return [{ left: 0, width: 100 }];
};

/** Deterministic break id for shift-level breaks that lack one. */
export const breakId = (raw: any, index: number) =>
  String(raw?.id ?? `${raw?.startTime ?? 'x'}-${raw?.endTime ?? 'y'}-${index}`);

/** Normalizes shift-level or employee-level breaks into a common shape. */
export const normalizeBreaks = (raw: any): ScheduleBreak[] =>
  (Array.isArray(raw) ? raw : [])
    .filter((item: any) => item && item.startTime && item.endTime)
    .map((item: any, index: number) => ({
      id: breakId(item, index),
      name: String(item?.name ?? ''),
      nameAr: String(item?.nameAr ?? item?.name ?? ''),
      nameEn: String(item?.nameEn ?? item?.name ?? ''),
      startTime: String(item.startTime).slice(0, 5),
      endTime: String(item.endTime).slice(0, 5),
      durationMinutes: Number(item?.durationMinutes ?? 0) || Math.max(0, timeToMinutes(String(item.endTime).slice(0, 5)) - timeToMinutes(String(item.startTime).slice(0, 5))),
    }));

const dateInRange = (dateKey: string, start: string, end: string) => {
  const from = String(start ?? '').slice(0, 10);
  const to = String(end ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return false;
  return from <= dateKey && dateKey <= to;
};

export const holidayForDate = (dateKey: string, holidays: HolidayRange[]): HolidayRange | null =>
  (holidays || []).find((holiday) => dateInRange(dateKey, holiday.startDate, holiday.endDate)) ?? null;

export const annualLeaveForDate = (dateKey: string, employeeId: string, leaves: LeaveRange[]): LeaveRange | null =>
  (leaves || []).find((leave) =>
    sameId(leave.employeeId, employeeId) &&
    String(leave.status ?? '').toLowerCase() === 'approved' &&
    String(leave.type ?? '').toLowerCase() === 'annual' &&
    dateInRange(dateKey, leave.startDate, leave.endDate)) ?? null;

export const anyLeaveForDate = (dateKey: string, employeeId: string, leaves: LeaveRange[]): LeaveRange | null =>
  (leaves || []).find((leave) =>
    sameId(leave.employeeId, employeeId) &&
    String(leave.status ?? '').toLowerCase() === 'approved' &&
    dateInRange(dateKey, leave.startDate, leave.endDate)) ?? null;

export interface DayStatusInput {
  dateKey: string;
  employeeId: string;
  assignment?: any;
  shifts: Shift[];
  leaves?: LeaveRange[];
  holidays?: HolidayRange[];
}

export interface DayStatusResult {
  status: DayStatus;
  /** Label key for the status chip (always rendered — never color alone). */
  label: string;
  shift?: Shift;
  /** Employee-specific breaks for this date (empty when none stored). */
  ownBreaks: ScheduleBreak[];
  /** Fallback shift-level breaks used when ownBreaks is empty. */
  shiftBreaks: ScheduleBreak[];
  /** Breaks actually displayed for this day. */
  effectiveBreaks: ScheduleBreak[];
  holiday?: HolidayRange | null;
  leave?: LeaveRange | null;
}

/**
 * Resolves the display status + breaks for one employee on one date.
 * Breaks are ONLY produced for `working` days — OFF / Holiday / Annual Leave
 * never show working hours or break periods.
 */
export function resolveDayStatus(input: DayStatusInput): DayStatusResult {
  const { dateKey, employeeId, assignment, shifts } = input;
  const leaves = input.leaves ?? [];
  const holidays = input.holidays ?? [];

  const assignmentStatus = String(assignment?.status ?? '').toUpperCase();
  const assignmentOff = Boolean(assignment?.isOffDay ?? assignment?.is_off_day) || assignmentStatus === 'OFF';
  const rawShiftId = String(assignment?.shiftId ?? assignment?.shift_id ?? '').trim();
  const shift = rawShiftId ? shifts.find((s) => sameId(s.id, rawShiftId)) : undefined;

  const holiday = holidayForDate(dateKey, holidays);
  const annual = annualLeaveForDate(dateKey, employeeId, leaves);
  const otherLeave = annual ? null : anyLeaveForDate(dateKey, employeeId, leaves);

  const ownBreaks = normalizeBreaks(assignment?.__employeeBreaks);
  const shiftBreaks = normalizeBreaks([...(shift?.breaks ?? [])]);

  const base = { dateKey, employeeId, shift, ownBreaks, shiftBreaks, holiday };

  if (assignmentStatus === 'HOLIDAY') return { ...base, status: 'holiday', label: 'holiday', effectiveBreaks: [], holiday: holiday ?? { startDate: dateKey, endDate: dateKey, nameEn: 'Holiday', nameAr: 'عطلة رسمية' } };
  if (assignmentStatus === 'ANNUAL') return { ...base, status: 'annual', label: 'annual', effectiveBreaks: [], leave: annual ?? { employeeId, type: 'annual', status: 'approved', startDate: dateKey, endDate: dateKey } };
  if (holiday) return { ...base, status: 'holiday', label: 'holiday', effectiveBreaks: [], holiday };
  if (annual) return { ...base, status: 'annual', label: 'annual', effectiveBreaks: [], leave: annual };
  if (otherLeave) return { ...base, status: 'annual', label: 'on_leave', effectiveBreaks: [], leave: otherLeave };
  if (assignmentOff) return { ...base, status: 'off', label: 'off', effectiveBreaks: [] };
  if (shift) return { ...base, status: 'working', label: 'working', effectiveBreaks: ownBreaks.length ? ownBreaks : shiftBreaks };
  return { ...base, status: 'unassigned', label: 'unassigned', effectiveBreaks: [] };
}

/** STATUS_STYLES centralizes the required color scheme so cards + legend match. */
export const STATUS_STYLES: Record<DayStatus, { chip: string; cell: string; dot: string }> = {
  working: { chip: 'bg-emerald-100 text-emerald-800 border border-emerald-300', cell: 'bg-white border-emerald-200', dot: 'bg-emerald-500' },
  off: { chip: 'bg-pink-100 text-pink-800 border border-pink-300', cell: 'bg-pink-50 border-pink-300', dot: 'bg-pink-500' },
  holiday: { chip: 'bg-red-100 text-red-800 border border-red-300', cell: 'bg-red-50 border-red-300', dot: 'bg-red-500' },
  annual: { chip: 'bg-amber-100 text-amber-800 border border-amber-300', cell: 'bg-amber-50 border-amber-300', dot: 'bg-amber-400' },
  unassigned: { chip: 'bg-slate-100 text-slate-600 border border-slate-300', cell: 'bg-white border-dashed border-slate-300', dot: 'bg-slate-400' },
};

/** Fixed color for break blocks inside a working day's timeline. */
export const BREAK_BLOCK_CLASS = 'bg-red-500 hover:bg-red-600';

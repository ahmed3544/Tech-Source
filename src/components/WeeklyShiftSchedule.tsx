import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Coffee, Save, Users, Pencil, Trash2, Plus } from 'lucide-react';
import { Employee, Language, Shift, DailyShiftAssignment } from '../types';
import { ShiftManager } from './ShiftManager';
import { ShiftSwapPanel } from './ShiftSwapPanel';
import { authHeaders, errorToMessage, extractApiError, parseResponse } from '../utils/errors';
import {
  DayStatus,
  HolidayRange,
  LeaveRange,
  ScheduleBreak,
  isOvernightShift,
  normalizeBreaks,
  resolveDayStatus,
  timeToMinutes,
} from '../utils/scheduleStatus';

interface WeeklyShiftScheduleProps {
  employees?: Employee[];
  shifts?: Shift[];
  dailyShiftAssignments?: DailyShiftAssignment[];
  leaveRequests?: LeaveRange[];
  holidays?: HolidayRange[];
  currentUser?: Employee | null;
  lang: Language;
  onSaveDailyShift?: (assignment: DailyShiftAssignment) => void;
  onAddShift?: (shift: Shift) => void;
  onUpdateShift?: (shift: Shift) => void;
  onDeleteShift?: (shiftId: string) => void;
  /** Called when the server rejects a mutation with 401 (session ended). */
  onAuthFailure?: () => void;
  onClose?: () => void;
}

const pad = (n: number) => String(n).padStart(2, '0');
const dateKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const startOfWeek = (value: Date) => { const d = new Date(value); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - d.getDay()); return d; };
const addDays = (value: Date, amount: number) => { const d = new Date(value); d.setDate(d.getDate() + amount); return d; };
const sameId = (a: unknown, b: unknown) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();
const OFF = '__OFF__';
const EMPTY = '__EMPTY__';

const STATUS_LABELS: Record<string, { en: string; ar: string }> = {
  working: { en: 'WORKING', ar: 'دوام' },
  off: { en: 'OFF', ar: 'راحة أسبوعية' },
  holiday: { en: 'HOLIDAY', ar: 'عطلة رسمية' },
  annual: { en: 'ANNUAL LEAVE', ar: 'إجازة سنوية' },
  on_leave: { en: 'ON LEAVE', ar: 'في إجازة' },
  unassigned: { en: 'UNASSIGNED', ar: 'غير مُعيّن' },
};

const normalizeShift = (raw: any): Shift => ({
  ...raw,
  id: String(raw?.id ?? ''),
  name: raw?.name ?? raw?.nameEn ?? raw?.nameAr ?? '',
  nameAr: raw?.nameAr ?? raw?.name ?? raw?.nameEn ?? '',
  nameEn: raw?.nameEn ?? raw?.name ?? raw?.nameAr ?? '',
  startTime: String(raw?.startTime ?? raw?.start_time ?? ''),
  endTime: String(raw?.endTime ?? raw?.end_time ?? ''),
  breakMinutes: Number(raw?.breakMinutes ?? raw?.break_minutes ?? 0),
  workDays: Array.isArray(raw?.workDays) ? raw.workDays.map(Number) : (Array.isArray(raw?.work_days) ? raw.work_days.map(Number) : [0, 1, 2, 3, 4]),
  breaks: Array.isArray(raw?.breaks) ? raw.breaks : [],
}) as Shift;

const formatDuration = (mins: number, lang: string) => {
  const h = Math.floor(mins / 60);
  const m = Math.floor(mins % 60);
  if (lang === 'ar') return `${h > 0 ? h + ' ساعة' : ''} ${m > 0 ? m + ' دقيقة' : ''}`.trim() || '0 دقيقة';
  return `${h > 0 ? h + 'h' : ''} ${m > 0 ? m + 'm' : ''}`.trim() || '0m';
};

/** 24h "09:30" — used on the desktop time axis (Teleopti week style). */
const fmt24 = (minutes: number) => `${pad(Math.floor(minutes / 60) % 24)}:${pad(minutes % 60)}`;
/** 12h "10:30 AM" — used on the mobile day timeline (Teleopti app style). */
const fmt12 = (minutes: number, lang: string) => {
  const total = ((minutes % 1440) + 1440) % 1440;
  let hours = Math.floor(total / 60);
  const mins = pad(total % 60);
  const suffix = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return lang === 'ar' ? `${hours}:${mins} ${suffix === 'PM' ? 'م' : 'ص'}` : `${hours}:${mins} ${suffix}`;
};
/** dd/mm/yyyy — Teleopti toolbar range format. */
const fmtDMY = (d: Date) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;

/** Client-side validation mirroring the server rules for one day's breaks. */
const validateBreakRows = (rows: ScheduleBreak[]): string | null => {
  const clean = rows.filter((r) => r.startTime && r.endTime);
  for (let i = 0; i < clean.length; i++) {
    if (timeToMinutes(clean[i].endTime) <= timeToMinutes(clean[i].startTime)) {
      return `Break ${i + 1}: end time must be after start time.`;
    }
    for (let j = i + 1; j < clean.length; j++) {
      if (timeToMinutes(clean[j].startTime) < timeToMinutes(clean[i].endTime) && timeToMinutes(clean[j].endTime) > timeToMinutes(clean[i].startTime)) {
        return `Break ${j + 1} overlaps with break ${i + 1}.`;
      }
    }
  }
  return null;
};

/* ------------------------------------------------------------------ */
/* Teleopti WFM palette — matches the reference design exactly.        */
/* ------------------------------------------------------------------ */
const TEO = {
  shift: 'bg-orange-400 hover:bg-orange-500 text-white dark:bg-orange-500 dark:hover:bg-orange-400',
  shiftPending: 'bg-orange-300 text-white ring-2 ring-blue-400 dark:bg-orange-600',
  breakBar: 'bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-500',
  holiday: 'bg-red-100 text-red-800 border border-red-300 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/40',
  annual: 'bg-yellow-300 text-yellow-900 dark:bg-yellow-500/25 dark:text-yellow-300',
  offLabel: 'text-slate-600 dark:text-slate-400',
  unassigned: 'text-slate-400 dark:text-slate-500',
};
/** Diagonal hatching for "Day Off" — same as the Teleopti striped cell. */
const HATCH_STYLE: React.CSSProperties = {
  backgroundImage: 'repeating-linear-gradient(45deg, #e2e8f0 0 6px, #f8fafc 6px 12px)',
};
const HOUR_PX_DESKTOP = 46;
const HOUR_PX_MOBILE = 56;

interface BreakEditorState {
  dateKey: string;
  dayName: string;
  status: DayStatus;
  shift?: Shift;
}

export const WeeklyShiftSchedule: React.FC<WeeklyShiftScheduleProps> = ({
  employees: suppliedEmployees = [],
  shifts: suppliedShifts = [],
  dailyShiftAssignments: suppliedAssignments = [],
  leaveRequests: suppliedLeaves = [],
  holidays: suppliedHolidays = [],
  currentUser: suppliedUser = null,
  lang,
  onAddShift,
  onUpdateShift,
  onDeleteShift,
  onAuthFailure,
}) => {
  const [employees, setEmployees] = useState<Employee[]>(suppliedEmployees);
  const [shifts, setShifts] = useState<Shift[]>(suppliedShifts.map(normalizeShift));
  const [assignments, setAssignments] = useState<DailyShiftAssignment[]>(suppliedAssignments);
  const [currentUser, setCurrentUser] = useState<Employee | null>(suppliedUser);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(suppliedUser?.id || suppliedEmployees[0]?.id || '');
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedBreak, setSelectedBreak] = useState<{ name: string; startTime: string; endTime: string; durationMinutes: number } | null>(null);
  const [breaksByDate, setBreaksByDate] = useState<Record<string, ScheduleBreak[]>>({});
  const [breakEditor, setBreakEditor] = useState<BreakEditorState | null>(null);
  const [breakDraft, setBreakDraft] = useState<ScheduleBreak[]>([]);
  const [breakSaving, setBreakSaving] = useState(false);
  const [breakError, setBreakError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week');
  const [mobileDayIndex, setMobileDayIndex] = useState(() => new Date().getDay());
  const [editPanelOpen, setEditPanelOpen] = useState(false);

  const isLeader = ['leader', 'admin', 'company_admin', 'platform_admin'].includes(String(currentUser?.role || ''));

  useEffect(() => {
    setEmployees(suppliedEmployees || []);
    setShifts((suppliedShifts || []).map(normalizeShift));
    setAssignments(suppliedAssignments || []);
    if (suppliedUser) {
      setCurrentUser(suppliedUser);
      if (!isLeader) setSelectedEmployeeId(suppliedUser.id);
    }
  }, [suppliedEmployees, suppliedShifts, suppliedAssignments, suppliedUser, isLeader]);

  // The schedule has its own authoritative sync channel so an employee device
  // receives leader/admin changes even when the general /api/data poll is stale.
  useEffect(() => {
    let cancelled = false;
    const pullSchedule = async () => {
      try {
        const response = await fetch(`/api/schedule-sync?_=${Date.now()}`, {
          method: 'GET',
          cache: 'no-store',
          headers: { Accept: 'application/json', 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
        });
        if (!response.ok) return;
        const data = await response.json();
        if (!cancelled && Array.isArray(data?.dailyShiftAssignments)) {
          setAssignments(data.dailyShiftAssignments);
          try { localStorage.setItem('daily_shift_assignments', JSON.stringify(data.dailyShiftAssignments)); } catch {}
        }
      } catch {}
    };
    void pullSchedule();
    const interval = window.setInterval(pullSchedule, 1500);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, []);

  const visibleEmployees = useMemo(() => {
    if (!isLeader) return employees.filter(e => sameId(e.id, currentUser?.id));
    if (currentUser?.role === 'admin' || currentUser?.role === 'company_admin' || currentUser?.role === 'platform_admin') return employees;
    const team = employees.filter(e => sameId(e.teamLeaderId, currentUser?.id));
    if (team.length) return team;
    if (currentUser?.teamId) {
      const sameTeam = employees.filter(e => e.teamId === currentUser.teamId);
      if (sameTeam.length) return sameTeam;
    }
    // Never expose the whole roster to a team leader when no team mapping exists.
    return employees.filter(e => sameId(e.id, currentUser?.id));
  }, [employees, isLeader, currentUser]);

  const employee = visibleEmployees.find(e => sameId(e.id, selectedEmployeeId)) || visibleEmployees[0] || null;

  useEffect(() => {
    if (employee && !visibleEmployees.some(e => sameId(e.id, selectedEmployeeId))) setSelectedEmployeeId(employee.id);
  }, [employee, visibleEmployees, selectedEmployeeId]);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const date = addDays(weekStart, i);
    const ar = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    const en = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return { date, key: dateKey(date), ar: ar[date.getDay()], en: en[date.getDay()], dayIndex: date.getDay() };
  }), [weekStart]);

  const assignmentFor = (employeeId: string, key: string) => assignments.find(a => sameId(a.employeeId ?? (a as any).employee_id, employeeId) && String(a.date ?? '').slice(0, 10) === key);

  // Load employee-specific breaks for the visible week whenever it changes.
  useEffect(() => {
    if (!employee) return;
    let cancelled = false;
    const from = dateKey(days[0].date);
    const to = dateKey(days[6].date);
    const loadBreaks = async () => {
      try {
        const response = await fetch(`/api/employee-breaks?employeeId=${encodeURIComponent(employee.id)}&from=${from}&to=${to}`, { cache: 'no-store', headers: { Accept: 'application/json' } });
        if (!response.ok) return;
        const data = await parseResponse(response);
        if (!cancelled && data?.success && data?.breaksByDate) setBreaksByDate(data.breaksByDate);
      } catch { /* employee-specific breaks are optional; shift fallback still applies */ }
    };
    void loadBreaks();
    return () => { cancelled = true; };
  }, [employee?.id, weekStart]); // eslint-disable-line react-hooks/exhaustive-deps

  const valueFor = (key: string) => {
    if (draft[key] !== undefined) return draft[key];
    const a = assignmentFor(employee?.id || '', key);
    const sid = String(a?.shiftId ?? '').trim();
    if (sid) return sid;
    if (a && (a.isOffDay || String((a as any)?.status ?? '').toUpperCase() === 'OFF')) return OFF;
    return EMPTY;
  };
  const shiftById = (id: string) => shifts.find(s => sameId(s.id, id));
  const updateDay = (key: string, value: string) => { setDraft(prev => ({ ...prev, [key]: value })); setError(null); setMessage(null); };

  /** Saved assignment merged with pending leader drafts (for live grid preview). */
  const effectiveAssignment = (key: string): any => {
    const saved: any = assignmentFor(employee?.id || '', key) ?? {};
    if (draft[key] === undefined) return { ...saved, __employeeBreaks: breaksByDate[key] };
    const value = draft[key];
    return {
      ...saved,
      shiftId: value === OFF || value === EMPTY ? '' : value,
      isOffDay: value === OFF,
      clear: value === EMPTY,
      __employeeBreaks: breaksByDate[key],
    };
  };

  const resolveFor = (key: string) => resolveDayStatus({
    dateKey: key,
    employeeId: employee?.id || '',
    assignment: effectiveAssignment(key),
    shifts,
    leaves: suppliedLeaves,
    holidays: suppliedHolidays,
  });

  // Resolve every day of the visible week once — reused by week grid, mobile
  // day view, month view, and the time-window computation.
  const weekResults = useMemo(() => days.map(day => ({ day, resolved: resolveFor(day.key) })), [days, employee, shifts, assignments, breaksByDate, suppliedLeaves, suppliedHolidays, draft]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveWeek = async () => {
    if (!employee) return;
    setSaving(true); setError(null); setMessage(null);
    try {
      const now = new Date().toISOString();
      const rows = days.map(day => {
        const value = valueFor(day.key);
        return {
          employeeId: employee.id,
          date: day.key,
          shiftId: value === OFF || value === EMPTY ? '' : value,
          isOffDay: value === OFF,
          clear: value === EMPTY,
          assignedBy: currentUser?.id,
          updatedAt: now,
        } as any;
      });
      const response = await fetch('/api/schedule-sync', {
        method: 'POST', credentials: 'include', cache: 'no-store',
        headers: authHeaders({ 'Content-Type': 'application/json', Accept: 'application/json', 'Cache-Control': 'no-cache' }),
        body: JSON.stringify({ dailyShiftAssignments: rows, syncTimestamp: now }),
      });
      const data = await parseResponse(response);
      if (response.status === 401) {
        onAuthFailure?.();
        throw new Error(lang === 'ar' ? 'انتهت الجلسة. يرجى تسجيل الدخول من جديد.' : 'Session ended. Please sign in again.');
      }
      if (!response.ok || data?.success === false) throw new Error(extractApiError(data, lang === 'ar' ? 'تعذر حفظ الجدول على السيرفر' : 'Server rejected the weekly schedule'));
      setAssignments(Array.isArray(data?.dailyShiftAssignments) ? data.dailyShiftAssignments : []);
      setDraft({});
      setMessage(lang === 'ar' ? 'تم حفظ جدول الأسبوع على السيرفر بنجاح' : 'Weekly schedule saved successfully');
    } catch (err: unknown) {
      setError(errorToMessage(err, lang === 'ar' ? 'تعذر حفظ الجدول' : 'Could not save schedule'));
    } finally { setSaving(false); }
  };

  const openBreakEditor = (day: { key: string; en: string; ar: string }) => {
    if (!employee || !isLeader) return;
    const resolved = resolveFor(day.key);
    setBreakEditor({ dateKey: day.key, dayName: lang === 'ar' ? day.ar : day.en, status: resolved.status, shift: resolved.shift });
    setBreakDraft(resolved.status === 'working' ? (resolved.effectiveBreaks.map(b => ({ ...b }))) : []);
    setBreakError(null);
  };

  const updateBreakRow = (index: number, patch: Partial<ScheduleBreak>) => {
    setBreakDraft(prev => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };
  const addBreakRow = () => {
    setBreakDraft(prev => [...prev, { id: `draft-${Date.now()}-${prev.length}`, name: '', startTime: '12:00', endTime: '13:00', durationMinutes: 60 }]);
    setBreakError(null);
  };
  const removeBreakRow = (index: number) => setBreakDraft(prev => prev.filter((_, i) => i !== index));

  const saveBreaks = async () => {
    if (!employee || !breakEditor) return;
    const validation = validateBreakRows(breakDraft);
    if (validation) { setBreakError(validation); return; }
    setBreakSaving(true); setBreakError(null);
    try {
      const payload = breakDraft
        .filter(row => row.startTime && row.endTime)
        .map(row => ({ id: row.id?.startsWith('draft-') ? undefined : row.id, name: row.name?.trim() || undefined, startTime: row.startTime, endTime: row.endTime }));
      const response = await fetch('/api/employee-breaks', {
        method: 'POST', credentials: 'include', cache: 'no-store',
        headers: authHeaders({ 'Content-Type': 'application/json', Accept: 'application/json', 'Cache-Control': 'no-cache' }),
        body: JSON.stringify({ employeeId: employee.id, date: breakEditor.dateKey, breaks: payload }),
      });
      const data = await parseResponse(response);
      if (response.status === 401) {
        onAuthFailure?.();
        throw new Error(lang === 'ar' ? 'انتهت الجلسة. يرجى تسجيل الدخول من جديد.' : 'Session ended. Please sign in again.');
      }
      if (!response.ok || data?.success === false) throw new Error(extractApiError(data, lang === 'ar' ? 'تعذر حفظ الاستراحات' : 'Could not save breaks'));
      const saved = normalizeBreaks(data?.breaks);
      setBreaksByDate(prev => ({ ...prev, [breakEditor.dateKey]: saved }));
      setMessage(lang === 'ar' ? `تم حفظ استراحات ${breakEditor.dayName} لهذا الموظف` : `Breaks for ${breakEditor.dayName} saved for this employee`);
      setBreakEditor(null);
    } catch (err: unknown) {
      setBreakError(errorToMessage(err, lang === 'ar' ? 'تعذر حفظ الاستراحات' : 'Could not save breaks'));
    } finally { setBreakSaving(false); }
  };

  const weekLabel = `${dateKey(days[0].date)} → ${dateKey(days[6].date)}`;
  const rangeLabel = `${fmtDMY(days[0].date)} – ${fmtDMY(days[6].date)}`;

  /* Timeline window: from the earliest activity hour to the latest one. */
  const timeWindow = useMemo(() => {
    let min = 6 * 60, max = 22 * 60, overnight = false;
    for (const { resolved } of weekResults) {
      if (resolved.status !== 'working' || !resolved.shift) continue;
      const s = timeToMinutes(resolved.shift.startTime);
      const e = timeToMinutes(resolved.shift.endTime);
      if (isOvernightShift(resolved.shift.startTime, resolved.shift.endTime)) { overnight = true; continue; }
      min = Math.min(min, s); max = Math.max(max, e);
      for (const b of resolved.effectiveBreaks) {
        min = Math.min(min, timeToMinutes(b.startTime));
        max = Math.max(max, timeToMinutes(b.endTime));
      }
    }
    if (overnight) return { start: 0, end: 24 * 60 };
    min = Math.floor(min / 60) * 60;
    max = Math.ceil(max / 60) * 60;
    if (max - min < 240) max = Math.min(24 * 60, min + 240);
    return { start: min, end: max };
  }, [weekResults]);

  const span = Math.max(1, timeWindow.end - timeWindow.start);
  const pctTop = (minutes: number) => ((minutes - timeWindow.start) / span) * 100;
  const pctHeight = (startMin: number, endMin: number) => ((endMin - startMin) / span) * 100;
  /** Blocks for a time range clipped to the window; overnight ranges split in two. */
  const blocksFor = (startTime: string, endTime: string) => {
    const s = timeToMinutes(startTime), e = timeToMinutes(endTime);
    const ranges = e > s ? [[s, e]] : [[s, 24 * 60], [0, e]];
    const out: Array<{ top: number; height: number }> = [];
    for (const [a, b] of ranges) {
      const clippedStart = Math.max(a, timeWindow.start);
      const clippedEnd = Math.min(b, timeWindow.end);
      if (clippedEnd - clippedStart < 5) continue; // skip slivers
      out.push({ top: pctTop(clippedStart), height: pctHeight(clippedStart, clippedEnd) });
    }
    return out;
  };
  const axisHours = useMemo(() => {
    const stepHours = span / 60 > 15 ? 2 : 1;
    const list: number[] = [];
    for (let h = Math.ceil(timeWindow.start / 60); h <= Math.floor(timeWindow.end / 60); h += stepHours) list.push(h * 60);
    return list;
  }, [timeWindow, span]);

  const gridHeightDesktop = (span / 60) * HOUR_PX_DESKTOP;
  const gridHeightMobile = (span / 60) * HOUR_PX_MOBILE;
  const todayKey = dateKey(new Date());
  const mobileDay = weekResults[Math.min(6, Math.max(0, mobileDayIndex))] ?? weekResults[0];
  const monthName = new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG' : 'en', { month: 'long' }).format(days[0].date);

  /* Month view cells for the selected employee. */
  const monthCells = useMemo(() => {
    const first = new Date(days[0].date.getFullYear(), days[0].date.getMonth(), 1);
    const total = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    const cells: Array<{ key: string | null; dayNumber: number | null; date: Date | null }> = [];
    for (let i = 0; i < first.getDay(); i++) cells.push({ key: null, dayNumber: null, date: null });
    for (let d = 1; d <= total; d++) {
      const date = new Date(first.getFullYear(), first.getMonth(), d);
      cells.push({ key: dateKey(date), dayNumber: d, date });
    }
    return { first, cells };
  }, [days]);

  const legendItems: Array<{ id: string; en: string; ar: string; swatch: React.ReactNode }> = [
    { id: 'shift', en: 'Shift', ar: 'وردية', swatch: <span className="inline-block h-3.5 w-6 rounded bg-orange-400" /> },
    { id: 'break', en: 'Break', ar: 'استراحة', swatch: <span className="inline-block h-2 w-6 rounded bg-red-500" /> },
    { id: 'off', en: 'Day Off', ar: 'راحة أسبوعية', swatch: <span className="tech-source-hatch inline-block h-3.5 w-6 rounded border border-slate-300 dark:border-slate-600" style={HATCH_STYLE} /> },
    { id: 'holiday', en: 'Holiday', ar: 'عطلة رسمية', swatch: <span className="inline-block h-3.5 w-6 rounded border border-red-300 bg-red-100 dark:border-red-500/50 dark:bg-red-500/20" /> },
    { id: 'annual', en: 'Annual Leave', ar: 'إجازة سنوية', swatch: <span className="inline-block h-3.5 w-6 rounded bg-yellow-300" /> },
  ];

  /* Shared block renderer used by BOTH the desktop week grid and the mobile
     day timeline so colors/positions stay identical. */
  const renderTimelineBlocks = (
    resolved: ReturnType<typeof resolveFor>,
    opts: { mobile?: boolean; dayKey: string; dayLabel: string }
  ) => {
    const { resolved: r } = { resolved };
    const mobile = Boolean(opts.mobile);
    const hourPx = mobile ? HOUR_PX_MOBILE : HOUR_PX_DESKTOP;
    void hourPx;
    const blocks: React.ReactNode[] = [];

    if (r.status === 'off') {
      blocks.push(
        <div key="off" className="tech-source-hatch absolute inset-1 flex items-center justify-center rounded-md border border-slate-300 dark:border-slate-600" style={HATCH_STYLE}>
          <span className={`rounded bg-white/85 px-2 py-1 text-[11px] font-black ${TEO.offLabel}`}>{lang === 'ar' ? 'راحة أسبوعية' : 'Day Off'}</span>
        </div>
      );
    } else if (r.status === 'holiday') {
      blocks.push(
        <div key="holiday" className={`absolute inset-1 flex flex-col items-center justify-center gap-1 rounded-md px-2 text-center ${TEO.holiday}`}>
          <span className="text-xs font-black">{lang === 'ar' ? 'عطلة رسمية' : 'HOLIDAY'}</span>
          <span className="text-[11px] font-bold">{lang === 'ar' ? (r.holiday?.nameAr ?? r.holiday?.nameEn) : (r.holiday?.nameEn ?? r.holiday?.nameAr)}</span>
        </div>
      );
    } else if (r.status === 'annual') {
      blocks.push(
        <div key="annual" className={`absolute inset-1 flex flex-col items-center justify-center gap-1 rounded-md px-2 text-center ${TEO.annual}`}>
          <span className="text-xs font-black">{lang === 'ar' ? 'إجازة سنوية' : 'ANNUAL LEAVE'}</span>
          {r.leave && <span className="text-[10px] font-bold">{r.leave.startDate} → {r.leave.endDate}</span>}
        </div>
      );
    } else if (r.status === 'unassigned') {
      blocks.push(
        <div key="unassigned" className="absolute inset-1 flex items-start justify-center rounded-md border border-dashed border-slate-200 pt-2 dark:border-slate-700">
          <span className={`text-[10px] font-bold ${TEO.unassigned}`}>{lang === 'ar' ? 'غير مُعيّن' : 'Unassigned'}</span>
        </div>
      );
    } else if (r.status === 'working' && r.shift) {
      const shift = r.shift;
      const name = lang === 'ar' ? (shift.nameAr || shift.name) : (shift.nameEn || shift.name);
      const duration = Math.max(1, isOvernightShift(shift.startTime, shift.endTime) ? (1440 - timeToMinutes(shift.startTime)) + timeToMinutes(shift.endTime) : timeToMinutes(shift.endTime) - timeToMinutes(shift.startTime));
      blocksFor(shift.startTime, shift.endTime).forEach((seg, idx) => {
        blocks.push(
          <div key={`shift-${idx}`} className={`absolute inset-x-0.5 z-[1] flex flex-col items-center justify-center gap-0.5 overflow-hidden rounded-md px-1 text-center shadow-sm ${TEO.shift}`} style={{ top: `${seg.top}%`, height: `${seg.height}%` }} title={`${name} ${shift.startTime} - ${shift.endTime}`}>
            <span className="truncate text-[11px] font-black leading-tight">{name}</span>
            <span className="truncate font-mono text-[10px] font-bold leading-tight" dir="ltr">{mobile ? `${fmt12(timeToMinutes(shift.startTime), lang)} - ${fmt12(timeToMinutes(shift.endTime), lang)}` : `${shift.startTime} – ${shift.endTime}`}</span>
            {seg.height > 12 && <span className="truncate text-[9px] font-bold leading-tight opacity-90">{formatDuration(duration, lang)}</span>}
          </div>
        );
      });
      // Break bars sit on top of the shift block at their real time position.
      r.effectiveBreaks.forEach(item => {
        const breakName = lang === 'ar' ? (item.nameAr || item.nameEn || 'استراحة') : (item.nameEn || item.nameAr || 'Break');
        blocksFor(item.startTime, item.endTime).forEach((seg, sIdx) => {
          const barHeightPct = Math.max(seg.height, (8 / (mobile ? gridHeightMobile : gridHeightDesktop)) * 100);
          const showLabel = (barHeightPct / 100) * (mobile ? gridHeightMobile : gridHeightDesktop) >= 26;
          blocks.push(
            <button
              type="button"
              key={`brk-${item.id}-${sIdx}`}
              onClick={() => (isLeader ? openBreakEditor({ key: opts.dayKey, en: opts.dayLabel, ar: opts.dayLabel }) : setSelectedBreak({ name: breakName, startTime: item.startTime, endTime: item.endTime, durationMinutes: item.durationMinutes || 0 }))}
              className={`absolute inset-x-1 z-10 cursor-pointer overflow-hidden rounded-sm text-center shadow-md ring-1 ring-red-300/60 focus:outline-none focus:ring-2 focus:ring-red-400 ${TEO.breakBar}`}
              style={{ top: `${seg.top}%`, height: `${barHeightPct}%`, minHeight: 8 }}
              title={`${breakName}: ${item.startTime} - ${item.endTime}`}
              aria-label={`${breakName} ${item.startTime}-${item.endTime}`}
            >
              {showLabel && <span className="block truncate px-1 text-[9px] font-black leading-[1.4] text-white"><span dir="ltr">{mobile ? `${fmt12(timeToMinutes(item.startTime), lang)} - ${fmt12(timeToMinutes(item.endTime), lang)}` : `${item.startTime}–${item.endTime}`}</span> {breakName}</span>}
            </button>
          );
        });
      });
    }
    return blocks;
  };
  return (
    <section className="w-full space-y-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 shadow-sm sm:p-5" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      {/* Teleopti-style brand row: title + acting employee chip. */}
      <header className="flex flex-col gap-3 border-b-2 border-slate-800/10 pb-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-slate-900 px-3 py-2 text-white dark:bg-slate-700"><div className="text-sm font-black tracking-wide">TECH SOURCE</div><div className="text-[9px] font-bold opacity-80">{lang === 'ar' ? 'جدول الموظفين' : 'WEEKLY SCHEDULE'}</div></div>
          <div><p className="text-xs font-bold text-slate-500 dark:text-slate-400">{weekLabel}</p></div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs font-black text-slate-600 dark:text-slate-300"><Users className="h-4 w-4" />{lang === 'ar' ? 'الموظف:' : 'Employee:'}
            <select value={employee?.id || ''} onChange={e => { setSelectedEmployeeId(e.target.value); setDraft({}); setMessage(null); setError(null); }} className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs font-black text-slate-800 outline-none focus:border-blue-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100">
              {visibleEmployees.map(e => <option key={e.id} value={e.id}>{e.code ? `${e.code} - ` : ''}{lang === 'ar' ? e.nameAr : e.nameEn}</option>)}
            </select>
          </label>
        </div>
      </header>

      {/* Teleopti toolbar: range navigation + Today + Week/Month toggle. */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 dark:border-slate-700 dark:bg-slate-900/60">
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" onClick={() => setWeekStart(addDays(weekStart, -7))} className="rounded-lg border border-slate-300 bg-white p-1.5 text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800/70" aria-label={lang === 'ar' ? 'الأسبوع السابق' : 'Previous week'}><ChevronRight className="h-4 w-4" /></button>
          <span className="min-w-[150px] rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-center font-mono text-xs font-black text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100">{rangeLabel}</span>
          <button type="button" onClick={() => setWeekStart(addDays(weekStart, 7))} className="rounded-lg border border-slate-300 bg-white p-1.5 text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800/70" aria-label={lang === 'ar' ? 'الأسبوع التالي' : 'Next week'}><ChevronLeft className="h-4 w-4" /></button>
          <button type="button" onClick={() => setWeekStart(startOfWeek(new Date()))} className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-black text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800/70">📅 {lang === 'ar' ? 'اليوم' : 'Today'}</button>
          {isLeader && Object.keys(draft).length > 0 && (
            <button type="button" onClick={saveWeek} disabled={saving} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-[11px] font-black text-white hover:bg-blue-700 disabled:opacity-50"><Save className="h-3.5 w-3.5" />{saving ? (lang === 'ar' ? 'جاري الحفظ...' : 'Saving...') : (lang === 'ar' ? `حفظ التعديلات (${Object.keys(draft).length})` : `Save changes (${Object.keys(draft).length})`)}</button>
          )}
        </div>
        <div className="flex overflow-hidden rounded-lg border border-slate-300 dark:border-slate-600">
          <button type="button" onClick={() => setViewMode('week')} className={`px-3.5 py-1.5 text-[11px] font-black transition ${viewMode === 'week' ? 'bg-blue-600 text-white' : 'bg-white text-slate-700 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'}`}>{lang === 'ar' ? 'أسبوع' : 'Week'}</button>
          <button type="button" onClick={() => setViewMode('month')} className={`px-3.5 py-1.5 text-[11px] font-black transition ${viewMode === 'month' ? 'bg-blue-600 text-white' : 'bg-white text-slate-700 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'}`}>{lang === 'ar' ? 'شهر' : 'Month'}</button>
        </div>
      </div>

      {isLeader && (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/60">
          <ShiftManager shifts={shifts} lang={lang} onAddShift={onAddShift} onUpdateShift={onUpdateShift} onDeleteShift={onDeleteShift} />
        </div>
      )}

      {isLeader && <ShiftSwapPanel employees={employees} shifts={shifts} assignments={assignments} currentUser={currentUser} lang={lang} />}

      {!employee ? <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm font-bold text-slate-500 dark:border-slate-600 dark:text-slate-400">{lang === 'ar' ? 'لا يوجد موظف متاح للعرض' : 'No employee available'}</div> : viewMode === 'month' ? (
        /* ---------------- MONTH VIEW ---------------- */
        <div className="rounded-xl border border-slate-200 dark:border-slate-700">
          <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-center text-[10px] font-black text-slate-600 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300" dir="ltr">
            {(lang === 'ar' ? ['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'] : ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']).map(d => <div key={d} className="px-1 py-2">{d}</div>)}
          </div>
          <div className="grid grid-cols-7" dir="ltr">
            {monthCells.cells.map((cell, i) => {
              if (!cell.key || !cell.date) return <div key={`blank-${i}`} className="min-h-[64px] border-b border-l border-slate-100 bg-slate-50/50 dark:border-slate-800" />;
              const resolved = resolveFor(cell.key);
              const isToday = cell.key === todayKey;
              return (
                <button type="button" key={cell.key} onClick={() => { setWeekStart(startOfWeek(cell.date as Date)); setMobileDayIndex((cell.date as Date).getDay()); setViewMode('week'); }} className={`relative min-h-[64px] border-b border-l border-slate-100 p-1 text-start transition hover:bg-blue-50/60 dark:border-slate-800 dark:hover:bg-blue-500/10 ${isToday ? 'bg-blue-50 dark:bg-blue-500/15' : 'bg-white dark:bg-slate-900'}`}>
                  <span className={`text-[11px] font-black ${isToday ? 'text-blue-700 dark:text-blue-300' : 'text-slate-700 dark:text-slate-200'}`}>{cell.dayNumber}</span>
                  {resolved.status === 'working' && resolved.shift && (
                    <div className="mt-0.5 rounded bg-orange-400 px-1 py-0.5 text-[8px] font-black leading-tight text-white">{lang === 'ar' ? (resolved.shift.nameAr || resolved.shift.name) : (resolved.shift.nameEn || resolved.shift.name)}<br />{resolved.shift.startTime}–{resolved.shift.endTime}</div>
                  )}
                  {resolved.status === 'off' && <div className="tech-source-hatch mt-0.5 rounded border border-slate-300 px-1 py-0.5 text-[8px] font-black text-slate-500 dark:border-slate-600 dark:text-slate-400" style={HATCH_STYLE}>{lang === 'ar' ? 'راحة' : 'Off'}</div>}
                  {resolved.status === 'holiday' && <div className="mt-0.5 rounded bg-red-100 px-1 py-0.5 text-[8px] font-black text-red-800 dark:bg-red-500/20 dark:text-red-300">{lang === 'ar' ? 'عطلة' : 'Holiday'}</div>}
                  {resolved.status === 'annual' && <div className="mt-0.5 rounded bg-yellow-300 px-1 py-0.5 text-[8px] font-black text-yellow-900 dark:bg-yellow-500/25 dark:text-yellow-200">{lang === 'ar' ? 'سنوية' : 'Annual'}</div>}
                  {resolved.status === 'unassigned' && <div className="mt-0.5 text-[8px] font-bold text-slate-300">{lang === 'ar' ? '—' : '—'}</div>}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <>
          {/* ---------------- DESKTOP WEEK GRID (Teleopti style) ---------------- */}
          <div className="hidden overflow-x-auto rounded-xl border border-slate-200 lg:block dark:border-slate-700" dir="ltr">
            <div className="min-w-[860px]">
              {/* Day header row: month corner + MONDAY 19 ... */}
              <div className="grid border-b border-slate-200 dark:border-slate-700" style={{ gridTemplateColumns: '56px repeat(7, minmax(0, 1fr))' }}>
                <div className="flex items-end justify-center border-e border-slate-200 bg-slate-50 pb-1 text-center text-[10px] font-black text-slate-500 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-400">{monthName}</div>
                {weekResults.map(({ day, resolved }) => {
                  const isToday = day.key === todayKey;
                  return (
                    <div key={day.key} className={`border-e border-slate-200 px-1 py-1.5 text-center last:border-e-0 dark:border-slate-800 ${isToday ? 'bg-blue-50 dark:bg-blue-500/15' : 'bg-slate-50 dark:bg-slate-900/60'}`}>
                      <div className={`text-[9px] font-black uppercase tracking-wide ${isToday ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400'}`}>{lang === 'ar' ? day.ar : day.en}</div>
                      <div className={`text-base font-black leading-tight ${isToday ? 'text-blue-700 dark:text-blue-300' : 'text-slate-800 dark:text-slate-100'}`}>{day.date.getDate()}</div>
                      <div className={`mt-0.5 inline-block rounded px-1 text-[8px] font-black ${resolved.status === 'working' ? 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300' : resolved.status === 'off' ? 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300' : resolved.status === 'holiday' ? 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300' : resolved.status === 'annual' ? 'bg-yellow-200 text-yellow-800 dark:bg-yellow-500/25 dark:text-yellow-300' : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'}`}>
                        {lang === 'ar' ? (STATUS_LABELS[resolved.label] ?? STATUS_LABELS.unassigned).ar : (STATUS_LABELS[resolved.label] ?? STATUS_LABELS.unassigned).en}
                      </div>
                      {draft[day.key] !== undefined && <div className="mt-0.5 text-[8px] font-black text-blue-600 dark:text-blue-400">● {lang === 'ar' ? 'غير محفوظ' : 'unsaved'}</div>}
                    </div>
                  );
                })}
              </div>
              {/* Timeline body: shared hour axis + 7 proportional day columns. */}
              <div className="grid" style={{ gridTemplateColumns: '56px repeat(7, minmax(0, 1fr))' }}>
                <div className="relative border-e border-slate-200 dark:border-slate-700" style={{ height: gridHeightDesktop }}>
                  {axisHours.map(minutes => (
                    <span key={minutes} className="absolute -translate-y-1/2 pe-1.5 text-end font-mono text-[9px] font-bold text-slate-400 dark:text-slate-500" style={{ top: `${pctTop(minutes)}%`, right: 0, width: '100%' }}>{fmt24(minutes)}</span>
                  ))}
                </div>
                {weekResults.map(({ day, resolved }) => (
                  <div key={day.key} className={`relative border-e border-slate-200 last:border-e-0 dark:border-slate-800 ${day.key === todayKey ? 'bg-blue-50/40 dark:bg-blue-500/10' : 'bg-white dark:bg-slate-900'} ${draft[day.key] !== undefined ? 'ring-2 ring-inset ring-blue-400' : ''}`} style={{ height: gridHeightDesktop }}>
                    {renderTimelineBlocks(resolved, { dayKey: day.key, dayLabel: lang === 'ar' ? day.ar : day.en })}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ---------------- MOBILE DAY VIEW (Teleopti app style) ---------------- */}
          <div className="lg:hidden">
            <div className="mb-2 grid grid-cols-7 gap-1" dir="ltr">
              {weekResults.map(({ day }, index) => {
                const active = index === mobileDayIndex;
                return (
                  <button type="button" key={day.key} onClick={() => setMobileDayIndex(index)} className={`rounded-lg border py-1 text-center transition ${active ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-white text-slate-600'}`}>
                    <div className="text-[8px] font-black uppercase">{(lang === 'ar' ? day.ar : day.en).slice(0, 3)}</div>
                    <div className="text-xs font-black leading-tight">{day.date.getDate()}</div>
                  </button>
                );
              })}
            </div>
            {mobileDay && (() => {
              const { day, resolved } = mobileDay;
              const shift = resolved.shift;
              const bannerSub = resolved.status === 'working' && shift
                ? `${lang === 'ar' ? 'وردية' : 'Shift'} ${fmt12(timeToMinutes(shift.startTime), lang)} - ${fmt12(timeToMinutes(shift.endTime), lang)}`
                : lang === 'ar' ? (STATUS_LABELS[resolved.label] ?? STATUS_LABELS.unassigned).ar : (STATUS_LABELS[resolved.label] ?? STATUS_LABELS.unassigned).en;
              return (
                <div className="relative rounded-xl border border-slate-200 p-2 dark:border-slate-700">
                  <div className="mb-2 rounded-lg bg-blue-600 px-3 py-2 text-center text-white">
                    <div className="text-sm font-black tracking-wide">{(lang === 'ar' ? day.ar : day.en).toUpperCase()} {day.date.getDate()}</div>
                    <div className="text-[11px] font-bold opacity-95">{resolved.status === 'working' && shift ? `${lang === 'ar' ? 'وردية' : 'Shift'} ` : ''}{resolved.status === 'working' && shift ? <span dir="ltr">{fmt12(timeToMinutes(shift.startTime), lang)} - {fmt12(timeToMinutes(shift.endTime), lang)}</span> : bannerSub}</div>
                  </div>
                  <div className="relative flex" dir="ltr">
                    <div className="relative w-12 shrink-0" style={{ height: gridHeightMobile }}>
                      {axisHours.map(minutes => (
                        <span key={minutes} className="absolute -translate-y-1/2 text-end font-mono text-[9px] font-bold text-slate-400 dark:text-slate-500" style={{ top: `${pctTop(minutes)}%`, right: 4, width: '100%' }}>{fmt12(minutes, lang)}</span>
                      ))}
                    </div>
                    <div className={`relative flex-1 rounded-md border border-slate-200 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-900/60 ${draft[day.key] !== undefined ? 'ring-2 ring-inset ring-blue-400' : ''}`} style={{ height: gridHeightMobile }}>
                      {renderTimelineBlocks(resolved, { mobile: true, dayKey: day.key, dayLabel: lang === 'ar' ? day.ar : day.en })}
                    </div>
                  </div>
                  {isLeader && resolved.status === 'working' && (
                    <button type="button" onClick={() => openBreakEditor(day)} className="absolute bottom-3 end-3 flex h-11 w-11 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700" aria-label={lang === 'ar' ? 'تعديل الاستراحات' : 'Edit breaks'}><Plus className="h-5 w-5" /></button>
                  )}
                </div>
              );
            })()}
          </div>
        </>
      )}

      {/* Leader weekly assignment editor — compact, Teleopti editing row. */}
      {isLeader && employee && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700">
          <button type="button" onClick={() => setEditPanelOpen(v => !v)} className="flex w-full items-center justify-between px-4 py-2.5 text-xs font-black text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800/60">
            <span className="flex items-center gap-2"><Pencil className="h-4 w-4" />{lang === 'ar' ? 'تعيين الورديات لكل يوم (قادة فقط)' : 'Assign shifts per day (leaders only)'}</span>
            <ChevronLeft className={`h-4 w-4 transition-transform ${editPanelOpen ? '-rotate-90' : 'rotate-0 rtl:rotate-180'}`} />
          </button>
          {editPanelOpen && (
            <div className="border-t border-slate-100 p-3 dark:border-slate-800">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
                {days.map(day => {
                  const resolved = resolveFor(day.key);
                  const isWorking = resolved.status === 'working';
                  return (
                    <div key={day.key} className="space-y-1.5 rounded-lg border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-900/60">
                      <div className="text-center text-[10px] font-black text-slate-600 dark:text-slate-300">{lang === 'ar' ? day.ar : day.en}<br /><span className="font-mono">{day.date.getDate()}/{day.date.getMonth() + 1}</span></div>
                      <select value={valueFor(day.key)} onChange={e => updateDay(day.key, e.target.value)} className="h-9 w-full rounded-lg border border-slate-300 bg-white px-1.5 text-[10px] font-black text-slate-800 outline-none focus:border-blue-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100">
                        <option value={EMPTY}>{lang === 'ar' ? 'غير مُعيّن' : 'Unassigned'}</option>
                        <option value={OFF}>{lang === 'ar' ? 'راحة أسبوعية (OFF)' : 'OFF'}</option>
                        {shifts.map(s => <option key={s.id} value={s.id}>{lang === 'ar' ? s.nameAr || s.name : s.nameEn || s.name} — {s.startTime || '--'}–{s.endTime || '--'}</option>)}
                      </select>
                      <button type="button" onClick={() => openBreakEditor(day)} disabled={!isWorking} className={`inline-flex h-7 w-full items-center justify-center gap-1 rounded-lg text-[9px] font-black transition ${isWorking ? 'bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-500/15 dark:text-red-300 dark:hover:bg-red-500/25' : 'cursor-not-allowed bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'}`} title={isWorking ? (lang === 'ar' ? 'تعديل استراحات هذا اليوم' : "Edit this day's breaks") : (lang === 'ar' ? 'الاستراحات لأيام الدوام فقط' : 'Breaks only on working days')}>
                        <Coffee className="h-3 w-3" />{lang === 'ar' ? 'الاستراحات' : 'Breaks'}
                      </button>
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 flex justify-end">
                <button type="button" onClick={saveWeek} disabled={!employee || saving} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 text-xs font-black text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"><Save className="h-4 w-4" />{saving ? (lang === 'ar' ? 'جاري الحفظ...' : 'Saving...') : (lang === 'ar' ? 'حفظ الأسبوع' : 'Save week')}</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Compact legend — same palette as the timeline blocks. */}
      <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold text-slate-600 dark:text-slate-300">
        {legendItems.map(item => (
          <span key={item.id} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 dark:border-slate-700 dark:bg-slate-900">{item.swatch}{lang === 'ar' ? item.ar : item.en}</span>
        ))}
      </div>

      {message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-black text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300">{message}</div>}
      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-black text-red-700 dark:border-red-500/40 dark:bg-red-500/15 dark:text-red-300">{error}</div>}

      {/* Per-day break editor (leaders only). */}
      {breakEditor && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 p-4" role="presentation" onClick={() => { if (!breakSaving) setBreakEditor(null); }}>
          <div className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900" dir={lang === 'ar' ? 'rtl' : 'ltr'} role="dialog" aria-modal="true" onClick={event => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-black uppercase tracking-wide text-red-600 dark:text-red-400">{lang === 'ar' ? 'استراحات خاصة بالموظف' : 'Employee-specific breaks'}</div>
                <h3 className="mt-0.5 text-lg font-black text-slate-900 dark:text-white dark:text-slate-100">{breakEditor.dayName} <span className="font-mono text-xs text-slate-400 dark:text-slate-500">{breakEditor.dateKey}</span></h3>
                <p className="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">{employee?.code ? `${employee.code} - ` : ''}{lang === 'ar' ? employee?.nameAr : employee?.nameEn}{breakEditor.shift ? ` · ${breakEditor.shift.startTime}–${breakEditor.shift.endTime}` : ''}</p>
              </div>
              <button type="button" onClick={() => setBreakEditor(null)} className="rounded-lg px-2 py-1 text-xl font-bold text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:text-slate-500 dark:hover:text-slate-200" aria-label={lang === 'ar' ? 'إغلاق' : 'Close'}>×</button>
            </div>

            {breakEditor.status !== 'working' && (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-300">
                {lang === 'ar' ? 'هذا اليوم ليس يوم دوام لهذا الموظف — لا يمكن إضافة استراحات لأيام الراحة أو الإجازات.' : 'This day is not a working day for this employee — breaks cannot be added to OFF, Holiday, or Leave days.'}
              </div>
            )}

            {breakEditor.status === 'working' && (
              <>
                <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-[11px] font-bold text-slate-600 dark:bg-slate-900/60 dark:text-slate-300">{lang === 'ar' ? 'هذه الاستراحات تخص هذا الموظف فقط ولا تؤثر على زملائه في نفس الوردية.' : 'These breaks apply to this employee only and never affect teammates on the same shift.'}</p>
                <div className="mt-3 space-y-2">
                  {breakDraft.map((row, index) => (
                    <div key={row.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2.5 dark:border-slate-700 dark:bg-slate-900/60">
                      <input value={row.name ?? ''} onChange={e => updateBreakRow(index, { name: e.target.value })} placeholder={lang === 'ar' ? 'الاسم (اختياري)' : 'Name (optional)'} className="min-w-[110px] flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-bold text-slate-800 outline-none focus:border-red-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" maxLength={40} />
                      <label className="flex items-center gap-1 text-[10px] font-bold text-slate-500 dark:text-slate-400">{lang === 'ar' ? 'من' : 'From'}
                        <input type="time" value={row.startTime} onChange={e => updateBreakRow(index, { startTime: e.target.value })} className="rounded-lg border border-slate-200 bg-white px-1.5 py-1.5 font-mono text-xs text-slate-800 outline-none focus:border-red-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" required />
                      </label>
                      <label className="flex items-center gap-1 text-[10px] font-bold text-slate-500 dark:text-slate-400">{lang === 'ar' ? 'إلى' : 'To'}
                        <input type="time" value={row.endTime} onChange={e => updateBreakRow(index, { endTime: e.target.value })} className="rounded-lg border border-slate-200 bg-white px-1.5 py-1.5 font-mono text-xs text-slate-800 outline-none focus:border-red-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" required />
                      </label>
                      <span className="rounded-lg bg-white px-2 py-1 font-mono text-[10px] font-black text-red-700 dark:bg-slate-900 dark:text-red-300">{row.startTime && row.endTime ? `${Math.max(0, timeToMinutes(row.endTime) - timeToMinutes(row.startTime))}m` : '--'}</span>
                      <button type="button" onClick={() => removeBreakRow(index)} className="rounded-lg bg-red-50 p-1.5 text-red-600 hover:bg-red-100 dark:bg-red-500/15 dark:text-red-400 dark:hover:bg-red-500/25" aria-label={lang === 'ar' ? 'حذف الاستراحة' : 'Remove break'}><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  ))}
                  {breakDraft.length === 0 && <div className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-xs font-bold text-slate-400 dark:border-slate-600 dark:text-slate-500">{lang === 'ar' ? 'لا توجد استراحات — اضغط إضافة استراحة' : 'No breaks yet — add one below'}</div>}
                  <button type="button" onClick={addBreakRow} disabled={breakDraft.length >= 10} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-black text-white disabled:opacity-40 dark:bg-slate-700"><Plus className="h-3.5 w-3.5" />{lang === 'ar' ? 'إضافة استراحة' : 'Add break'}</button>
                </div>
                {breakError && <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-black text-red-700 dark:border-red-500/40 dark:bg-red-500/15 dark:text-red-300">{breakError}</div>}
                <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                  <button type="button" onClick={() => setBreakEditor(null)} disabled={breakSaving} className="rounded-xl bg-slate-100 px-4 py-2 text-xs font-black text-slate-700 disabled:opacity-50 dark:bg-slate-800/70 dark:text-slate-200">{lang === 'ar' ? 'إلغاء' : 'Cancel'}</button>
                  <button type="button" onClick={saveBreaks} disabled={breakSaving} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-black text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"><Save className="h-3.5 w-3.5" />{breakSaving ? (lang === 'ar' ? 'جاري الحفظ...' : 'Saving...') : (lang === 'ar' ? 'حفظ الاستراحات' : 'Save breaks')}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {selectedBreak && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/40 p-4" role="presentation" onClick={() => setSelectedBreak(null)}>
          <div className="w-full max-w-sm rounded-2xl border border-rose-200 bg-white dark:bg-slate-900 p-5 shadow-2xl dark:border-rose-500/40" dir={lang === 'ar' ? 'rtl' : 'ltr'} role="dialog" aria-modal="true" onClick={event => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-black text-rose-600 dark:text-rose-400">{lang === 'ar' ? 'تفاصيل البريك' : 'Break details'}</div>
                <h3 className="mt-1 text-lg font-black text-slate-900 dark:text-white dark:text-slate-100">{selectedBreak.name}</h3>
              </div>
              <button type="button" onClick={() => setSelectedBreak(null)} className="rounded-lg px-2 py-1 text-xl font-bold text-slate-400 hover:bg-slate-100 dark:bg-slate-800 hover:text-slate-700 dark:text-slate-300 dark:hover:bg-slate-800/70 dark:hover:text-slate-200" aria-label={lang === 'ar' ? 'إغلاق' : 'Close'}>×</button>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <div className="rounded-xl bg-rose-50 p-3 text-center dark:bg-rose-500/15"><div className="text-[10px] font-bold text-rose-600 dark:text-rose-400">{lang === 'ar' ? 'من' : 'From'}</div><div className="mt-1 font-mono text-sm font-black text-slate-900 dark:text-white dark:text-slate-100">{selectedBreak.startTime}</div></div>
              <div className="rounded-xl bg-rose-50 p-3 text-center dark:bg-rose-500/15"><div className="text-[10px] font-bold text-rose-600 dark:text-rose-400">{lang === 'ar' ? 'إلى' : 'To'}</div><div className="mt-1 font-mono text-sm font-black text-slate-900 dark:text-white dark:text-slate-100">{selectedBreak.endTime}</div></div>
              <div className="rounded-xl bg-rose-50 p-3 text-center dark:bg-rose-500/15"><div className="text-[10px] font-bold text-rose-600 dark:text-rose-400">{lang === 'ar' ? 'المدة' : 'Duration'}</div><div className="mt-1 text-sm font-black text-slate-900 dark:text-white dark:text-slate-100">{selectedBreak.durationMinutes} {lang === 'ar' ? 'دقيقة' : 'min'}</div></div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};


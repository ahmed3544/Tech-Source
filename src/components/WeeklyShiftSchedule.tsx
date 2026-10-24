import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Coffee, Save, Users, Clock3, Pencil, Trash2, Plus, X, Sun, Umbrella, Palmtree, CalendarOff, HelpCircle } from 'lucide-react';
import { Employee, Language, Shift, DailyShiftAssignment } from '../types';
import { ShiftManager } from './ShiftManager';
import { ShiftSwapPanel } from './ShiftSwapPanel';
import { authHeaders, errorToMessage, extractApiError, parseResponse } from '../utils/errors';
import {
  BREAK_BLOCK_CLASS,
  DayStatus,
  HolidayRange,
  LeaveRange,
  ScheduleBreak,
  STATUS_STYLES,
  isOvernightShift,
  normalizeBreaks,
  resolveDayStatus,
  timeToMinutes,
  timelineSegments,
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

const STATUS_ICONS: Partial<Record<string, React.FC<{ className?: string }>>> = {
  off: CalendarOff,
  holiday: Sun,
  annual: Palmtree,
  on_leave: Umbrella,
  unassigned: HelpCircle,
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
    return { date, key: dateKey(date), ar: ar[date.getDay()], en: en[date.getDay()] };
  }), [weekStart]);

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

  const assignmentFor = (employeeId: string, key: string) => assignments.find(a => sameId(a.employeeId ?? (a as any).employee_id, employeeId) && String(a.date ?? '').slice(0, 10) === key);
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
    const resolved = resolveDayStatus({
      dateKey: day.key,
      employeeId: employee.id,
      assignment: { ...assignmentFor(employee.id, day.key), __employeeBreaks: breaksByDate[day.key] },
      shifts,
      leaves: suppliedLeaves,
      holidays: suppliedHolidays,
    });
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
  const legendItems: Array<{ status: DayStatus; labelKey?: string }> = [
    { status: 'working' },
    { status: 'working', labelKey: 'break' },
    { status: 'off' },
    { status: 'holiday' },
    { status: 'annual' },
  ];

  return (
    <section className="w-full space-y-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 shadow-sm sm:p-5" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <header className="flex flex-col gap-3 border-b border-slate-200 dark:border-slate-700 pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-emerald-100 p-2.5 text-emerald-700"><CalendarDays className="h-5 w-5" /></div>
          <div><h1 className="text-lg font-black text-slate-900 dark:text-white">{lang === 'ar' ? 'جدول الموظفين الأسبوعي' : 'Weekly Employee Schedule'}</h1><p className="text-xs text-slate-500">{weekLabel}</p></div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setWeekStart(addDays(weekStart, -7))} className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 p-2 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:bg-slate-800/50"><ChevronRight className="h-4 w-4" /></button>
          <button type="button" onClick={() => setWeekStart(startOfWeek(new Date()))} className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-black text-slate-700 dark:text-slate-300">{lang === 'ar' ? 'هذا الأسبوع' : 'This week'}</button>
          <button type="button" onClick={() => setWeekStart(addDays(weekStart, 7))} className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 p-2 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:bg-slate-800/50"><ChevronLeft className="h-4 w-4" /></button>
        </div>
      </header>

      {isLeader && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-4">
          <ShiftManager shifts={shifts} lang={lang} onAddShift={onAddShift} onUpdateShift={onUpdateShift} onDeleteShift={onDeleteShift} />
        </div>
      )}

      {isLeader && <ShiftSwapPanel employees={employees} shifts={shifts} assignments={assignments} currentUser={currentUser} lang={lang} />}

      {/* AGENT SHIFT SWAP TOP */}
      <ShiftSwapPanel employees={employees} shifts={shifts} assignments={assignments} currentUser={currentUser} lang={lang} />

      {isLeader && <div className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_auto] md:items-end">
        <label className="block"><span className="mb-1.5 flex items-center gap-1.5 text-xs font-black text-slate-700 dark:text-slate-300"><Users className="h-4 w-4" />{lang === 'ar' ? 'الموظف' : 'Employee'}</span>
          <select value={employee?.id || ''} onChange={e => { setSelectedEmployeeId(e.target.value); setDraft({}); setMessage(null); setError(null); }} className="h-11 w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 text-sm font-bold text-slate-800 dark:text-slate-200 outline-none focus:border-emerald-500">
            {visibleEmployees.map(e => <option key={e.id} value={e.id}>{e.code ? `${e.code} - ` : ''}{lang === 'ar' ? e.nameAr : e.nameEn}</option>)}
          </select>
        </label>
        <button type="button" onClick={saveWeek} disabled={!employee || saving} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-black text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"><Save className="h-4 w-4" />{saving ? (lang === 'ar' ? 'جاري الحفظ...' : 'Saving...') : (lang === 'ar' ? 'حفظ الأسبوع' : 'Save week')}</button>
      </div>}

      {!employee ? <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-600 p-8 text-center text-sm font-bold text-slate-500">{lang === 'ar' ? 'لا يوجد موظف متاح للعرض' : 'No employee available'}</div> : <>
        {/* Seven independent day cards — one per weekday, responsive grid. */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          {days.map(day => {
            const value = valueFor(day.key);
            const resolved = resolveDayStatus({
              dateKey: day.key,
              employeeId: employee.id,
              assignment: { ...assignmentFor(employee.id, day.key), __employeeBreaks: breaksByDate[day.key] },
              shifts,
              leaves: suppliedLeaves,
              holidays: suppliedHolidays,
            });
            // The select reflects draft edits; the resolved status reflects saved data.
            const selectValue = value;
            const styles = STATUS_STYLES[resolved.status];
            const statusLabel = STATUS_LABELS[resolved.label] ?? STATUS_LABELS.unassigned;
            const StatusIcon = STATUS_ICONS[resolved.label];
            const shift = resolved.shift;
            const isWorking = resolved.status === 'working' && !!shift;
            const shiftStartMin = shift ? timeToMinutes(shift.startTime) : 0;
            const shiftEndMin = shift ? timeToMinutes(shift.endTime) : 0;
            const shiftDuration = shift ? Math.max(1, isOvernightShift(shift.startTime, shift.endTime) ? (1440 - shiftStartMin) + shiftEndMin : shiftEndMin - shiftStartMin) : 0;
            const totalBreakMinutes = resolved.effectiveBreaks.reduce((acc, b) => acc + (b.durationMinutes || 0), 0);
            const netWorkMinutes = isWorking ? Math.max(0, shiftDuration - totalBreakMinutes) : 0;
            const isDraftOff = selectValue === OFF;
            const isDraftEmpty = selectValue === EMPTY;
            const breakSourceIsOwn = resolved.ownBreaks.length > 0;

            return (
              <div key={day.key} className={`flex min-h-[240px] flex-col rounded-2xl border-2 p-3 shadow-sm transition-colors ${styles.cell}`}>
                <div className="flex items-start justify-between gap-2 border-b border-slate-200/70 pb-2">
                  <div>
                    <div className="text-sm font-black text-slate-900 dark:text-slate-100">{lang === 'ar' ? day.ar : day.en}</div>
                    <div className="font-mono text-[10px] text-slate-500">{day.key}</div>
                  </div>
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[9px] font-black tracking-wide ${styles.chip}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${styles.dot}`} />
                    {statusLabel.en}
                  </span>
                </div>

                {/* Status body — always a clear label, never color alone. */}
                {resolved.status !== 'working' && (
                  <div className="flex flex-1 flex-col items-center justify-center gap-2 py-4 text-center">
                    {StatusIcon && <StatusIcon className="h-7 w-7 text-slate-500" />}
                    <div className="text-sm font-black text-slate-800 dark:text-slate-200">{lang === 'ar' ? statusLabel.ar : statusLabel.en}</div>
                    {resolved.status === 'holiday' && (resolved.holiday?.nameAr || resolved.holiday?.nameEn) && (
                      <div className="text-xs font-bold text-slate-600 dark:text-slate-300">{lang === 'ar' ? (resolved.holiday?.nameAr ?? resolved.holiday?.nameEn) : (resolved.holiday?.nameEn ?? resolved.holiday?.nameAr)}</div>
                    )}
                    {resolved.status === 'annual' && resolved.leave && (
                      <div className="text-[11px] font-bold text-slate-600 dark:text-slate-300">{resolved.leave.startDate} → {resolved.leave.endDate}</div>
                    )}
                    {resolved.status === 'off' && <div className="text-[11px] font-bold text-slate-500">{lang === 'ar' ? 'لا يوجد دوام في هذا اليوم' : 'No working hours on this day'}</div>}
                    {isLeader && !isDraftOff && !isDraftEmpty && resolved.status === 'unassigned' && (
                      <div className="text-[10px] font-bold text-slate-400">{lang === 'ar' ? 'اختر وردية من القائمة لحفظها' : 'Pick a shift from the list to assign'}</div>
                    )}
                  </div>
                )}

                {/* Working day: shift details + timeline + employee-specific breaks. */}
                {isWorking && shift && (
                  <div className="mt-2 flex flex-1 flex-col gap-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-black text-emerald-800">{lang === 'ar' ? shift.nameAr || shift.name : shift.nameEn || shift.name}</span>
                      <span className="shrink-0 font-mono text-[10px] font-bold text-slate-600">{shift.startTime}–{shift.endTime}</span>
                    </div>
                    <div className="relative h-6 overflow-hidden rounded-lg border border-slate-200 bg-slate-50" dir="ltr">
                      {[25, 50, 75].map(mark => <span key={mark} className="absolute inset-y-0 border-l border-dashed border-slate-200" style={{ left: `${mark}%` }} />)}
                      {timelineSegments(shift.startTime, shift.endTime).map((segment, index) => (
                        <span key={`seg-${index}`} className="absolute top-1/2 z-0 h-2.5 -translate-y-1/2 rounded-full bg-emerald-500 shadow-sm" style={{ left: `${segment.left}%`, width: `${segment.width}%` }} title={`${shift.startTime} - ${shift.endTime}`} />
                      ))}
                      {resolved.effectiveBreaks.flatMap((item, idx) => (
                        timelineSegments(item.startTime, item.endTime).map((segment, sIdx) => (
                          <button type="button" key={`${item.id}-${idx}-${sIdx}`} className={`absolute top-1/2 z-10 h-2.5 -translate-y-1/2 cursor-pointer rounded-full shadow-sm transition focus:outline-none focus:ring-2 focus:ring-red-400 ${BREAK_BLOCK_CLASS}`} style={{ left: `${segment.left}%`, width: `${segment.width}%` }} title={`${item.nameEn || item.nameAr || 'Break'}: ${item.startTime} - ${item.endTime}`} onClick={() => (isLeader ? openBreakEditor(day) : setSelectedBreak({ name: lang === 'ar' ? item.nameAr || item.nameEn || 'Break' : item.nameEn || item.nameAr || 'Break', startTime: item.startTime, endTime: item.endTime, durationMinutes: item.durationMinutes || 0 }))} aria-label={`${item.nameEn || 'Break'} ${item.startTime}-${item.endTime}`} />
                        ))
                      ))}
                    </div>
                    <div className="flex items-center justify-between text-[10px] font-black">
                      <span className="text-emerald-700">{lang === 'ar' ? 'صافي العمل' : 'Net work'}: {formatDuration(netWorkMinutes, lang)}</span>
                      {totalBreakMinutes > 0 && <span className="text-red-700">{lang === 'ar' ? 'الاستراحات' : 'Breaks'}: {formatDuration(totalBreakMinutes, lang)}</span>}
                    </div>
                    <div className="space-y-1">
                      {resolved.effectiveBreaks.length === 0 && (
                        <div className="text-center text-[9px] font-bold text-slate-400">{lang === 'ar' ? 'لا توجد استراحات' : 'No breaks configured'}</div>
                      )}
                      {resolved.effectiveBreaks.map(item => (
                        <div key={`detail-${item.id}`} className="flex min-w-0 items-center justify-between gap-1 rounded-lg bg-red-50 px-2 py-1 text-[9px] font-bold text-red-700">
                          <span className="inline-flex min-w-0 items-center gap-1"><Coffee className="h-3 w-3 shrink-0" /><span className="truncate">{lang === 'ar' ? item.nameAr || item.nameEn || 'استراحة' : item.nameEn || item.nameAr || 'Break'}</span></span>
                          <span className="shrink-0 font-mono">{item.startTime}–{item.endTime}</span>
                        </div>
                      ))}
                      {isLeader && breakSourceIsOwn && (
                        <div className="text-center text-[8px] font-bold text-slate-400">{lang === 'ar' ? 'استراحات خاصة بهذا الموظف' : 'Employee-specific breaks'}</div>
                      )}
                      {isLeader && !breakSourceIsOwn && resolved.effectiveBreaks.length > 0 && (
                        <div className="text-center text-[8px] font-bold text-slate-400">{lang === 'ar' ? 'من الوردية الافتراضية' : 'From shift defaults'}</div>
                      )}
                    </div>
                  </div>
                )}

                {/* Leader controls: per-day status + break editing. */}
                {isLeader && (
                  <div className="mt-2 space-y-1.5 border-t border-slate-200/70 pt-2">
                    <select value={selectValue} onChange={e => updateDay(day.key, e.target.value)} className="h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-[11px] font-black text-slate-800 outline-none focus:border-emerald-500">
                      <option value={EMPTY}>{lang === 'ar' ? 'غير مُعيّن' : 'Unassigned'}</option>
                      <option value={OFF}>{lang === 'ar' ? 'راحة أسبوعية (OFF)' : 'OFF'}</option>
                      {shifts.map(s => <option key={s.id} value={s.id}>{lang === 'ar' ? s.nameAr || s.name : s.nameEn || s.name} — {s.startTime || '--'}–{s.endTime || '--'}</option>)}
                    </select>
                    <button type="button" onClick={() => openBreakEditor(day)} className={`inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg text-[10px] font-black transition ${isWorking ? 'bg-red-50 text-red-700 hover:bg-red-100' : 'cursor-not-allowed bg-slate-100 text-slate-400'}`} disabled={!isWorking} title={isWorking ? (lang === 'ar' ? 'تعديل استراحات هذا اليوم' : "Edit this day's breaks") : (lang === 'ar' ? 'الاستراحات متاحة فقط في أيام الدوام' : 'Breaks are only available on working days')}>
                      <Pencil className="h-3 w-3" />{lang === 'ar' ? 'تعديل الاستراحات' : 'Edit breaks'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Compact legend — same palette as the cards. */}
        <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold text-slate-600">
          <span className="rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-emerald-800"><span className="me-1.5 inline-block h-2 w-2 rounded-full bg-emerald-500" />{lang === 'ar' ? 'دوام / وردية' : 'Working'}</span>
          <span className="rounded-lg border border-red-300 bg-red-50 px-2.5 py-1.5 text-red-800"><span className="me-1.5 inline-block h-2 w-2 rounded-full bg-red-500" />{lang === 'ar' ? 'استراحة' : 'Break'}</span>
          <span className="rounded-lg border border-pink-300 bg-pink-50 px-2.5 py-1.5 text-pink-800"><span className="me-1.5 inline-block h-2 w-2 rounded-full bg-pink-500" />{lang === 'ar' ? 'راحة أسبوعية' : 'OFF'}</span>
          <span className="rounded-lg border border-red-300 bg-red-100 px-2.5 py-1.5 text-red-900"><span className="me-1.5 inline-block h-2 w-2 rounded-full bg-red-600" />{lang === 'ar' ? 'عطلة رسمية' : 'Holiday'}</span>
          <span className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-amber-800"><span className="me-1.5 inline-block h-2 w-2 rounded-full bg-amber-400" />{lang === 'ar' ? 'إجازة سنوية' : 'Annual Leave'}</span>
        </div>
      </>}

      {message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-black text-emerald-700">{message}</div>}
      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-black text-red-700">{error}</div>}

      {/* Per-day break editor (leaders only). */}
      {breakEditor && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 p-4" role="presentation" onClick={() => { if (!breakSaving) setBreakEditor(null); }}>
          <div className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900" dir={lang === 'ar' ? 'rtl' : 'ltr'} role="dialog" aria-modal="true" onClick={event => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-black uppercase tracking-wide text-red-600">{lang === 'ar' ? 'استراحات خاصة بالموظف' : 'Employee-specific breaks'}</div>
                <h3 className="mt-0.5 text-lg font-black text-slate-900 dark:text-white">{breakEditor.dayName} <span className="font-mono text-xs text-slate-400">{breakEditor.dateKey}</span></h3>
                <p className="mt-1 text-xs font-bold text-slate-500">{employee?.code ? `${employee.code} - ` : ''}{lang === 'ar' ? employee?.nameAr : employee?.nameEn}{breakEditor.shift ? ` · ${breakEditor.shift.startTime}–${breakEditor.shift.endTime}` : ''}</p>
              </div>
              <button type="button" onClick={() => setBreakEditor(null)} className="rounded-lg px-2 py-1 text-xl font-bold text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800" aria-label={lang === 'ar' ? 'إغلاق' : 'Close'}>×</button>
            </div>

            {breakEditor.status !== 'working' && (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-800">
                {lang === 'ar' ? 'هذا اليوم ليس يوم دوام لهذا الموظف — لا يمكن إضافة استراحات لأيام الراحة أو الإجازات.' : 'This day is not a working day for this employee — breaks cannot be added to OFF, Holiday, or Leave days.'}
              </div>
            )}

            {breakEditor.status === 'working' && (
              <>
                <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-[11px] font-bold text-slate-600">{lang === 'ar' ? 'هذه الاستراحات تخص هذا الموظف فقط ولا تؤثر على زملائه في نفس الوردية.' : 'These breaks apply to this employee only and never affect teammates on the same shift.'}</p>
                <div className="mt-3 space-y-2">
                  {breakDraft.map((row, index) => (
                    <div key={row.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                      <input value={row.name ?? ''} onChange={e => updateBreakRow(index, { name: e.target.value })} placeholder={lang === 'ar' ? 'الاسم (اختياري)' : 'Name (optional)'} className="min-w-[110px] flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-bold text-slate-800 outline-none focus:border-red-400" maxLength={40} />
                      <label className="flex items-center gap-1 text-[10px] font-bold text-slate-500">{lang === 'ar' ? 'من' : 'From'}
                        <input type="time" value={row.startTime} onChange={e => updateBreakRow(index, { startTime: e.target.value })} className="rounded-lg border border-slate-200 bg-white px-1.5 py-1.5 font-mono text-xs text-slate-800 outline-none focus:border-red-400" required />
                      </label>
                      <label className="flex items-center gap-1 text-[10px] font-bold text-slate-500">{lang === 'ar' ? 'إلى' : 'To'}
                        <input type="time" value={row.endTime} onChange={e => updateBreakRow(index, { endTime: e.target.value })} className="rounded-lg border border-slate-200 bg-white px-1.5 py-1.5 font-mono text-xs text-slate-800 outline-none focus:border-red-400" required />
                      </label>
                      <span className="rounded-lg bg-white px-2 py-1 font-mono text-[10px] font-black text-red-700">{row.startTime && row.endTime ? `${Math.max(0, timeToMinutes(row.endTime) - timeToMinutes(row.startTime))}m` : '--'}</span>
                      <button type="button" onClick={() => removeBreakRow(index)} className="rounded-lg bg-red-50 p-1.5 text-red-600 hover:bg-red-100" aria-label={lang === 'ar' ? 'حذف الاستراحة' : 'Remove break'}><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  ))}
                  {breakDraft.length === 0 && <div className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-xs font-bold text-slate-400">{lang === 'ar' ? 'لا توجد استراحات — اضغط إضافة استراحة' : 'No breaks yet — add one below'}</div>}
                  <button type="button" onClick={addBreakRow} disabled={breakDraft.length >= 10} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-black text-white disabled:opacity-40"><Plus className="h-3.5 w-3.5" />{lang === 'ar' ? 'إضافة استراحة' : 'Add break'}</button>
                </div>
                {breakError && <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-black text-red-700">{breakError}</div>}
                <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-3">
                  <button type="button" onClick={() => setBreakEditor(null)} disabled={breakSaving} className="rounded-xl bg-slate-100 px-4 py-2 text-xs font-black text-slate-700 disabled:opacity-50">{lang === 'ar' ? 'إلغاء' : 'Cancel'}</button>
                  <button type="button" onClick={saveBreaks} disabled={breakSaving} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-black text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"><Save className="h-3.5 w-3.5" />{breakSaving ? (lang === 'ar' ? 'جاري الحفظ...' : 'Saving...') : (lang === 'ar' ? 'حفظ الاستراحات' : 'Save breaks')}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {selectedBreak && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/40 p-4" role="presentation" onClick={() => setSelectedBreak(null)}>
          <div className="w-full max-w-sm rounded-2xl border border-rose-200 bg-white dark:bg-slate-900 p-5 shadow-2xl" dir={lang === 'ar' ? 'rtl' : 'ltr'} role="dialog" aria-modal="true" onClick={event => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-black text-rose-600">{lang === 'ar' ? 'تفاصيل البريك' : 'Break details'}</div>
                <h3 className="mt-1 text-lg font-black text-slate-900 dark:text-white">{selectedBreak.name}</h3>
              </div>
              <button type="button" onClick={() => setSelectedBreak(null)} className="rounded-lg px-2 py-1 text-xl font-bold text-slate-400 hover:bg-slate-100 dark:bg-slate-800 hover:text-slate-700 dark:text-slate-300" aria-label={lang === 'ar' ? 'إغلاق' : 'Close'}>×</button>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <div className="rounded-xl bg-rose-50 p-3 text-center"><div className="text-[10px] font-bold text-rose-600">{lang === 'ar' ? 'من' : 'From'}</div><div className="mt-1 font-mono text-sm font-black text-slate-900 dark:text-white">{selectedBreak.startTime}</div></div>
              <div className="rounded-xl bg-rose-50 p-3 text-center"><div className="text-[10px] font-bold text-rose-600">{lang === 'ar' ? 'إلى' : 'To'}</div><div className="mt-1 font-mono text-sm font-black text-slate-900 dark:text-white">{selectedBreak.endTime}</div></div>
              <div className="rounded-xl bg-rose-50 p-3 text-center"><div className="text-[10px] font-bold text-rose-600">{lang === 'ar' ? 'المدة' : 'Duration'}</div><div className="mt-1 text-sm font-black text-slate-900 dark:text-white">{selectedBreak.durationMinutes} {lang === 'ar' ? 'دقيقة' : 'min'}</div></div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

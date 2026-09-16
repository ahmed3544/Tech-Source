import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Save, Users, Clock3, Coffee } from 'lucide-react';
import { Employee, Language, Shift, DailyShiftAssignment } from '../types';
import { ShiftManager } from './ShiftManager';

interface WeeklyShiftScheduleProps {
  employees?: Employee[];
  shifts?: Shift[];
  dailyShiftAssignments?: DailyShiftAssignment[];
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
const startOfWeek = (value: Date) => { const d = new Date(value); d.setHours(0,0,0,0); d.setDate(d.getDate() - d.getDay()); return d; };
const addDays = (value: Date, amount: number) => { const d = new Date(value); d.setDate(d.getDate() + amount); return d; };
const sameId = (a: unknown, b: unknown) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();
const OFF = '__OFF__';
const EMPTY = '__EMPTY__';

const normalizeShift = (raw: any): Shift => ({
  ...raw,
  id: String(raw?.id ?? ''),
  name: raw?.name ?? raw?.nameEn ?? raw?.nameAr ?? '',
  nameAr: raw?.nameAr ?? raw?.name ?? raw?.nameEn ?? '',
  nameEn: raw?.nameEn ?? raw?.name ?? raw?.nameAr ?? '',
  startTime: String(raw?.startTime ?? raw?.start_time ?? ''),
  endTime: String(raw?.endTime ?? raw?.end_time ?? ''),
  breakMinutes: Number(raw?.breakMinutes ?? raw?.break_minutes ?? 0),
  workDays: Array.isArray(raw?.workDays) ? raw.workDays.map(Number) : (Array.isArray(raw?.work_days) ? raw.work_days.map(Number) : [0,1,2,3,4]),
  breaks: Array.isArray(raw?.breaks) ? raw.breaks : [],
}) as Shift;

const isOff = (a: any) => Boolean(a?.isOffDay ?? a?.is_off_day) || String(a?.status ?? '').toUpperCase() === 'OFF';
const shiftIdOf = (a: any) => String(a?.shiftId ?? a?.shift_id ?? '').trim();
const timeToMinutes = (value: string) => {
  const [hours, minutes] = String(value || '').split(':').map(Number);
  return Math.max(0, Math.min(24 * 60, (hours || 0) * 60 + (minutes || 0)));
};
const timePercent = (value: string) => (timeToMinutes(value) / (24 * 60)) * 100;
const formatDuration = (mins: number, lang: string) => {
  const h = Math.floor(mins / 60);
  const m = Math.floor(mins % 60);
  if (lang === 'ar') return `${h > 0 ? h + ' ساعة' : ''} ${m > 0 ? m + ' دقيقة' : ''}`.trim() || '0 دقيقة';
  return `${h > 0 ? h + 'h' : ''} ${m > 0 ? m + 'm' : ''}`.trim() || '0m';
};
const shiftSegments = (start: string, end: string) => {
  const startMinutes = timeToMinutes(start);
  const endMinutes = timeToMinutes(end);
  if (endMinutes > startMinutes) return [{ left: (startMinutes / 1440) * 100, width: ((endMinutes - startMinutes) / 1440) * 100 }];
  if (endMinutes < startMinutes) return [
    { left: (startMinutes / 1440) * 100, width: ((1440 - startMinutes) / 1440) * 100 },
    { left: 0, width: (endMinutes / 1440) * 100 },
  ];
  return [{ left: 0, width: 100 }];
};
const isOvernight = (start: string, end: string) => timeToMinutes(end) < timeToMinutes(start);

export const WeeklyShiftSchedule: React.FC<WeeklyShiftScheduleProps> = ({
  employees: suppliedEmployees = [],
  shifts: suppliedShifts = [],
  dailyShiftAssignments: suppliedAssignments = [],
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
  const [draft, setDraft] = useState<Record<string,string>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedBreak, setSelectedBreak] = useState<{ name: string; startTime: string; endTime: string; durationMinutes: number } | null>(null);

  const isLeader = currentUser?.role === 'leader' || currentUser?.role === 'admin';

  useEffect(() => {
    setEmployees(suppliedEmployees || []);
    setShifts((suppliedShifts || []).map(normalizeShift));
    setAssignments(suppliedAssignments || []);
    if (suppliedUser) {
      setCurrentUser(suppliedUser);
      if (!isLeader) setSelectedEmployeeId(suppliedUser.id);
    }
  }, [suppliedEmployees, suppliedShifts, suppliedAssignments, suppliedUser, isLeader]);

  const visibleEmployees = useMemo(() => {
    if (!isLeader) return employees.filter(e => sameId(e.id, currentUser?.id));
    if (currentUser?.role === 'admin') return employees;
    const team = employees.filter(e => sameId(e.teamLeaderId, currentUser?.id));
    if (team.length) return team;
    if (currentUser?.teamId) {
      const sameTeam = employees.filter(e => e.teamId === currentUser.teamId);
      if (sameTeam.length) return sameTeam;
    }
    return employees;
  }, [employees, isLeader, currentUser]);

  const employee = visibleEmployees.find(e => sameId(e.id, selectedEmployeeId)) || visibleEmployees[0] || null;

  useEffect(() => {
    if (employee && !visibleEmployees.some(e => sameId(e.id, selectedEmployeeId))) setSelectedEmployeeId(employee.id);
  }, [employee, visibleEmployees, selectedEmployeeId]);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const date = addDays(weekStart, i);
    const ar = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
    const en = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    return { date, key: dateKey(date), ar: ar[date.getDay()], en: en[date.getDay()] };
  }), [weekStart]);

  const assignmentFor = (employeeId: string, key: string) => assignments.find(a => sameId(a.employeeId ?? (a as any).employee_id, employeeId) && String(a.date ?? '').slice(0,10) === key);
  const valueFor = (key: string) => {
    if (draft[key] !== undefined) return draft[key];
    const a = assignmentFor(employee?.id || '', key);
    const sid = shiftIdOf(a);
    if (sid) return sid;
    if (isOff(a)) return OFF;
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
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'Cache-Control': 'no-cache' },
        body: JSON.stringify({ dailyShiftAssignments: rows, syncTimestamp: now }),
      });
      const text = await response.text();
      let data: any = {}; try { data = text ? JSON.parse(text) : {}; } catch {}
      if (!response.ok || data?.success === false) throw new Error(data?.message || data?.error || `Server error ${response.status}`);
      setAssignments(Array.isArray(data?.dailyShiftAssignments) ? data.dailyShiftAssignments : []);
      setDraft({});
      setMessage(lang === 'ar' ? 'تم حفظ جدول الأسبوع على السيرفر بنجاح' : 'Weekly schedule saved successfully');
    } catch (err: any) {
      setError(err?.message || (lang === 'ar' ? 'تعذر حفظ الجدول' : 'Could not save schedule'));
    } finally { setSaving(false); }
  };

  const weekLabel = `${dateKey(days[0].date)} → ${dateKey(days[6].date)}`;

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

      {isLeader && <div className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_auto] md:items-end">
        <label className="block"><span className="mb-1.5 flex items-center gap-1.5 text-xs font-black text-slate-700 dark:text-slate-300"><Users className="h-4 w-4" />{lang === 'ar' ? 'الموظف' : 'Employee'}</span>
          <select value={employee?.id || ''} onChange={e => { setSelectedEmployeeId(e.target.value); setDraft({}); setMessage(null); setError(null); }} className="h-11 w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 text-sm font-bold text-slate-800 dark:text-slate-200 outline-none focus:border-emerald-500">
            {visibleEmployees.map(e => <option key={e.id} value={e.id}>{e.code ? `${e.code} - ` : ''}{lang === 'ar' ? e.nameAr : e.nameEn}</option>)}
          </select>
        </label>
        <button type="button" onClick={saveWeek} disabled={!employee || saving} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-black text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"><Save className="h-4 w-4" />{saving ? (lang === 'ar' ? 'جاري الحفظ...' : 'Saving...') : (lang === 'ar' ? 'حفظ الأسبوع' : 'Save week')}</button>
      </div>}

      {!employee ? <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-600 p-8 text-center text-sm font-bold text-slate-500">{lang === 'ar' ? 'لا يوجد موظف متاح للعرض' : 'No employee available'}</div> : <>
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700"><div className="min-w-[920px]">
          <div className="grid grid-cols-7 bg-slate-800 text-white">{days.map(day => <div key={day.key} className="border-e border-slate-700 px-3 py-3 text-center last:border-e-0"><div className="text-xs font-black">{lang === 'ar' ? day.ar : day.en}</div><div className="mt-1 text-[10px] font-mono text-slate-300">{day.key}</div></div>)}</div>
          <div className="grid grid-cols-7 divide-x divide-slate-200">{days.map(day => {
            const value = valueFor(day.key); const shift = value !== OFF && value !== EMPTY ? shiftById(value) : undefined; const weekend = day.date.getDay() === 5 || day.date.getDay() === 6;
            return <div key={day.key} className={`min-h-[190px] p-3 ${weekend ? 'bg-slate-50 dark:bg-slate-800/50' : 'bg-white dark:bg-slate-900'}`}>
              <select value={value} onChange={e => updateDay(day.key, e.target.value)} disabled={!isLeader} className="h-11 w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 text-xs font-black text-slate-800 dark:text-slate-200 outline-none focus:border-emerald-500 disabled:cursor-default disabled:bg-slate-50 dark:bg-slate-800/50">
                <option value={EMPTY}>{lang === 'ar' ? 'غير مُعيّن' : 'Unassigned'}</option><option value={OFF}>{lang === 'ar' ? 'إجازة أسبوعية' : 'OFF'}</option>
                {shifts.map(s => <option key={s.id} value={s.id}>{lang === 'ar' ? s.nameAr || s.name : s.nameEn || s.name} — {s.startTime || '--'}–{s.endTime || '--'}</option>)}
              </select>
              {shift && (() => {
                const shiftStart = timeToMinutes(shift.startTime);
                const shiftEnd = timeToMinutes(shift.endTime);
                const shiftDuration = Math.max(1, isOvernight(shift.startTime, shift.endTime) ? (1440 - shiftStart) + shiftEnd : shiftEnd - shiftStart);
                const segments = shiftSegments(shift.startTime, shift.endTime);
                const overnight = isOvernight(shift.startTime, shift.endTime);
                const totalBreakMinutes = (shift.breaks || []).reduce((acc, b) => acc + (b.durationMinutes || 0), 0) + Number(shift.breakMinutes || 0);
                const netWorkMinutes = Math.max(0, shiftDuration - totalBreakMinutes);
                return (
                  <div className="mt-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-2.5">
                    <div className="mb-2 flex items-center justify-between gap-2 text-[10px] font-black text-slate-600 dark:text-slate-400">
                      <span>{lang === 'ar' ? 'مخطط ساعات اليوم' : 'Daily time map'}</span>
                      <span className="font-mono text-slate-500">{shift.startTime}–{shift.endTime}</span>
                    </div>
                    <div className="relative h-7 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900" dir="ltr">
                      {[25, 50, 75].map(mark => <span key={mark} className="absolute inset-y-0 border-l border-dashed border-slate-200 dark:border-slate-700" style={{ left: `${mark}%` }} />)}
                      {segments.map((segment, index) => <span key={`segment-${index}`} className="absolute top-1/2 z-0 h-3 -translate-y-1/2 rounded-full bg-emerald-500 shadow-sm" style={{ left: `${segment.left}%`, width: `${segment.width}%` }} title={lang === 'ar' ? `وقت العمل: ${shift.startTime} - ${shift.endTime}` : `Work: ${shift.startTime} - ${shift.endTime}`} />)}
                      {(shift.breaks || []).flatMap((item, idx) => {
                        const breakSegs = shiftSegments(item.startTime, item.endTime);
                        return breakSegs.map((segment, sIdx) => (
                          <button type="button" key={`${item.id}-${idx}-${sIdx}`} className="absolute top-1/2 z-10 h-3 -translate-y-1/2 cursor-pointer rounded-full bg-rose-500 shadow-sm transition hover:bg-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-400" style={{ left: `${segment.left}%`, width: `${segment.width}%` }} title={lang === 'ar' ? `${item.nameAr}: ${item.startTime} - ${item.endTime}` : `${item.nameEn}: ${item.startTime} - ${item.endTime}`} onClick={() => setSelectedBreak({ name: lang === 'ar' ? item.nameAr : item.nameEn, startTime: item.startTime, endTime: item.endTime, durationMinutes: item.durationMinutes || 0 })} aria-label={lang === 'ar' ? `عرض وقت ${item.nameAr}` : `Show ${item.nameEn} time`} />
                        ));
                      })}
                    </div>
                    <div className="mt-1 flex items-center justify-center gap-4 text-[9px] font-bold pb-2 border-b border-slate-200 dark:border-slate-700">
                      <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500"></span>{lang === 'ar' ? 'وقت الشفت' : 'Shift'}</div>
                      <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-500"></span>{lang === 'ar' ? 'وقت الراحة' : 'Break'}</div>
                    </div>

                    <div className="mt-2 space-y-1">
                       <div className="flex justify-between text-[10px] font-black text-emerald-700">
                          <span>{lang === 'ar' ? 'وقت العمل الصافي:' : 'Net Work Time:'}</span>
                          <span>{formatDuration(netWorkMinutes, lang)}</span>
                       </div>
                       {totalBreakMinutes > 0 && (
                       <div className="flex justify-between text-[10px] font-black text-rose-700 pb-1">
                          <span>{lang === 'ar' ? 'إجمالي وقت الراحة:' : 'Total Break Time:'}</span>
                          <span>{formatDuration(totalBreakMinutes, lang)}</span>
                       </div>
                       )}
                    </div>

                    {(shift.breaks || []).length > 0 && (
                      <div className="mt-1 space-y-1 pt-1 border-t border-rose-100">
                        {(shift.breaks || []).map(item => (
                          <div key={`detail-${item.id}`} className="flex min-w-0 items-center justify-between gap-1 text-[9px] font-bold text-rose-600">
                            <span className="min-w-0 truncate">{lang === 'ar' ? item.nameAr : item.nameEn}</span>
                            <span className="shrink-0 font-mono">{item.startTime}–{item.endTime} · {item.durationMinutes || 0}m</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {(shift.breaks || []).length === 0 && (
                      <div className="mt-2 text-[9px] font-bold text-slate-400 text-center">{lang === 'ar' ? 'لا توجد راحة مضافة' : 'No breaks added'}</div>
                    )}
                  </div>
                );
              })()}
              <div className={`mt-3 rounded-xl border p-3 ${value === OFF ? 'border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800' : value === EMPTY ? 'border-dashed border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900' : 'border-emerald-200 bg-emerald-50'}`}>
                <div className="text-xs font-black text-slate-800 dark:text-slate-200">{value === OFF ? (lang === 'ar' ? 'إجازة أسبوعية' : 'OFF') : value === EMPTY ? (lang === 'ar' ? 'غير مُعيّن' : 'Unassigned') : (shift ? (lang === 'ar' ? shift.nameAr || shift.name : shift.nameEn || shift.name) : (lang === 'ar' ? 'شفت غير معروف' : 'Unknown shift'))}</div>
                {shift && <><div className="mt-2 flex items-center gap-1.5 text-[11px] font-bold text-slate-600 dark:text-slate-400"><Clock3 className="h-3.5 w-3.5" />{shift.startTime || '--'} - {shift.endTime || '--'}</div>{(shift.breaks?.length || Number(shift.breakMinutes || 0) > 0) && <div className="mt-1 flex items-center gap-1.5 text-[11px] font-bold text-rose-600"><Coffee className="h-3.5 w-3.5" />{shift.breaks?.length ? `${shift.breaks.length} ${lang === 'ar' ? 'بريك' : 'breaks'}` : `${shift.breakMinutes} ${lang === 'ar' ? 'دقيقة راحة' : 'min break'}`}</div>}</>}
              </div>
            </div>;
          })}</div>
        </div></div>
        <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold text-slate-500"><span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-emerald-700"><span className="h-2.5 w-7 rounded-full bg-emerald-500" />{lang === 'ar' ? 'وقت العمل' : 'Work time'}</span><span className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-rose-700"><span className="h-2.5 w-7 rounded-full bg-rose-500" />{lang === 'ar' ? 'البريك' : 'Break'}</span><span className="rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 px-2.5 py-1.5 text-slate-700 dark:text-slate-300">{lang === 'ar' ? 'إجازة أسبوعية' : 'OFF'}</span><span className="rounded-lg border border-dashed border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-slate-500">{lang === 'ar' ? 'غير مُعيّن' : 'Unassigned'}</span></div>
      </>}

      {message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-black text-emerald-700">{message}</div>}
      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-black text-red-700">{error}</div>}
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

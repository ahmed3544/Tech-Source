import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Save, Users, Clock3, Coffee } from 'lucide-react';
import { Employee, Language, Shift, DailyShiftAssignment } from '../types';

interface WeeklyShiftScheduleProps {
  employees?: Employee[];
  shifts?: Shift[];
  dailyShiftAssignments?: DailyShiftAssignment[];
  currentUser?: Employee | null;
  lang: Language;
  onSaveDailyShift?: (assignment: DailyShiftAssignment) => void;
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

export const WeeklyShiftSchedule: React.FC<WeeklyShiftScheduleProps> = ({
  employees: suppliedEmployees = [],
  shifts: suppliedShifts = [],
  dailyShiftAssignments: suppliedAssignments = [],
  currentUser: suppliedUser = null,
  lang,
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
    <section className="w-full space-y-4 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-5" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <header className="flex flex-col gap-3 border-b border-slate-200 pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-emerald-100 p-2.5 text-emerald-700"><CalendarDays className="h-5 w-5" /></div>
          <div><h1 className="text-lg font-black text-slate-900">{lang === 'ar' ? 'جدول الموظفين الأسبوعي' : 'Weekly Employee Schedule'}</h1><p className="text-xs text-slate-500">{weekLabel}</p></div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setWeekStart(addDays(weekStart, -7))} className="rounded-lg border border-slate-300 bg-white p-2 text-slate-700 hover:bg-slate-50"><ChevronRight className="h-4 w-4" /></button>
          <button type="button" onClick={() => setWeekStart(startOfWeek(new Date()))} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-black text-slate-700">{lang === 'ar' ? 'هذا الأسبوع' : 'This week'}</button>
          <button type="button" onClick={() => setWeekStart(addDays(weekStart, 7))} className="rounded-lg border border-slate-300 bg-white p-2 text-slate-700 hover:bg-slate-50"><ChevronLeft className="h-4 w-4" /></button>
        </div>
      </header>

      {isLeader && <div className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_auto] md:items-end">
        <label className="block"><span className="mb-1.5 flex items-center gap-1.5 text-xs font-black text-slate-700"><Users className="h-4 w-4" />{lang === 'ar' ? 'الموظف' : 'Employee'}</span>
          <select value={employee?.id || ''} onChange={e => { setSelectedEmployeeId(e.target.value); setDraft({}); setMessage(null); setError(null); }} className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold text-slate-800 outline-none focus:border-emerald-500">
            {visibleEmployees.map(e => <option key={e.id} value={e.id}>{e.code ? `${e.code} - ` : ''}{lang === 'ar' ? e.nameAr : e.nameEn}</option>)}
          </select>
        </label>
        <button type="button" onClick={saveWeek} disabled={!employee || saving} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-black text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"><Save className="h-4 w-4" />{saving ? (lang === 'ar' ? 'جاري الحفظ...' : 'Saving...') : (lang === 'ar' ? 'حفظ الأسبوع' : 'Save week')}</button>
      </div>}

      {!employee ? <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm font-bold text-slate-500">{lang === 'ar' ? 'لا يوجد موظف متاح للعرض' : 'No employee available'}</div> : <>
        <div className="overflow-x-auto rounded-xl border border-slate-200"><div className="min-w-[920px]">
          <div className="grid grid-cols-7 bg-slate-800 text-white">{days.map(day => <div key={day.key} className="border-e border-slate-700 px-3 py-3 text-center last:border-e-0"><div className="text-xs font-black">{lang === 'ar' ? day.ar : day.en}</div><div className="mt-1 text-[10px] font-mono text-slate-300">{day.key}</div></div>)}</div>
          <div className="grid grid-cols-7 divide-x divide-slate-200">{days.map(day => {
            const value = valueFor(day.key); const shift = value !== OFF && value !== EMPTY ? shiftById(value) : undefined; const weekend = day.date.getDay() === 5 || day.date.getDay() === 6;
            return <div key={day.key} className={`min-h-[190px] p-3 ${weekend ? 'bg-slate-50' : 'bg-white'}`}>
              <select value={value} onChange={e => updateDay(day.key, e.target.value)} disabled={!isLeader} className="h-11 w-full rounded-xl border border-slate-300 bg-white px-2 text-xs font-black text-slate-800 outline-none focus:border-emerald-500 disabled:cursor-default disabled:bg-slate-50">
                <option value={EMPTY}>{lang === 'ar' ? 'غير مُعيّن' : 'Unassigned'}</option><option value={OFF}>{lang === 'ar' ? 'إجازة أسبوعية' : 'OFF'}</option>
                {shifts.map(s => <option key={s.id} value={s.id}>{lang === 'ar' ? s.nameAr || s.name : s.nameEn || s.name} — {s.startTime || '--'}–{s.endTime || '--'}</option>)}
              </select>
              <div className={`mt-3 rounded-xl border p-3 ${value === OFF ? 'border-slate-300 bg-slate-100' : value === EMPTY ? 'border-dashed border-slate-300 bg-white' : 'border-emerald-200 bg-emerald-50'}`}>
                <div className="text-xs font-black text-slate-800">{value === OFF ? (lang === 'ar' ? 'إجازة أسبوعية' : 'OFF') : value === EMPTY ? (lang === 'ar' ? 'غير مُعيّن' : 'Unassigned') : (shift ? (lang === 'ar' ? shift.nameAr || shift.name : shift.nameEn || shift.name) : (lang === 'ar' ? 'شفت غير معروف' : 'Unknown shift'))}</div>
                {shift && <><div className="mt-2 flex items-center gap-1.5 text-[11px] font-bold text-slate-600"><Clock3 className="h-3.5 w-3.5" />{shift.startTime || '--'} - {shift.endTime || '--'}</div>{Number(shift.breakMinutes || 0) > 0 && <div className="mt-1 flex items-center gap-1.5 text-[11px] font-bold text-slate-500"><Coffee className="h-3.5 w-3.5" />{shift.breakMinutes} {lang === 'ar' ? 'دقيقة راحة' : 'min break'}</div>}</>}
              </div>
            </div>;
          })}</div>
        </div></div>
        <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold text-slate-500"><span className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-emerald-700">{lang === 'ar' ? 'شفت' : 'Shift'}</span><span className="rounded-lg border border-slate-300 bg-slate-100 px-2.5 py-1.5 text-slate-700">{lang === 'ar' ? 'إجازة أسبوعية' : 'OFF'}</span><span className="rounded-lg border border-dashed border-slate-300 bg-white px-2.5 py-1.5 text-slate-500">{lang === 'ar' ? 'غير مُعيّن' : 'Unassigned'}</span></div>
      </>}

      {message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-black text-emerald-700">{message}</div>}
      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-black text-red-700">{error}</div>}
    </section>
  );
};

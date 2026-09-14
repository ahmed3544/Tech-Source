import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, Coffee, Save, Users, X } from 'lucide-react';
import { Employee, Language, Shift, DailyShiftAssignment } from '../types';
import { ShiftManager } from './ShiftManager';
import { ShiftSwapPanel } from './ShiftSwapPanel';

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
const toDateKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const startOfWeek = (value: Date) => { const d = new Date(value); d.setHours(0,0,0,0); d.setDate(d.getDate() - d.getDay()); return d; };
const addDays = (value: Date, amount: number) => { const d = new Date(value); d.setDate(d.getDate() + amount); return d; };
const OFF_DAY_SHIFT_ID = '__OFF_DAY__';
const sameId = (left: unknown, right: unknown) =>
  String(left ?? '').trim().toLowerCase() === String(right ?? '').trim().toLowerCase();

const normalizeShift = (raw: any): Shift => {
  const rawBreaks = Array.isArray(raw?.breaks)
    ? raw.breaks
    : (raw?.breakStart || raw?.breakEnd || raw?.break_start || raw?.break_end)
      ? [{
          id: `${raw?.id || 'shift'}-break`,
          nameAr: 'راحة',
          nameEn: 'Break',
          startTime: raw?.breakStart ?? raw?.break_start ?? '',
          endTime: raw?.breakEnd ?? raw?.break_end ?? '',
        }]
      : [];

  return {
    ...raw,
    id: String(raw?.id ?? ''),
    name: raw?.name ?? raw?.nameEn ?? raw?.nameAr ?? '',
    nameAr: raw?.nameAr ?? raw?.name ?? raw?.nameEn ?? '',
    nameEn: raw?.nameEn ?? raw?.name ?? raw?.nameAr ?? '',
    startTime: String(raw?.startTime ?? raw?.start_time ?? ''),
    endTime: String(raw?.endTime ?? raw?.end_time ?? ''),
    breakMinutes: Number(raw?.breakMinutes ?? raw?.break_minutes ?? 0),
    durationMinutes: Number(raw?.durationMinutes ?? raw?.duration_minutes ?? 0) || undefined,
    gracePeriodMinutes: Number(raw?.gracePeriodMinutes ?? raw?.grace_period_minutes ?? 0),
    workDays: Array.isArray(raw?.workDays)
      ? raw.workDays.map(Number)
      : (Array.isArray(raw?.work_days) ? raw.work_days.map(Number) : [0, 1, 2, 3, 4]),
    breaks: rawBreaks.map((item: any, index: number) => ({
      ...item,
      id: String(item?.id ?? `${raw?.id || 'shift'}-break-${index}`),
      startTime: String(item?.startTime ?? item?.start_time ?? ''),
      endTime: String(item?.endTime ?? item?.end_time ?? ''),
    })),
  } as Shift;
};

const asBoolean = (value: unknown) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'off';
};

const minutesOf = (value?: string | null) => {
  if (!value) return NaN;
  const m = String(value).trim().match(/^(\d{1,2})(?::(\d{2}))?(?::\d{2})?\s*(AM|PM|ص|م)?$/i);
  if (!m) return NaN;
  let hour = Number(m[1]);
  const minute = Number(m[2] || 0);
  const suffix = String(m[3] || '').toLowerCase();
  if ((suffix === 'pm' || suffix === 'م') && hour < 12) hour += 12;
  if ((suffix === 'am' || suffix === 'ص') && hour === 12) hour = 0;
  return hour * 60 + minute;
};
const timeLabel = (minutes: number) => `${pad(Math.floor(minutes / 60) % 24)}:${pad(minutes % 60)}`;
export const WeeklyShiftSchedule: React.FC<WeeklyShiftScheduleProps> = ({
  employees: suppliedEmployees, shifts: suppliedShifts, dailyShiftAssignments: suppliedAssignments,
  currentUser: suppliedUser, lang, onSaveDailyShift, onClose,
}) => {
  const [employees, setEmployees] = useState<Employee[]>(suppliedEmployees || []);
  const [shifts, setShifts] = useState<Shift[]>(suppliedShifts || []);
  const [assignments, setAssignments] = useState<DailyShiftAssignment[]>(suppliedAssignments || []);
  const [currentUser, setCurrentUser] = useState<Employee | null>(suppliedUser || null);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(suppliedUser?.id || suppliedEmployees?.[0]?.id || '');
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  const [draft, setDraft] = useState<Record<string,string>>({});
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [showShiftManager, setShowShiftManager] = useState(false);

  const isLeader = currentUser?.role === 'leader' || currentUser?.role === 'admin';

  useEffect(() => {
    if (suppliedEmployees) setEmployees(suppliedEmployees);
    if (suppliedShifts) setShifts(suppliedShifts.map(normalizeShift));
    if (suppliedAssignments) setAssignments(suppliedAssignments);
    if (suppliedUser) { setCurrentUser(suppliedUser); setSelectedEmployeeId(suppliedUser.id); }
  }, [suppliedEmployees, suppliedShifts, suppliedAssignments, suppliedUser]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const storedUser = localStorage.getItem('logged_in_user');
        if (!suppliedUser && storedUser) {
          const parsed = JSON.parse(storedUser) as Employee;
          if (parsed?.id && parsed.status !== 'inactive' && !cancelled) { setCurrentUser(parsed); setSelectedEmployeeId(parsed.id); }
        }
        const storedAssignments = localStorage.getItem('daily_shift_assignments');
        if (storedAssignments && !suppliedAssignments && !cancelled) { try { setAssignments(JSON.parse(storedAssignments)); } catch {} }
        if ((!suppliedEmployees?.length || !suppliedShifts?.length) && !cancelled) {
          setLoading(true);
          const response = await fetch('/api/data', { cache: 'no-store' });
          if (response.ok) {
            const data = await response.json();
            if (!cancelled) {
              if (Array.isArray(data.employees)) setEmployees(data.employees);
              if (Array.isArray(data.shifts)) setShifts(data.shifts.map(normalizeShift));
              if (Array.isArray(data.dailyShiftAssignments)) setAssignments(data.dailyShiftAssignments);
            }
          }
        }
      } catch (err) { console.error('Failed to load weekly schedule', err); }
      finally { if (!cancelled) setLoading(false); }
    };
    void load();
    return () => { cancelled = true; };
  }, [suppliedEmployees, suppliedShifts, suppliedAssignments, suppliedUser]);

  const visibleEmployees = useMemo(() => {
    if (!isLeader) return employees.filter(e => sameId(e.id, currentUser?.id));
    if (currentUser?.role === 'admin') return employees;
    const explicitTeam = employees.some(e => sameId(e.teamLeaderId, currentUser?.id));
    if (explicitTeam) return employees.filter(e => sameId(e.teamLeaderId, currentUser?.id));
    if (currentUser?.teamId) { const sameTeam = employees.filter(e => e.teamId === currentUser.teamId); if (sameTeam.length) return sameTeam; }
    return employees;
  }, [employees, isLeader, currentUser]);
  const selectableEmployees = useMemo(() => (isLeader && visibleEmployees.length === 0 ? employees : visibleEmployees), [isLeader, visibleEmployees, employees]);
  const employee = selectableEmployees.find(e => sameId(e.id, selectedEmployeeId)) || selectableEmployees[0];

  useEffect(() => {
    if (employee && !visibleEmployees.some(e => sameId(e.id, selectedEmployeeId))) setSelectedEmployeeId(employee.id);
    setSelectedEmployeeIds(prev => {
      const next = prev.filter(id => selectableEmployees.some(e => sameId(e.id, id)));
      return next.length === prev.length && next.every((id, index) => id === prev[index]) ? prev : next;
    });
  }, [employee, selectedEmployeeId, selectableEmployees, visibleEmployees]);

  const days = useMemo(() => Array.from({length:7}, (_, index) => {
    const date = addDays(weekStart,index);
    const ar = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
    const en = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    return { date, key: toDateKey(date), labelAr: ar[date.getDay()], labelEn: en[date.getDay()] };
  }), [weekStart]);

  const assignmentFor = (employeeId: string, date: string) => assignments.find(a =>
    sameId(a.employeeId ?? (a as any).employee_id, employeeId) &&
    String(a.date).slice(0, 10) === date
  );
  const getValue = (date: string) => {
    const assignment = assignmentFor(employee?.id || '', date);
    if (draft[date] !== undefined) return draft[date];
    const shiftId = String(assignment?.shiftId ?? (assignment as any)?.shift_id ?? '').trim();
    if (shiftId) return shiftId;
    if (asBoolean(assignment?.isOffDay ?? (assignment as any)?.is_off_day) || String((assignment as any)?.status ?? '').toUpperCase() === 'OFF') return OFF_DAY_SHIFT_ID;
    const baseShift = employee?.shiftId ? shifts.find(s => sameId(s.id, employee.shiftId)) : undefined;
    const dow = new Date(`${date}T00:00:00`).getDay();
    if (baseShift && Array.isArray(baseShift.workDays) && baseShift.workDays.includes(dow)) return baseShift.id;
    return baseShift ? OFF_DAY_SHIFT_ID : '';
  };
  const shiftFor = (employeeId: string, date: string) => {
    const assignment = assignmentFor(employeeId,date);
    const shiftId = String(assignment?.shiftId ?? (assignment as any)?.shift_id ?? '').trim();
    if (shiftId) return shifts.find(s => sameId(s.id, shiftId));
    if (asBoolean(assignment?.isOffDay ?? (assignment as any)?.is_off_day)) return undefined;
    const base = employees.find(e => sameId(e.id, employeeId));
    return base?.shiftId ? shifts.find(s => s.id === base.shiftId) : undefined;
  };

  const persistAssignments = async (next: DailyShiftAssignment[]) => {
    const clean = next.map(item => {
      const employeeId = String(item.employeeId ?? (item as any).employee_id ?? '').trim();
      const date = String(item.date ?? '').trim();
      const rawShift = String(item.shiftId ?? (item as any).shift_id ?? '').trim();
      const isOffDay = rawShift ? false : (asBoolean(item.isOffDay ?? (item as any).is_off_day) || String((item as any).status || '').toUpperCase() === 'OFF');
      const shiftId = isOffDay ? null : (rawShift || null);
      return { employee_id: employeeId, date, is_off_day: isOffDay, shift_id: shiftId };
    }).filter(item => item.employee_id && /^\d{4}-\d{2}-\d{2}$/.test(item.date) && (item.is_off_day || item.shift_id));
    const syncTimestamp = new Date().toISOString();
    const syncRevision = `${syncTimestamp}-${Math.random().toString(36).slice(2,10)}`;
    const response = await fetch('/api/schedule-sync', { method:'POST', credentials:'include', cache:'no-store', headers:{'Content-Type':'application/json','Accept':'application/json','Cache-Control':'no-cache','Pragma':'no-cache','X-Sync-Timestamp':syncTimestamp,'X-Sync-Revision':syncRevision}, body:JSON.stringify({dailyShiftAssignments:clean,syncTimestamp,syncRevision}) });
    const text = await response.text();
    let data:any = {}; try { data = text ? JSON.parse(text) : {}; } catch {}
    if (!response.ok) throw new Error(`Server error ${response.status}: ${data?.message || data?.error || text || 'Sync failed'}`);
    if (data?.success === false) throw new Error(data?.message || data?.error || 'Server returned success:false');
    const serverAssignments = Array.isArray(data?.dailyShiftAssignments) ? data.dailyShiftAssignments : [];
    const finalAssignments = (serverAssignments.length ? serverAssignments : clean.map(item => ({employeeId:item.employee_id,date:item.date,shiftId:item.shift_id || '',isOffDay:item.is_off_day}))).map((item:any) => {
      const shiftId = String(item.shiftId ?? item.shift_id ?? '').trim();
      const isOffDay = shiftId ? false : (asBoolean(item.isOffDay ?? item.is_off_day) || String(item.status ?? '').toUpperCase() === 'OFF');
      return { ...item, employeeId:String(item.employeeId ?? item.employee_id ?? ''), date:String(item.date ?? '').slice(0,10), shiftId, isOffDay };
    });
    setAssignments(finalAssignments as DailyShiftAssignment[]);
    localStorage.setItem('daily_shift_assignments', JSON.stringify(finalAssignments));
    return { assignments: finalAssignments };
  };

  const buildWeekForEmployee = (employeeId: string, sourceEmployeeId: string, base: DailyShiftAssignment[], updatedAt: string) => {
    let next = [...base];
    for (const day of days) {
      const draftValue = employeeId === sourceEmployeeId && Object.prototype.hasOwnProperty.call(draft,day.key) ? draft[day.key] : undefined;
      const source = assignmentFor(sourceEmployeeId,day.key);
      const sourceEmployee = employees.find(e => sameId(e.id, sourceEmployeeId));
      const baseShift = sourceEmployee?.shiftId ? shifts.find(s => sameId(s.id, sourceEmployee.shiftId)) : undefined;
      const works = Boolean(baseShift && Array.isArray(baseShift.workDays) && baseShift.workDays.includes(day.date.getDay()));
      const sourceShiftId = String(source?.shiftId ?? (source as any)?.shift_id ?? '').trim();
      const sourceOff = asBoolean(source?.isOffDay ?? (source as any)?.is_off_day) || String((source as any)?.status ?? '').toUpperCase() === 'OFF';
      let shiftId = '';
      let isOffDay = false;
      if (draftValue !== undefined) {
        shiftId = draftValue === OFF_DAY_SHIFT_ID ? '' : String(draftValue || '').trim();
        isOffDay = draftValue === OFF_DAY_SHIFT_ID;
      } else if (sourceShiftId) {
        shiftId = sourceShiftId;
        isOffDay = false;
      } else if (sourceOff) {
        shiftId = '';
        isOffDay = true;
      } else if (baseShift?.id && works) {
        shiftId = baseShift.id;
        isOffDay = false;
      } else {
        shiftId = '';
        isOffDay = true;
      }
       const index = next.findIndex(a => sameId(a.employeeId ?? (a as any).employee_id, employeeId) && String(a.date).slice(0, 10) === day.key);
      const assignment: DailyShiftAssignment = { employeeId, date:day.key, shiftId, isOffDay, assignedBy:currentUser?.id, updatedAt };
      if (index >= 0) next[index] = assignment; else next.push(assignment);
    }
    return next;
  };

  const saveWeek = async () => {
    if (!employee || !isLeader) return;
    setError(null); const updatedAt = new Date().toISOString(); const next = buildWeekForEmployee(employee.id,employee.id,assignments,updatedAt);
    try {
      const result = await persistAssignments(next);
      days.forEach(day => { const saved = result.assignments.find((a:any) => String(a.employeeId ?? a.employee_id) === String(employee.id) && String(a.date) === day.key); if (saved) onSaveDailyShift?.({employeeId:String(saved.employeeId ?? saved.employee_id),date:String(saved.date),shiftId:saved.shiftId ?? saved.shift_id ?? '',isOffDay:asBoolean(saved.isOffDay ?? saved.is_off_day),assignedBy:saved.assignedBy ?? saved.assigned_by ?? currentUser?.id,updatedAt:saved.updatedAt ?? saved.updated_at ?? updatedAt}); });
      setSavedAt(new Date().toLocaleTimeString(lang === 'ar' ? 'ar-EG' : 'en-US',{hour:'2-digit',minute:'2-digit'})); setDraft({}); setError(lang === 'ar' ? 'تم حفظ وتحديث الجدول بنجاح على السيرفر' : 'Schedule saved successfully on the server.');
    } catch (err:any) { setError(lang === 'ar' ? `فشل حفظ الجدول على السيرفر: ${err?.message || 'خطأ غير معروف'}` : `Server failed to save the schedule: ${err?.message || 'Unknown error'}`); }
  };

  const applyScheduleToSelectedEmployees = async () => {
    if (!employee || !isLeader || !selectedEmployeeIds.length) return;
    setBulkSaving(true); setError(null); const updatedAt = new Date().toISOString();
    try { let next = [...assignments]; for (const id of selectedEmployeeIds) next = buildWeekForEmployee(id,employee.id,next,updatedAt); await persistAssignments(next); setSelectedEmployeeIds([]); setSavedAt(new Date().toLocaleTimeString(lang === 'ar' ? 'ar-EG' : 'en-US',{hour:'2-digit',minute:'2-digit'})); setError(lang === 'ar' ? 'تم تطبيق الجدول وحفظه على السيرفر' : 'Schedule copied and saved on the server.'); }
    catch (err:any) { setError(lang === 'ar' ? `فشل الحفظ: ${err?.message || 'خطأ غير معروف'}` : `Save failed: ${err?.message || 'Unknown error'}`); }
    finally { setBulkSaving(false); }
  };

  const updateShiftList = (next: Shift[]) => { setShifts(next); try { localStorage.setItem('attendance_shifts',JSON.stringify(next)); } catch {} void fetch('/api/sync',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({shifts:next})}); };

  const getShiftBreaks = (shift: Shift) => {
    const configuredBreaks = Array.isArray(shift.breaks) ? shift.breaks : [];
    const breakMinutes = Number(shift.breakMinutes || 0);
    const start = minutesOf(shift.startTime);
    const end = minutesOf(shift.endTime);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return configuredBreaks;
    return configuredBreaks.length || breakMinutes <= 0
      ? configuredBreaks
      : [{
          id: `${shift.id}-default-break`,
          nameAr: 'راحة',
          nameEn: 'Break',
          startTime: timeLabel(start + Math.floor((end - start) / 2)),
          endTime: timeLabel(start + Math.floor((end - start) / 2) + Math.min(breakMinutes, end - start)),
        }];
  };
  const formatShiftTime = (start?: string, end?: string) => {
    const startMinutes = minutesOf(start);
    const endMinutes = minutesOf(end);
    if (Number.isFinite(startMinutes) && Number.isFinite(endMinutes)) return `${timeLabel(startMinutes)} - ${timeLabel(endMinutes)}`;
    return [start, end].filter(Boolean).join(' - ') || (lang === 'ar' ? 'الوقت غير محدد' : 'Time not set');
  };

  return <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-950/70 p-2 backdrop-blur-sm sm:p-4 md:p-6">
    <section className="w-full max-w-7xl overflow-hidden rounded-2xl border border-slate-300 bg-slate-50 shadow-2xl sm:rounded-3xl">
      <div className="sticky top-0 z-30 bg-slate-900 p-3 text-white sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-400/30 bg-emerald-500/20"><CalendarDays className="h-5 w-5 text-emerald-300" /></div><div className="min-w-0"><h3 className="truncate text-base font-black sm:text-lg">{lang==='ar'?'الجدول الأسبوعي':'Weekly Schedule'}</h3><p className="font-mono text-[10px] text-slate-400">{toDateKey(weekStart)} → {toDateKey(addDays(weekStart,6))}</p></div></div>
          <div className="flex items-center gap-2 overflow-x-auto">{isLeader && <button onClick={()=>setShowShiftManager(true)} className="shrink-0 rounded-xl border border-emerald-400 bg-emerald-600 px-3 py-2 text-xs font-bold text-white">{lang==='ar'?'إدارة الشفتات':'Manage Shifts'}</button>}<button onClick={()=>setWeekStart(addDays(weekStart,-7))} className="min-w-10 rounded-xl border border-slate-700 bg-slate-800 p-2.5"><ChevronRight className="h-4 w-4" /></button><button onClick={()=>setWeekStart(startOfWeek(new Date()))} className="shrink-0 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2.5 text-xs font-bold">{lang==='ar'?'الأسبوع الحالي':'Current Week'}</button><button onClick={()=>setWeekStart(addDays(weekStart,7))} className="min-w-10 rounded-xl border border-slate-700 bg-slate-800 p-2.5"><ChevronLeft className="h-4 w-4" /></button>{onClose && <button onClick={onClose} className="min-w-10 rounded-xl border border-rose-400/20 bg-rose-500/15 p-2.5"><X className="h-4 w-4" /></button>}</div>
        </div>
      </div>
      <div className="space-y-4 bg-slate-100 p-3 sm:p-5">
        {loading && <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-500">{lang==='ar'?'جاري تحميل الجدول...':'Loading schedule...'}</div>}
        {isLeader && <>
          <label className="block max-w-xl text-xs font-black text-slate-700"><span className="mb-1.5 flex items-center gap-1.5"><Users className="h-3.5 w-3.5" />{lang==='ar'?'موظف الجدول الأساسي':'Schedule Template Employee'}</span><select value={employee?.id||''} onChange={e=>{setSelectedEmployeeId(e.target.value);setDraft({});setSavedAt(null);}} className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-bold text-slate-900 shadow-sm">{selectableEmployees.map(e=><option key={e.id} value={e.id}>{e.code} - {lang==='ar'?e.nameAr:e.nameEn}</option>)}</select></label>
          <div className="space-y-3 rounded-2xl border border-emerald-300 bg-emerald-50 p-3 shadow-sm sm:p-4"><div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><div className="text-xs font-black text-slate-900">{lang==='ar'?'تطبيق الجدول على عدة موظفين':'Apply Schedule to Multiple Employees'}</div><p className="mt-1 text-[10px] text-slate-600">{lang==='ar'?'انسخ نفس الأسبوع للموظفين المحددين.':'Copy the same week to selected employees.'}</p></div><div className="flex gap-2"><button onClick={()=>setSelectedEmployeeIds(selectableEmployees.map(e=>e.id))} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-[10px] font-black text-slate-800">{lang==='ar'?'تحديد الكل':'Select All'}</button><button onClick={()=>setSelectedEmployeeIds([])} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-[10px] font-black text-slate-800">{lang==='ar'?'مسح':'Clear'}</button></div></div><div className="text-[10px] font-bold text-emerald-700">{lang==='ar'?`المحدد: ${selectedEmployeeIds.length}`:`Selected: ${selectedEmployeeIds.length}`}</div><div className="grid max-h-48 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">{selectableEmployees.map(e=><label key={e.id} className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2"><input type="checkbox" checked={selectedEmployeeIds.includes(e.id)} onChange={ev=>setSelectedEmployeeIds(prev=>ev.target.checked?[...new Set([...prev,e.id])]:prev.filter(id=>id!==e.id))} className="h-4 w-4 rounded border-slate-300 text-emerald-600" /><span className="truncate text-xs font-bold text-slate-800">{e.code} - {lang==='ar'?e.nameAr:e.nameEn}</span></label>)}</div><button disabled={!selectedEmployeeIds.length||bulkSaving} onClick={applyScheduleToSelectedEmployees} className="min-h-11 w-full rounded-xl bg-emerald-600 text-xs font-black text-white shadow-sm disabled:opacity-50">{bulkSaving?(lang==='ar'?'جاري التطبيق...':'Applying...'):(lang==='ar'?`تطبيق الجدول على ${selectedEmployeeIds.length} موظف`:`Apply Schedule to ${selectedEmployeeIds.length} Selected Employees`)}</button></div>
        </>}

         {employee ? <>
           <div className="rounded-2xl border border-slate-300 bg-white p-3 shadow-md sm:p-4" dir={lang==='ar'?'rtl':'ltr'}>
             <div className="mb-4 flex flex-col gap-2 border-b border-slate-200 pb-3 sm:flex-row sm:items-center sm:justify-between">
               <div><div className="text-sm font-black text-slate-900">{lang==='ar' ? 'أسبوع الموظف' : 'Employee week'}</div><div className="mt-1 text-xs font-bold text-slate-500">{employee.code} · {lang==='ar' ? employee.nameAr : employee.nameEn}</div></div>
               <div className="rounded-lg bg-slate-100 px-3 py-2 text-center font-mono text-[10px] font-bold text-slate-600">{toDateKey(weekStart)} → {toDateKey(addDays(weekStart,6))}</div>
             </div>
             <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
               {days.map(day => {
                 const value = getValue(day.key); const off = value === OFF_DAY_SHIFT_ID; const selectedShift = !off && value ? shifts.find(s => sameId(s.id, value)) : shiftFor(employee.id, day.key); const breaks = selectedShift ? getShiftBreaks(selectedShift) : []; const isWeekend = day.date.getDay() === 5 || day.date.getDay() === 6; const isToday = toDateKey(new Date()) === day.key;
                 return <article key={day.key} className={`flex min-h-[245px] flex-col overflow-hidden rounded-2xl border-2 ${isToday ? 'border-blue-500 ring-2 ring-blue-100' : 'border-slate-200'} ${isWeekend ? 'bg-slate-50' : 'bg-white'}`}>
                   <header className={`px-3 py-3 ${isToday ? 'bg-blue-600 text-white' : isWeekend ? 'bg-slate-200 text-slate-700' : 'bg-slate-800 text-white'}`}><div className="flex items-center justify-between gap-2"><span className="text-sm font-black">{lang==='ar' ? day.labelAr : day.labelEn}</span>{isToday && <span className="rounded-full bg-white/20 px-2 py-0.5 text-[9px] font-black">{lang==='ar' ? 'اليوم' : 'Today'}</span>}</div><div className={`mt-1 font-mono text-[10px] ${isToday ? 'text-blue-100' : 'text-slate-300'}`}>{day.key}</div></header>
                   <div className="flex flex-1 flex-col gap-2 p-3">
                     {off ? <div className="flex flex-1 flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-100 px-2 text-center"><div className="text-sm font-black text-slate-600">{lang==='ar' ? 'راحة' : 'OFF'}</div><div className="mt-1 text-[10px] font-bold text-slate-400">{lang==='ar' ? 'لا يوجد شفت' : 'No shift'}</div></div>
                       : selectedShift ? <div className="flex flex-1 flex-col gap-2"><div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3"><div className="text-xs font-black text-emerald-900">{selectedShift.nameAr || selectedShift.nameEn || selectedShift.name || (lang==='ar' ? 'شفت العمل' : 'Work shift')}</div><div className="mt-2 flex items-center gap-1.5 text-[11px] font-black text-emerald-700"><Clock3 className="h-4 w-4" />{formatShiftTime(selectedShift.startTime, selectedShift.endTime)}</div></div>{breaks.length ? <div className="space-y-1.5">{breaks.map((br:any, index:number) => <div key={br.id || index} className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-2.5 py-2 text-[10px] font-black text-red-700"><Coffee className="h-3.5 w-3.5 shrink-0" /><span>{br.nameAr || br.nameEn || (lang==='ar' ? 'بريك' : 'Break')}</span><span className="ms-auto font-mono">{formatShiftTime(br.startTime, br.endTime)}</span></div>)}</div> : <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-[10px] font-bold text-slate-400">{lang==='ar' ? 'لا يوجد بريك مسجل' : 'No break configured'}</div>}</div>
                       : <div className="flex flex-1 flex-col items-center justify-center rounded-xl border-2 border-dashed border-amber-300 bg-amber-50 px-2 text-center"><div className="text-xs font-black text-amber-800">{lang==='ar' ? 'غير محدد' : 'Not assigned'}</div><div className="mt-1 text-[10px] font-bold text-amber-600">{lang==='ar' ? 'اختر شفتًا لهذا اليوم' : 'Choose a shift for this day'}</div></div>}
                     {isLeader && <div className="mt-auto space-y-2 border-t border-slate-200 pt-2"><label className="flex cursor-pointer items-center gap-2 text-[10px] font-black text-slate-700"><input type="checkbox" checked={off} onChange={e=>setDraft(prev=>({...prev,[day.key]:e.target.checked?OFF_DAY_SHIFT_ID:(assignmentFor(employee.id,day.key)?.shiftId || '')}))} className="h-4 w-4 rounded border-slate-300 text-emerald-600" />{lang==='ar' ? 'يوم راحة' : 'Day off'}</label><select value={off?'':value} disabled={off} onChange={e=>setDraft(prev=>({...prev,[day.key]:e.target.value ? e.target.value : OFF_DAY_SHIFT_ID}))} className="min-h-9 w-full rounded-lg border border-slate-300 bg-white px-2 py-1 text-[10px] font-bold text-slate-800"><option value="">{shifts.length ? (lang==='ar' ? 'اختر الشفت' : 'Choose shift') : (lang==='ar' ? 'لا توجد شفتات' : 'No shifts')}</option>{shifts.map(s=><option key={s.id} value={s.id}>{s.nameAr||s.nameEn||s.name} · {formatShiftTime(s.startTime,s.endTime)}</option>)}</select></div>}
                   </div>
                 </article>;
               })}
             </div>
           </div>
           <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-300 bg-white px-3 py-3 text-[10px] font-bold text-slate-600 shadow-sm"><span className="inline-flex items-center gap-1.5"><i className="h-3 w-3 rounded bg-emerald-500" />{lang==='ar' ? 'شفت العمل' : 'Work shift'}</span><span className="inline-flex items-center gap-1.5"><i className="h-3 w-3 rounded bg-red-500" />{lang==='ar' ? 'البريك' : 'Break'}</span><span className="inline-flex items-center gap-1.5"><i className="h-3 w-3 rounded bg-slate-300" />{lang==='ar' ? 'راحة' : 'Day off'}</span><span className="inline-flex items-center gap-1.5"><i className="h-3 w-3 rounded bg-amber-100 ring-1 ring-amber-300" />{lang==='ar' ? 'غير محدد' : 'Not assigned'}</span></div>
           <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="text-xs font-medium text-slate-600">{isLeader ? (lang==='ar' ? 'اختر الشفت من بطاقة اليوم ثم احفظ الأسبوع.' : 'Choose a shift in each day card, then save the week.') : (lang==='ar' ? 'الأخضر = ساعات العمل، الأحمر = البريك، الرمادي = راحة.' : 'Green = work hours, red = break, gray = day off.')}</div>{isLeader && <button onClick={saveWeek} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-black text-white shadow hover:bg-emerald-700 sm:w-auto"><Save className="h-4 w-4" />{lang==='ar' ? 'حفظ الجدول' : 'Save Schedule'}</button>}</div>
          {savedAt&&<div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700"><Check className="h-4 w-4" />{lang==='ar'?`تم حفظ جدول الأسبوع الساعة ${savedAt}`:`Week saved at ${savedAt}`}</div>}
          {error&&<div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">{error}</div>}
        </> : <div className="py-10 text-center text-sm text-slate-500">{lang==='ar'?'لا يوجد موظف لعرض الجدول.':'No employee is available.'}</div>}
        <ShiftSwapPanel employees={employees} shifts={shifts} assignments={assignments} currentUser={currentUser} lang={lang} />
      </div>
    </section>
    {showShiftManager&&isLeader&&<div className="fixed inset-0 z-[120] overflow-y-auto bg-slate-950/60 p-2 backdrop-blur-sm sm:p-4"><div className="mx-auto mt-2 max-w-4xl rounded-2xl bg-white p-3 shadow-2xl sm:mt-8 sm:rounded-3xl sm:p-5"><div className="mb-4 flex items-center justify-between gap-3"><h3 className="text-base font-black text-slate-900 sm:text-lg">{lang==='ar'?'إدارة الشفتات':'Shift Management'}</h3><button onClick={()=>setShowShiftManager(false)} className="min-h-10 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold">{lang==='ar'?'إغلاق':'Close'}</button></div><ShiftManager shifts={shifts} lang={lang} onAddShift={shift=>updateShiftList([...shifts,shift])} onUpdateShift={shift=>updateShiftList(shifts.map(item=>item.id===shift.id?shift:item))} onDeleteShift={shiftId=>updateShiftList(shifts.filter(item=>item.id!==shiftId))} /></div></div>}
  </div>;
};

import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Check, ChevronLeft, ChevronRight, Save, Users, X } from 'lucide-react';
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
const CALENDAR_START = 6;
const CALENDAR_END = 22;
const HOUR_HEIGHT = 64;

const minutesOf = (value?: string | null) => {
  if (!value) return NaN;
  const m = String(value).trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return NaN;
  return Number(m[1]) * 60 + Number(m[2]);
};
const formatHour = (hour: number, ar: boolean) => {
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const display = hour % 12 || 12;
  return ar ? `${String(display).padStart(2,'0')}:00 ${hour >= 12 ? 'م' : 'ص'}` : `${String(display).padStart(2,'0')}:00 ${suffix}`;
};

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
    if (suppliedShifts) setShifts(suppliedShifts);
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
              if (Array.isArray(data.shifts)) setShifts(data.shifts);
              if (Array.isArray(data.dailyShiftAssignments)) setAssignments(data.dailyShiftAssignments);
              if (storedUser && !suppliedUser && Array.isArray(data.employees)) {
                const parsed = JSON.parse(storedUser) as Employee;
                const canonical = data.employees.find((e: Employee) => e.id === parsed.id);
                if (canonical) { setCurrentUser(canonical); setSelectedEmployeeId(canonical.id); }
              }
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
    if (!isLeader) return employees.filter(e => e.id === currentUser?.id);
    if (currentUser?.role === 'admin') return employees;
    const explicitTeam = employees.some(e => e.teamLeaderId === currentUser?.id);
    if (explicitTeam) return employees.filter(e => e.teamLeaderId === currentUser?.id);
    if (currentUser?.teamId) { const sameTeam = employees.filter(e => e.teamId === currentUser.teamId); if (sameTeam.length) return sameTeam; }
    return employees;
  }, [employees, isLeader, currentUser]);
  const selectableEmployees = useMemo(() => (isLeader && visibleEmployees.length === 0 ? employees : visibleEmployees), [isLeader, visibleEmployees, employees]);
  const employee = selectableEmployees.find(e => e.id === selectedEmployeeId) || selectableEmployees[0];

  useEffect(() => {
    if (employee && !visibleEmployees.some(e => e.id === selectedEmployeeId)) setSelectedEmployeeId(employee.id);
    setSelectedEmployeeIds(prev => {
      const next = prev.filter(id => selectableEmployees.some(e => e.id === id));
      return next.length === prev.length && next.every((id, index) => id === prev[index]) ? prev : next;
    });
  }, [employee, selectedEmployeeId, selectableEmployees, visibleEmployees]);

  const days = useMemo(() => Array.from({length:7}, (_, index) => {
    const date = addDays(weekStart,index);
    const ar = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
    const en = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    return { date, key: toDateKey(date), labelAr: ar[date.getDay()], labelEn: en[date.getDay()] };
  }), [weekStart]);

  const assignmentFor = (employeeId: string, date: string) => assignments.find(a => String(a.employeeId) === String(employeeId) && a.date === date);
  const getValue = (date: string) => {
    const assignment = assignmentFor(employee?.id || '', date);
    if (assignment?.isOffDay) return OFF_DAY_SHIFT_ID;
    if (draft[date] !== undefined) return draft[date];
    if (assignment?.shiftId) return assignment.shiftId;
    const baseShift = employee?.shiftId ? shifts.find(s => s.id === employee.shiftId) : undefined;
    const dow = new Date(`${date}T00:00:00`).getDay();
    if (baseShift && Array.isArray(baseShift.workDays) && baseShift.workDays.includes(dow)) return baseShift.id;
    return baseShift ? OFF_DAY_SHIFT_ID : '';
  };
  const shiftFor = (employeeId: string, date: string) => {
    const assignment = assignmentFor(employeeId,date);
    if (assignment?.isOffDay) return undefined;
    if (assignment?.shiftId) return shifts.find(s => s.id === assignment.shiftId);
    const base = employees.find(e => e.id === employeeId);
    return base?.shiftId ? shifts.find(s => s.id === base.shiftId) : undefined;
  };

  const persistAssignments = async (next: DailyShiftAssignment[]) => {
    const clean = next.map(item => {
      const employeeId = String(item.employeeId ?? (item as any).employee_id ?? '').trim();
      const date = String(item.date ?? '').trim();
      const isOffDay = Boolean(item.isOffDay || (item as any).is_off_day || String((item as any).status || '').toUpperCase() === 'OFF');
      const shiftId = isOffDay ? null : (String(item.shiftId ?? (item as any).shift_id ?? '').trim() || null);
      return { employee_id: employeeId, date, is_off_day: isOffDay, shift_id: shiftId };
    }).filter(item => item.employee_id && /^\d{4}-\d{2}-\d{2}$/.test(item.date) && (item.is_off_day || item.shift_id));
    const syncTimestamp = new Date().toISOString();
    const syncRevision = `${syncTimestamp}-${Math.random().toString(36).slice(2,10)}`;
    const response = await fetch('/api/sync', { method:'POST', credentials:'include', headers:{'Content-Type':'application/json','Accept':'application/json','X-Sync-Timestamp':syncTimestamp,'X-Sync-Revision':syncRevision}, body:JSON.stringify({dailyShiftAssignments:clean,syncTimestamp,syncRevision}) });
    const text = await response.text();
    let data:any = {}; try { data = text ? JSON.parse(text) : {}; } catch {}
    if (!response.ok) throw new Error(`Server error ${response.status}: ${data?.message || data?.error || text || 'Sync failed'}`);
    if (data?.success === false) throw new Error(data?.message || data?.error || 'Server returned success:false');
    const finalAssignments = Array.isArray(data?.dailyShiftAssignments) ? data.dailyShiftAssignments : next;
    setAssignments(finalAssignments as DailyShiftAssignment[]);
    localStorage.setItem('daily_shift_assignments', JSON.stringify(finalAssignments));
    return { assignments: finalAssignments };
  };

  const buildWeekForEmployee = (employeeId: string, sourceEmployeeId: string, base: DailyShiftAssignment[], updatedAt: string) => {
    let next = [...base];
    for (const day of days) {
      const draftValue = employeeId === sourceEmployeeId && Object.prototype.hasOwnProperty.call(draft,day.key) ? draft[day.key] : undefined;
      const source = assignmentFor(sourceEmployeeId,day.key);
      const sourceEmployee = employees.find(e => e.id === sourceEmployeeId);
      const baseShift = sourceEmployee?.shiftId ? shifts.find(s => s.id === sourceEmployee.shiftId) : undefined;
      const works = Boolean(baseShift && Array.isArray(baseShift.workDays) && baseShift.workDays.includes(day.date.getDay()));
      const isOffDay = draftValue !== undefined ? draftValue === OFF_DAY_SHIFT_ID : source ? Boolean(source.isOffDay) : !works;
      const shiftId = isOffDay ? '' : (draftValue !== undefined ? draftValue : source?.shiftId || baseShift?.id || '');
      const index = next.findIndex(a => String(a.employeeId) === String(employeeId) && a.date === day.key);
      if (!shiftId && !isOffDay) { if (index >= 0) next.splice(index,1); continue; }
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
      days.forEach(day => { const saved = result.assignments.find((a:any) => String(a.employeeId ?? a.employee_id) === String(employee.id) && String(a.date) === day.key); if (saved) onSaveDailyShift?.({employeeId:String(saved.employeeId ?? saved.employee_id),date:String(saved.date),shiftId:saved.shiftId ?? saved.shift_id ?? '',isOffDay:Boolean(saved.isOffDay ?? saved.is_off_day),assignedBy:saved.assignedBy ?? saved.assigned_by ?? currentUser?.id,updatedAt:saved.updatedAt ?? saved.updated_at ?? updatedAt}); });
      setSavedAt(new Date().toLocaleTimeString(lang === 'ar' ? 'ar-EG' : 'en-US',{hour:'2-digit',minute:'2-digit'})); setDraft({}); setError(lang === 'ar' ? 'تم حفظ وتحديث الجدول بنجاح على السيرفر' : 'Schedule saved successfully on the server.');
    } catch (err:any) { setError(lang === 'ar' ? `فشل حفظ الجدول على السيرفر: ${err?.message || 'خطأ غير معروف'}` : `Server failed to save the schedule: ${err?.message || 'Unknown error'}`); }
  };

  const applyScheduleToSelectedEmployees = async () => {
    if (!employee || !isLeader || !selectedEmployeeIds.length) return;
    setBulkSaving(true); setError(null); const updatedAt = new Date().toISOString();
    try { let next = [...assignments]; for (const id of selectedEmployeeIds) next = buildWeekForEmployee(id,employee.id,next,updatedAt); const result = await persistAssignments(next); setSelectedEmployeeIds([]); setSavedAt(new Date().toLocaleTimeString(lang === 'ar' ? 'ar-EG' : 'en-US',{hour:'2-digit',minute:'2-digit'})); setError(lang === 'ar' ? 'تم تطبيق الجدول وحفظه على السيرفر' : 'Schedule copied and saved on the server.'); void result; }
    catch (err:any) { setError(lang === 'ar' ? `فشل الحفظ: ${err?.message || 'خطأ غير معروف'}` : `Save failed: ${err?.message || 'Unknown error'}`); }
    finally { setBulkSaving(false); }
  };

  const updateShiftList = (next: Shift[]) => { setShifts(next); try { localStorage.setItem('attendance_shifts',JSON.stringify(next)); } catch {} void fetch('/api/sync',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({shifts:next})}); };

  const hours = Array.from({length: CALENDAR_END-CALENDAR_START+1},(_,i)=>CALENDAR_START+i);
  const timelineHeight = (CALENDAR_END-CALENDAR_START) * HOUR_HEIGHT;
  const renderShiftBar = (shift: Shift | undefined) => {
    if (!shift) return null;
    const start = minutesOf(shift.startTime); const end = minutesOf(shift.endTime);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
    const top = Math.max(0, ((start - CALENDAR_START*60) / 60) * HOUR_HEIGHT);
    const height = Math.min(timelineHeight-top, ((end-start)/60) * HOUR_HEIGHT);
    return <div className="absolute left-1/2 z-10 w-12 -translate-x-1/2 overflow-hidden rounded-xl bg-emerald-500 shadow-lg ring-1 ring-emerald-700/20" style={{top,height}}>
      <div className="flex h-8 items-center justify-center border-b border-white/20 px-1 text-[9px] font-black text-white">{shift.nameAr || shift.nameEn}</div>
      <div className="absolute bottom-1 left-0 right-0 text-center text-[8px] font-bold text-white/90">{shift.startTime}-{shift.endTime}</div>
      {(shift.breaks || []).map((br:any) => {
        const bs=minutesOf(br.startTime), be=minutesOf(br.endTime); if(!Number.isFinite(bs)||!Number.isFinite(be)||be<=bs) return null;
        const breakTop=((bs-start)/60)*HOUR_HEIGHT; const breakHeight=((be-bs)/60)*HOUR_HEIGHT;
        return <div key={br.id || `${br.startTime}-${br.endTime}`} className="absolute left-0 right-0 z-20 flex items-center justify-center bg-red-500 px-1 text-[8px] font-black text-white shadow-md" style={{top:breakTop,height:breakHeight}}><span className="truncate">{br.nameAr || br.nameEn || 'BREAK'}<br />{br.startTime}-{br.endTime}</span></div>;
      })}
    </div>;
  };

  return <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-950/70 p-2 backdrop-blur-sm sm:p-4 md:p-6">
    <section className="w-full max-w-7xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl sm:rounded-3xl">
      <div className="sticky top-0 z-30 bg-slate-900 p-3 text-white sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-400/30 bg-emerald-500/15"><CalendarDays className="h-5 w-5 text-emerald-300" /></div><div className="min-w-0"><h3 className="truncate text-base font-black sm:text-lg">{lang==='ar'?'الجدول الأسبوعي':'Weekly Schedule'}</h3><p className="font-mono text-[10px] text-slate-400">{toDateKey(weekStart)} → {toDateKey(addDays(weekStart,6))}</p></div></div>
          <div className="flex items-center gap-2 overflow-x-auto">{isLeader && <button onClick={()=>setShowShiftManager(true)} className="shrink-0 rounded-xl border border-emerald-500 bg-emerald-600 px-3 py-2 text-xs font-bold">{lang==='ar'?'إدارة الشفتات':'Manage Shifts'}</button>}<button onClick={()=>setWeekStart(addDays(weekStart,-7))} className="min-w-10 rounded-xl border border-slate-700 bg-slate-800 p-2.5"><ChevronRight className="h-4 w-4" /></button><button onClick={()=>setWeekStart(startOfWeek(new Date()))} className="shrink-0 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2.5 text-xs font-bold">{lang==='ar'?'الأسبوع الحالي':'Current Week'}</button><button onClick={()=>setWeekStart(addDays(weekStart,7))} className="min-w-10 rounded-xl border border-slate-700 bg-slate-800 p-2.5"><ChevronLeft className="h-4 w-4" /></button>{onClose && <button onClick={onClose} className="min-w-10 rounded-xl border border-rose-400/20 bg-rose-500/15 p-2.5"><X className="h-4 w-4" /></button>}</div>
        </div>
      </div>
      <div className="space-y-4 p-3 sm:p-5">
        {loading && <div className="text-xs text-slate-500">{lang==='ar'?'جاري تحميل الجدول...':'Loading schedule...'}</div>}
        {isLeader && <>
          <label className="block max-w-xl text-xs font-black text-slate-700"><span className="mb-1.5 flex items-center gap-1.5"><Users className="h-3.5 w-3.5" />{lang==='ar'?'موظف الجدول الأساسي':'Schedule Template Employee'}</span><select value={employee?.id||''} onChange={e=>{setSelectedEmployeeId(e.target.value);setDraft({});setSavedAt(null);}} className="min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-900">{selectableEmployees.map(e=><option key={e.id} value={e.id}>{e.code} - {lang==='ar'?e.nameAr:e.nameEn}</option>)}</select></label>
          <div className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-3 sm:p-4"><div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><div className="text-xs font-black text-slate-900">{lang==='ar'?'تطبيق الجدول على عدة موظفين':'Apply Schedule to Multiple Employees'}</div><p className="mt-1 text-[10px] text-slate-500">{lang==='ar'?'انسخ نفس الأسبوع للموظفين المحددين.':'Copy the same week to selected employees.'}</p></div><div className="flex gap-2"><button onClick={()=>setSelectedEmployeeIds(selectableEmployees.map(e=>e.id))} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-black">{lang==='ar'?'تحديد الكل':'Select All'}</button><button onClick={()=>setSelectedEmployeeIds([])} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-black">{lang==='ar'?'مسح':'Clear'}</button></div></div><div className="text-[10px] font-bold text-emerald-700">{lang==='ar'?`المحدد: ${selectedEmployeeIds.length}`:`Selected: ${selectedEmployeeIds.length}`}</div><div className="grid max-h-48 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">{selectableEmployees.map(e=><label key={e.id} className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2"><input type="checkbox" checked={selectedEmployeeIds.includes(e.id)} onChange={ev=>setSelectedEmployeeIds(prev=>ev.target.checked?[...new Set([...prev,e.id])]:prev.filter(id=>id!==e.id))} className="h-4 w-4 rounded border-slate-300 text-emerald-600" /><span className="truncate text-xs font-bold text-slate-800">{e.code} - {lang==='ar'?e.nameAr:e.nameEn}</span></label>)}</div><button disabled={!selectedEmployeeIds.length||bulkSaving} onClick={applyScheduleToSelectedEmployees} className="min-h-11 w-full rounded-xl bg-emerald-600 text-xs font-black text-white disabled:opacity-50">{bulkSaving?(lang==='ar'?'جاري التطبيق...':'Applying...'):(lang==='ar'?`تطبيق الجدول على ${selectedEmployeeIds.length} موظف`:`Apply Schedule to ${selectedEmployeeIds.length} Selected Employees`)}</button></div>
        </>}

        {employee ? <>
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="min-w-[980px]" dir={lang==='ar'?'rtl':'ltr'}>
              <div className="grid" style={{gridTemplateColumns:'76px repeat(7,minmax(128px,1fr))'}}>
                <div className="sticky top-0 z-20 border-b border-e border-slate-200 bg-slate-50 p-2 text-center text-[10px] font-black text-slate-500">{lang==='ar'?'الوقت':'TIME'}</div>
                {days.map(day=><div key={day.key} className="sticky top-0 z-20 border-b border-e border-slate-200 bg-slate-50 p-2 text-center"><div className="text-xs font-black text-slate-800">{lang==='ar'?day.labelAr:day.labelEn}</div><div className="mt-0.5 font-mono text-[9px] text-slate-400">{day.key}</div></div>)}
                <div className="relative border-e border-slate-200 bg-slate-50" style={{height:timelineHeight}}>{hours.map(hour=><div key={hour} className="absolute left-0 right-0 -translate-y-1/2 border-b border-slate-200" style={{top:(hour-CALENDAR_START)*HOUR_HEIGHT}}><span className="absolute right-2 -top-2 bg-slate-50 px-1 text-[10px] font-bold text-slate-500">{formatHour(hour,lang==='ar')}</span></div>)}</div>
                {days.map(day=>{
                  const value=getValue(day.key); const off=value===OFF_DAY_SHIFT_ID; const selectedShift=!off&&value?shifts.find(s=>s.id===value):shiftFor(employee.id,day.key); const isWeekend=day.date.getDay()===5||day.date.getDay()===6;
                  return <div key={day.key} className={`relative border-e border-slate-200 ${isWeekend||off?'bg-slate-50':'bg-white'}`} style={{height:timelineHeight}}>
                    {hours.slice(0,-1).map(hour=><div key={hour} className="absolute left-0 right-0 border-b border-slate-100" style={{top:(hour-CALENDAR_START)*HOUR_HEIGHT}} />)}
                    {selectedShift && renderShiftBar(selectedShift)}
                    {off && <div className="absolute inset-0 flex items-center justify-center"><span className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-black text-slate-500 shadow-sm">{lang==='ar'?'OFF / عطلة':'OFF DAY'}</span></div>}
                    {isLeader && <div className="absolute bottom-2 left-2 right-2 z-30 space-y-1"><label className="flex items-center gap-1 rounded-lg bg-white/95 px-2 py-1 text-[9px] font-bold shadow ring-1 ring-slate-200"><input type="checkbox" checked={off} onChange={e=>setDraft(prev=>({...prev,[day.key]:e.target.checked?OFF_DAY_SHIFT_ID:''}))} className="h-3 w-3" />{lang==='ar'?'OFF':'Off'}</label><select value={off?'':value} disabled={off} onChange={e=>setDraft(prev=>({...prev,[day.key]:e.target.value}))} className="w-full rounded-lg border border-slate-200 bg-white/95 px-1.5 py-1 text-[9px] font-bold shadow"><option value="">{lang==='ar'?'غير محدد':'Not assigned'}</option>{shifts.map(s=><option key={s.id} value={s.id}>{s.nameAr||s.nameEn} · {s.startTime}-{s.endTime}</option>)}</select></div>}
                  </div>;
                })}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[10px] font-bold text-slate-500"><span className="inline-flex items-center gap-1.5"><i className="h-3 w-3 rounded bg-emerald-500" />{lang==='ar'?'ساعات العمل':'Work shift'}</span><span className="inline-flex items-center gap-1.5"><i className="h-3 w-3 rounded bg-red-500" />{lang==='ar'?'البريك':'Break'}</span><span className="inline-flex items-center gap-1.5"><i className="h-3 w-3 rounded border border-slate-300 bg-slate-100" />OFF</span></div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="text-xs text-slate-500">{isLeader?(lang==='ar'?'عدّل الشفت من أسفل كل يوم ثم احفظ الجدول.':'Edit each day from the bottom controls, then save.'):(lang==='ar'?'الخط الأخضر يوضح ساعات العمل والبريك الأحمر يوضح وقت الاستراحة.':'Green bars show work hours; red blocks show breaks.')}</div>{isLeader&&<button onClick={saveWeek} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-black text-white hover:bg-emerald-700 sm:w-auto"><Save className="h-4 w-4" />{lang==='ar'?'حفظ الجدول':'Save Schedule'}</button>}</div>
          {savedAt&&<div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700"><Check className="h-4 w-4" />{lang==='ar'?`تم حفظ جدول الأسبوع الساعة ${savedAt}`:`Week saved at ${savedAt}`}</div>}
          {error&&<div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">{error}</div>}
        </> : <div className="py-10 text-center text-sm text-slate-500">{lang==='ar'?'لا يوجد موظف لعرض الجدول.':'No employee is available.'}</div>}
        <ShiftSwapPanel employees={employees} shifts={shifts} assignments={assignments} currentUser={currentUser} lang={lang} />
      </div>
    </section>
    {showShiftManager&&isLeader&&<div className="fixed inset-0 z-[120] overflow-y-auto bg-slate-950/60 p-2 backdrop-blur-sm sm:p-4"><div className="mx-auto mt-2 max-w-4xl rounded-2xl bg-white p-3 shadow-2xl sm:mt-8 sm:rounded-3xl sm:p-5"><div className="mb-4 flex items-center justify-between gap-3"><h3 className="text-base font-black text-slate-900 sm:text-lg">{lang==='ar'?'إدارة الشفتات':'Shift Management'}</h3><button onClick={()=>setShowShiftManager(false)} className="min-h-10 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold">{lang==='ar'?'إغلاق':'Close'}</button></div><ShiftManager shifts={shifts} lang={lang} onAddShift={shift=>updateShiftList([...shifts,shift])} onUpdateShift={shift=>updateShiftList(shifts.map(item=>item.id===shift.id?shift:item))} onDeleteShift={shiftId=>updateShiftList(shifts.filter(item=>item.id!==shiftId))} /></div></div>}
  </div>;
};
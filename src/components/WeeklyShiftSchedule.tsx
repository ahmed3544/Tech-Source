import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Check, ChevronLeft, ChevronRight, Coffee, Save, Users, X } from 'lucide-react';
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
const startOfWeek = (value: Date) => {
  const d = new Date(value);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
};
const addDays = (value: Date, amount: number) => {
  const d = new Date(value);
  d.setDate(d.getDate() + amount);
  return d;
};
const OFF_DAY_SHIFT_ID = '__OFF_DAY__';

export const WeeklyShiftSchedule: React.FC<WeeklyShiftScheduleProps> = ({
  employees: suppliedEmployees,
  shifts: suppliedShifts,
  dailyShiftAssignments: suppliedAssignments,
  currentUser: suppliedUser,
  lang,
  onSaveDailyShift,
  onClose,
}) => {
  const [employees, setEmployees] = useState<Employee[]>(suppliedEmployees || []);
  const [shifts, setShifts] = useState<Shift[]>(suppliedShifts || []);
  const [assignments, setAssignments] = useState<DailyShiftAssignment[]>(suppliedAssignments || []);
  const [currentUser, setCurrentUser] = useState<Employee | null>(suppliedUser || null);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(suppliedUser?.id || suppliedEmployees?.[0]?.id || '');
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
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
    if (suppliedUser) {
      setCurrentUser(suppliedUser);
      setSelectedEmployeeId(suppliedUser.id);
    }
  }, [suppliedEmployees, suppliedShifts, suppliedAssignments, suppliedUser]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const storedUser = localStorage.getItem('logged_in_user');
        if (!suppliedUser && storedUser) {
          const parsed = JSON.parse(storedUser) as Employee;
          if (parsed?.id && parsed.status !== 'inactive' && !cancelled) {
            setCurrentUser(parsed);
            setSelectedEmployeeId(parsed.id);
          }
        }
        const storedAssignments = localStorage.getItem('daily_shift_assignments');
        if (storedAssignments && !suppliedAssignments && !cancelled) {
          try { setAssignments(JSON.parse(storedAssignments)); } catch {}
        }
        if (!cancelled && !suppliedEmployees?.length) {
          try {
            const storedEmployees = localStorage.getItem('attendance_employees');
            if (storedEmployees) {
              const parsedEmployees = JSON.parse(storedEmployees);
              if (Array.isArray(parsedEmployees) && parsedEmployees.length) {
                setEmployees(parsedEmployees);
                if (!suppliedUser && storedUser) {
                  const parsedUser = JSON.parse(storedUser) as Employee;
                  const canonicalUser = parsedEmployees.find((item: Employee) => item.id === parsedUser.id);
                  if (canonicalUser) {
                    setCurrentUser(canonicalUser);
                    setSelectedEmployeeId(canonicalUser.id);
                  }
                }
              }
            }
          } catch {}
        }
        if ((!suppliedEmployees?.length || !suppliedShifts?.length) && !cancelled) {
          setLoading(true);
          const response = await fetch('/api/data', { cache: 'no-store' });
          if (response.ok) {
            const data = await response.json();
            if (!cancelled) {
              if (Array.isArray(data.employees) && data.employees.length) {
                setEmployees(data.employees);
                if (storedUser && !suppliedUser) {
                  try {
                    const parsedUser = JSON.parse(storedUser) as Employee;
                    const canonicalUser = data.employees.find((item: Employee) => item.id === parsedUser.id);
                    if (canonicalUser) {
                      setCurrentUser(canonicalUser);
                      setSelectedEmployeeId(canonicalUser.id);
                    }
                  } catch {}
                }
              }
              if (Array.isArray(data.shifts)) setShifts(data.shifts);
              if (Array.isArray(data.dailyShiftAssignments)) setAssignments(data.dailyShiftAssignments);
            }
          }
        }
      } catch (err) {
        console.error('Failed to load weekly schedule', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [suppliedEmployees, suppliedShifts, suppliedAssignments, suppliedUser]);

  const visibleEmployees = useMemo(() => {
    if (!isLeader) return employees.filter(e => e.id === currentUser?.id);
    if (currentUser?.role === 'admin') return employees;
    const explicitTeam = employees.some(e => e.teamLeaderId === currentUser?.id);
    if (explicitTeam) return employees.filter(e => e.teamLeaderId === currentUser?.id);
    if (currentUser?.teamId) {
      const sameTeam = employees.filter(e => e.teamId === currentUser.teamId);
      if (sameTeam.length) return sameTeam;
    }
    return employees;
  }, [employees, isLeader, currentUser]);

  const selectableEmployees = isLeader && visibleEmployees.length === 0 ? employees : visibleEmployees;
  const employee = selectableEmployees.find(e => e.id === selectedEmployeeId) || selectableEmployees[0];

  useEffect(() => {
    if (employee && !visibleEmployees.some(e => e.id === selectedEmployeeId)) {
      setSelectedEmployeeId(employee.id);
    }
    setSelectedEmployeeIds(prev => prev.filter(id => selectableEmployees.some(e => e.id === id)));
  }, [employee, selectedEmployeeId, selectableEmployees]);

  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const date = addDays(weekStart, index);
    const labelsAr = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    const labelsEn = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return { date, key: toDateKey(date), labelAr: labelsAr[date.getDay()], labelEn: labelsEn[date.getDay()] };
  }), [weekStart]);

  const assignmentFor = (employeeId: string, date: string) => assignments.find(a => a.employeeId === employeeId && a.date === date);
  const getValue = (date: string) => {
    const assignment = assignmentFor(employee?.id || '', date);
    if (assignment?.isOffDay) return OFF_DAY_SHIFT_ID;
    if (draft[date] !== undefined) return draft[date];
    if (assignment?.shiftId) return assignment.shiftId;
    const baseShift = employee?.shiftId ? shifts.find(s => s.id === employee.shiftId) : undefined;
    const dayOfWeek = new Date(`${date}T00:00:00`).getDay();
    if (baseShift && Array.isArray(baseShift.workDays) && baseShift.workDays.includes(dayOfWeek)) return baseShift.id;
    return baseShift ? OFF_DAY_SHIFT_ID : '';
  };
  const shiftFor = (employeeId: string, date: string) => {
    const assignment = assignmentFor(employeeId, date);
    if (assignment?.isOffDay) return undefined;
    if (assignment?.shiftId) return shifts.find(s => s.id === assignment.shiftId);
    const baseEmployee = employees.find(e => e.id === employeeId);
    return baseEmployee?.shiftId ? shifts.find(s => s.id === baseEmployee.shiftId) : undefined;
  };

  const persistAssignments = async (next: DailyShiftAssignment[]) => {
    setAssignments(next);
    localStorage.setItem('daily_shift_assignments', JSON.stringify(next));
    const response = await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dailyShiftAssignments: next }),
    });
    if (!response.ok) throw new Error('sync failed');
  };

  const buildWeekForEmployee = (employeeId: string, sourceEmployeeId: string, base: DailyShiftAssignment[], updatedAt: string) => {
    let next = [...base];
    for (const day of days) {
      const draftValue = employeeId === sourceEmployeeId && Object.prototype.hasOwnProperty.call(draft, day.key) ? draft[day.key] : undefined;
      const source = assignmentFor(sourceEmployeeId, day.key);
      const sourceEmployee = employees.find(e => e.id === sourceEmployeeId);
      const sourceBaseShift = sourceEmployee?.shiftId ? shifts.find(s => s.id === sourceEmployee.shiftId) : undefined;
      const dayOfWeek = day.date.getDay();
      const baseShiftWorks = Boolean(sourceBaseShift && Array.isArray(sourceBaseShift.workDays) && sourceBaseShift.workDays.includes(dayOfWeek));
      const isOffDay = draftValue !== undefined ? draftValue === OFF_DAY_SHIFT_ID : source ? Boolean(source.isOffDay) : !baseShiftWorks;
      const shiftId = isOffDay ? '' : (draftValue !== undefined ? draftValue : source?.shiftId || sourceBaseShift?.id || '');
      const index = next.findIndex(a => a.employeeId === employeeId && a.date === day.key);
      if (!shiftId && !isOffDay) {
        if (index >= 0) next.splice(index, 1);
        continue;
      }
      const assignment: DailyShiftAssignment = {
        employeeId,
        date: day.key,
        shiftId,
        isOffDay,
        assignedBy: currentUser?.id,
        updatedAt,
      };
      if (index >= 0) next[index] = assignment;
      else next.push(assignment);
    }
    return next;
  };

  const saveWeek = async () => {
    if (!employee || !isLeader) return;
    setError(null);
    const updatedAt = new Date().toISOString();
    const next = buildWeekForEmployee(employee.id, employee.id, assignments, updatedAt);
    try {
      await persistAssignments(next);
      days.forEach(day => {
        const saved = next.find(a => a.employeeId === employee.id && a.date === day.key);
        if (saved) onSaveDailyShift?.(saved);
      });
      setSavedAt(new Date().toLocaleTimeString(lang === 'ar' ? 'ar-EG' : 'en-US', { hour: '2-digit', minute: '2-digit' }));
      setDraft({});
    } catch (err) {
      console.error(err);
      setError(lang === 'ar' ? 'تم الحفظ محليًا لكن تعذر المزامنة مع السيرفر.' : 'Saved locally, but server sync failed.');
    }
  };

  const applyScheduleToSelectedEmployees = async () => {
    if (!employee || !isLeader || selectedEmployeeIds.length === 0) return;
    setBulkSaving(true);
    setError(null);
    const updatedAt = new Date().toISOString();
    try {
      let next = [...assignments];
      for (const employeeId of selectedEmployeeIds) {
        next = buildWeekForEmployee(employeeId, employee.id, next, updatedAt);
      }
      await persistAssignments(next);
      selectedEmployeeIds.forEach(employeeId => {
        days.forEach(day => {
          const saved = next.find(a => a.employeeId === employeeId && a.date === day.key);
          if (saved) onSaveDailyShift?.(saved);
        });
      });
      setSavedAt(new Date().toLocaleTimeString(lang === 'ar' ? 'ar-EG' : 'en-US', { hour: '2-digit', minute: '2-digit' }));
      setSelectedEmployeeIds([]);
    } catch (err) {
      console.error(err);
      setError(lang === 'ar' ? 'تعذر تطبيق الجدول على الموظفين المحددين.' : 'Could not apply the schedule to the selected employees.');
    } finally {
      setBulkSaving(false);
    }
  };

  const updateShiftList = (next: Shift[]) => {
    setShifts(next);
    try { localStorage.setItem('attendance_shifts', JSON.stringify(next)); } catch {}
    void fetch('/api/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ shifts: next }) });
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950/70 backdrop-blur-sm p-2 sm:p-4 md:p-6 flex items-start justify-center overflow-y-auto">
      <section className="bg-white border border-slate-200 rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden w-full max-w-7xl max-h-[96vh] overflow-y-auto">
        <div className="p-3 sm:p-5 bg-slate-900 text-white sticky top-0 z-10">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 rounded-2xl bg-emerald-500/15 border border-emerald-400/30 flex items-center justify-center"><CalendarDays className="w-5 h-5 text-emerald-300" /></div>
              <div className="min-w-0"><h3 className="text-base sm:text-lg font-black truncate">{lang === 'ar' ? 'الجدول الأسبوعي' : 'Weekly Schedule'}</h3><p className="text-[10px] text-slate-400 font-mono">{toDateKey(weekStart)} → {toDateKey(addDays(weekStart, 6))}</p></div>
            </div>
            <div className="flex items-center gap-2 overflow-x-auto">
              {isLeader && <button type="button" onClick={() => setShowShiftManager(true)} className="shrink-0 px-3 py-2 rounded-xl bg-emerald-600 border border-emerald-500 text-xs font-bold">{lang === 'ar' ? 'إدارة الشفتات' : 'Manage Shifts'}</button>}
              <button type="button" onClick={() => setWeekStart(addDays(weekStart, -7))} className="shrink-0 min-w-10 p-2.5 rounded-xl bg-slate-800 border border-slate-700"><ChevronRight className="w-4 h-4" /></button>
              <button type="button" onClick={() => setWeekStart(startOfWeek(new Date()))} className="shrink-0 px-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-xs font-bold">{lang === 'ar' ? 'الأسبوع الحالي' : 'Current Week'}</button>
              <button type="button" onClick={() => setWeekStart(addDays(weekStart, 7))} className="shrink-0 min-w-10 p-2.5 rounded-xl bg-slate-800 border border-slate-700"><ChevronLeft className="w-4 h-4" /></button>
              {onClose && <button type="button" onClick={onClose} className="shrink-0 min-w-10 p-2.5 rounded-xl bg-rose-500/15 border border-rose-400/20"><X className="w-4 h-4" /></button>}
            </div>
          </div>
        </div>

        <div className="p-3 sm:p-5 space-y-4">
          {loading && <div className="text-xs text-slate-500">{lang === 'ar' ? 'جاري تحميل الجدول...' : 'Loading schedule...'}</div>}

          {isLeader && <>
            <label className="text-xs font-black text-slate-700 block max-w-xl"><span className="flex items-center gap-1.5 mb-1.5"><Users className="w-3.5 h-3.5" />{lang === 'ar' ? 'موظف الجدول الأساسي' : 'Schedule Template Employee'}</span><select value={employee?.id || ''} onChange={e => { setSelectedEmployeeId(e.target.value); setDraft({}); setSavedAt(null); }} className="w-full min-h-11 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-900">{selectableEmployees.map(e => <option key={e.id} value={e.id}>{e.code} - {lang === 'ar' ? e.nameAr : e.nameEn}</option>)}</select></label>

            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-3 sm:p-4 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div><div className="text-xs font-black text-slate-900">{lang === 'ar' ? 'تطبيق الجدول على عدة موظفين' : 'Apply Schedule to Multiple Employees'}</div><p className="text-[10px] text-slate-500 mt-1">{lang === 'ar' ? 'حدد الموظفين ليتم نسخ نفس الأسبوع، بما فيه أيام الـ Off Day وكل شفت مع بريكاته الخاصة.' : 'Copy the same week to selected employees, including Off Days and each shift with its own breaks.'}</p></div>
                <div className="flex gap-2"><button type="button" onClick={() => setSelectedEmployeeIds(selectableEmployees.map(e => e.id))} className="px-3 py-2 rounded-lg bg-white border border-slate-200 text-[10px] font-black">{lang === 'ar' ? 'تحديد الكل' : 'Select All'}</button><button type="button" onClick={() => setSelectedEmployeeIds([])} className="px-3 py-2 rounded-lg bg-white border border-slate-200 text-[10px] font-black">{lang === 'ar' ? 'مسح' : 'Clear'}</button></div>
              </div>
              <div className="text-[10px] font-bold text-emerald-700">{lang === 'ar' ? `المحدد: ${selectedEmployeeIds.length}` : `Selected: ${selectedEmployeeIds.length}`}</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                {selectableEmployees.map(e => <label key={e.id} className="flex items-center gap-2 rounded-xl bg-white border border-slate-200 px-3 py-2 cursor-pointer"><input type="checkbox" checked={selectedEmployeeIds.includes(e.id)} onChange={event => setSelectedEmployeeIds(prev => event.target.checked ? [...new Set([...prev, e.id])] : prev.filter(id => id !== e.id))} className="h-4 w-4 rounded border-slate-300 text-emerald-600" /><span className="text-xs font-bold text-slate-800 truncate">{e.code} - {lang === 'ar' ? e.nameAr : e.nameEn}</span></label>)}
              </div>
              <button type="button" disabled={!selectedEmployeeIds.length || bulkSaving} onClick={applyScheduleToSelectedEmployees} className="w-full min-h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-black">{bulkSaving ? (lang === 'ar' ? 'جاري التطبيق...' : 'Applying...') : (lang === 'ar' ? `تطبيق الجدول على ${selectedEmployeeIds.length} موظف` : `Apply Schedule to ${selectedEmployeeIds.length} Selected Employees`)}</button>
            </div>
          </>}

          {employee ? <>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-7 gap-3">
              {days.map(day => {
                const selectedId = getValue(day.key);
                const assignment = assignmentFor(employee.id, day.key);
                const selectedShift = selectedId && selectedId !== OFF_DAY_SHIFT_ID ? shifts.find(s => s.id === selectedId) : undefined;
                const isOffDay = selectedId === OFF_DAY_SHIFT_ID || Boolean(assignment?.isOffDay);
                const isWeekend = isOffDay || day.date.getDay() === 5 || day.date.getDay() === 6;
                return <div key={day.key} className={`rounded-2xl border p-3 ${isWeekend ? 'bg-slate-50 border-slate-200' : 'bg-white border-slate-200'}`}>
                  <div className="flex items-center justify-between gap-2 mb-3"><div><div className="text-xs font-black text-slate-900">{lang === 'ar' ? day.labelAr : day.labelEn}</div><div className="text-[10px] text-slate-400 font-mono mt-0.5">{day.key}</div></div>{isOffDay && <span className="rounded-lg bg-slate-200 px-2 py-1 text-[10px] font-black text-slate-700">{lang === 'ar' ? 'عطلة أسبوعية' : 'Weekend'}</span>}</div>
                  {isLeader && <label className="flex items-center gap-2 text-xs font-black text-slate-700 mb-2 cursor-pointer"><input type="checkbox" checked={isOffDay} onChange={event => setDraft(prev => ({ ...prev, [day.key]: event.target.checked ? OFF_DAY_SHIFT_ID : '' }))} className="h-4 w-4 rounded border-slate-300 text-emerald-600" />{lang === 'ar' ? 'عطلة أسبوعية / Off Day' : 'Off Day / Weekend'}</label>}
                  {isLeader ? <select value={isOffDay ? '' : selectedId} disabled={isOffDay} onChange={event => setDraft(prev => ({ ...prev, [day.key]: event.target.value }))} className="w-full min-h-11 rounded-xl border border-slate-200 bg-slate-50 px-2 py-2 text-xs font-bold text-slate-900"><option value="">{lang === 'ar' ? 'غير محدد' : 'Not assigned'}</option>{shifts.map(shift => <option key={shift.id} value={shift.id}>{lang === 'ar' ? shift.nameAr : shift.nameEn} · {shift.startTime}-{shift.endTime}</option>)}</select> : <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-xs font-black text-slate-800">{selectedShift ? `${selectedShift.startTime} - ${selectedShift.endTime}` : (isOffDay ? (lang === 'ar' ? 'عطلة أسبوعية' : 'Weekend') : (lang === 'ar' ? 'غير محدد' : 'Not assigned'))}</div>}
                  {selectedShift?.breaks?.length ? <div className="mt-2 rounded-xl bg-amber-50 border border-amber-100 p-2 space-y-1"><div className="text-[9px] font-black text-amber-800">{lang === 'ar' ? 'بريكات الشفت' : 'Shift Breaks'}</div>{selectedShift.breaks.map(item => <div key={item.id} className="text-[9px] text-amber-800 flex items-center justify-between gap-1"><span className="truncate flex items-center gap-1"><Coffee className="w-3 h-3" />{lang === 'ar' ? item.nameAr : item.nameEn}</span><span className="font-mono shrink-0">{item.startTime}-{item.endTime}</span></div>)}</div> : null}
                </div>;
              })}
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"><div className="text-xs text-slate-500">{isLeader ? (lang === 'ar' ? 'اختر الشفت لكل يوم، أو فعّل Off Day، ثم احفظ.' : 'Choose a shift for each day, or enable Off Day, then save.') : (lang === 'ar' ? 'الجدول الأسبوعي ومواعيد الورديات والاستراحات.' : 'Weekly schedule, shift times, and breaks.')}</div>{isLeader && <button type="button" onClick={saveWeek} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 text-xs font-black w-full sm:w-auto"><Save className="w-4 h-4" />{lang === 'ar' ? 'حفظ الجدول' : 'Save Schedule'}</button>}</div>
            {savedAt && <div className="flex items-center gap-2 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2"><Check className="w-4 h-4" />{lang === 'ar' ? `تم حفظ جدول الأسبوع الساعة ${savedAt}` : `Week saved at ${savedAt}`}</div>}
            {error && <div className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">{error}</div>}
          </> : <div className="text-center py-10 text-sm text-slate-500">{lang === 'ar' ? 'لا يوجد موظف لعرض الجدول.' : 'No employee is available for this schedule.'}</div>}

          <ShiftSwapPanel employees={employees} shifts={shifts} assignments={assignments} currentUser={currentUser} lang={lang} />
        </div>
      </section>

      {showShiftManager && isLeader && <div className="fixed inset-0 z-[120] bg-slate-950/60 backdrop-blur-sm p-2 sm:p-4 overflow-y-auto"><div className="max-w-4xl mx-auto mt-2 sm:mt-8 bg-white rounded-2xl sm:rounded-3xl shadow-2xl p-3 sm:p-5"><div className="flex justify-between items-center mb-4 gap-3"><h3 className="text-base sm:text-lg font-black text-slate-900">{lang === 'ar' ? 'إدارة الشفتات' : 'Shift Management'}</h3><button type="button" onClick={() => setShowShiftManager(false)} className="min-h-10 px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold">{lang === 'ar' ? 'إغلاق' : 'Close'}</button></div><ShiftManager shifts={shifts} lang={lang} onAddShift={shift => updateShiftList([...shifts, shift])} onUpdateShift={shift => updateShiftList(shifts.map(item => item.id === shift.id ? shift : item))} onDeleteShift={shiftId => updateShiftList(shifts.filter(item => item.id !== shiftId))} /></div></div>}
    </div>
  );
};

import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, Save, Users, X } from 'lucide-react';
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
const toDateKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const startOfSundayWeek = (value: Date) => {
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
  const [weekStart, setWeekStart] = useState(() => startOfSundayWeek(new Date()));
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(suppliedUser?.id || suppliedEmployees?.[0]?.id || '');
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          if (!cancelled && parsed?.id && parsed.status !== 'inactive') {
            setCurrentUser(parsed);
            setSelectedEmployeeId(parsed.id);
          }
        }
        const storedAssignments = localStorage.getItem('daily_shift_assignments');
        if (storedAssignments && !suppliedAssignments) {
          try { setAssignments(JSON.parse(storedAssignments)); } catch {}
        }
        if (!suppliedEmployees?.length || !suppliedShifts?.length) {
          setLoading(true);
          const response = await fetch('/api/data');
          if (response.ok) {
            const data = await response.json();
            if (!cancelled) {
              if (Array.isArray(data.employees)) setEmployees(data.employees);
              if (Array.isArray(data.shifts)) setShifts(data.shifts);
              if (Array.isArray(data.dailyShiftAssignments)) setAssignments(data.dailyShiftAssignments);
            }
          }
        }
      } catch (err) {
        console.error('Failed to load weekly shift schedule', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [suppliedEmployees, suppliedShifts, suppliedAssignments, suppliedUser]);

  const visibleEmployees = useMemo(
    () => isLeader ? employees : employees.filter(e => e.id === currentUser?.id),
    [employees, isLeader, currentUser]
  );
  const employee = visibleEmployees.find(e => e.id === selectedEmployeeId) || visibleEmployees[0];

  useEffect(() => {
    if (employee && !selectedEmployeeId) setSelectedEmployeeId(employee.id);
  }, [employee, selectedEmployeeId]);

  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const date = addDays(weekStart, index);
    return {
      date,
      key: toDateKey(date),
      labelAr: ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'][index],
      labelEn: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][index],
    };
  }), [weekStart]);

  const assignmentFor = (employeeId: string, date: string) =>
    assignments.find(a => a.employeeId === employeeId && a.date === date);

  const shiftFor = (employeeId: string, date: string) => {
    const assignment = assignmentFor(employeeId, date);
    return shifts.find(s => s.id === (assignment?.shiftId || employees.find(e => e.id === employeeId)?.shiftId));
  };

  const getValue = (date: string) =>
    draft[date] ?? assignmentFor(employee?.id || '', date)?.shiftId ?? employee?.shiftId ?? '';

  const saveWeek = async () => {
    if (!employee || !isLeader) return;
    setError(null);
    const updatedAt = new Date().toISOString();
    let next = [...assignments];

    for (const day of days) {
      const shiftId = draft[day.key] ?? assignmentFor(employee.id, day.key)?.shiftId ?? employee.shiftId ?? '';
      const existingIndex = next.findIndex(a => a.employeeId === employee.id && a.date === day.key);

      if (!shiftId) {
        if (existingIndex >= 0) next.splice(existingIndex, 1);
        continue;
      }

      const assignment: DailyShiftAssignment = {
        employeeId: employee.id,
        date: day.key,
        shiftId,
        assignedBy: currentUser?.id,
        updatedAt,
      };

      if (existingIndex >= 0) next[existingIndex] = assignment;
      else next.push(assignment);
      onSaveDailyShift?.(assignment);
    }

    setAssignments(next);
    localStorage.setItem('daily_shift_assignments', JSON.stringify(next));

    try {
      const response = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dailyShiftAssignments: next }),
      });
      if (!response.ok) throw new Error(`Sync failed: ${response.status}`);
      setSavedAt(new Date().toLocaleTimeString(lang === 'ar' ? 'ar-EG' : 'en-US', { hour: '2-digit', minute: '2-digit' }));
      setDraft({});
    } catch (err) {
      console.error('Failed to save weekly shifts', err);
      setError(lang === 'ar' ? 'تم الحفظ على الجهاز، لكن تعذر المزامنة مع السيرفر.' : 'Saved locally, but server sync failed.');
    }
  };

  const moveWeek = (amount: number) => {
    setWeekStart(prev => addDays(prev, amount * 7));
    setDraft({});
    setSavedAt(null);
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950/70 backdrop-blur-sm p-4 sm:p-6 flex items-start justify-center overflow-y-auto">
      <section className="bg-white border border-slate-200 rounded-3xl shadow-2xl overflow-hidden w-full max-w-7xl max-h-[88vh] overflow-y-auto">
        <div className="p-5 bg-slate-900 text-white sticky top-0 z-10">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-emerald-500/15 border border-emerald-400/30 flex items-center justify-center"><CalendarDays className="w-5 h-5 text-emerald-300" /></div>
              <div>
                <div className="flex items-center gap-2"><h3 className="text-lg font-black">{lang === 'ar' ? 'جدول الشفت الأسبوعي' : 'Weekly Shift Schedule'}</h3><span className="text-[10px] font-black px-2 py-1 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-400/20">جدول</span></div>
                <p className="text-xs text-slate-400 mt-1">{days[0].key} → {days[6].key}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => moveWeek(-1)} className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700"><ChevronRight className="w-4 h-4" /></button>
              <button type="button" onClick={() => { setWeekStart(startOfSundayWeek(new Date())); setDraft({}); setSavedAt(null); }} className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-bold">{lang === 'ar' ? 'هذا الأسبوع' : 'This week'}</button>
              <button type="button" onClick={() => moveWeek(1)} className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700"><ChevronLeft className="w-4 h-4" /></button>
              {onClose && <button type="button" onClick={onClose} className="p-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-400/20" aria-label={lang === 'ar' ? 'إغلاق' : 'Close'}><X className="w-4 h-4" /></button>}
            </div>
          </div>
        </div>
        <div className="p-5 space-y-5">
          {loading && <div className="text-xs text-slate-500">{lang === 'ar' ? 'جاري تحميل الجدول...' : 'Loading schedule...'}</div>}
          {isLeader && <label className="text-xs font-black text-slate-700 block max-w-xl"><span className="flex items-center gap-1.5 mb-1.5"><Users className="w-3.5 h-3.5" />{lang === 'ar' ? 'الموظف' : 'Employee'}</span><select value={employee?.id || ''} onChange={e => { setSelectedEmployeeId(e.target.value); setDraft({}); setSavedAt(null); }} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-900">{visibleEmployees.map(e => <option key={e.id} value={e.id}>{e.code} - {lang === 'ar' ? e.nameAr : e.nameEn}</option>)}</select></label>}
          {employee ? <>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-7 gap-3">
              {days.map(day => {
                const selectedId = getValue(day.key);
                const selectedShift = shiftFor(employee.id, day.key);
                const isWeekend = day.date.getDay() === 5 || day.date.getDay() === 6;
                return <div key={day.key} className={`rounded-2xl border p-3 ${isWeekend ? 'bg-slate-50 border-slate-200' : 'bg-white border-slate-200'}`}>
                  <div className="flex items-center justify-between gap-2 mb-2"><div><div className="text-xs font-black text-slate-900">{lang === 'ar' ? day.labelAr : day.labelEn}</div><div className="text-[10px] text-slate-400 font-mono mt-0.5">{day.key}</div></div>{isWeekend && <span className="text-[9px] font-black text-slate-500">{lang === 'ar' ? 'عطلة' : 'OFF'}</span>}</div>
                  {isLeader ? <select value={selectedId} onChange={e => setDraft(prev => ({ ...prev, [day.key]: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-2 py-2 text-xs font-bold text-slate-900"><option value="">{lang === 'ar' ? 'بدون شفت' : 'No shift'}</option>{shifts.map(shift => <option key={shift.id} value={shift.id}>{lang === 'ar' ? shift.nameAr : shift.nameEn} · {shift.startTime}-{shift.endTime}</option>)}</select> : <div className="rounded-xl bg-slate-50 border border-slate-200 px-2 py-2"><div className="text-xs font-black text-slate-800 truncate">{selectedShift ? (lang === 'ar' ? selectedShift.nameAr : selectedShift.nameEn) : (lang === 'ar' ? 'بدون شفت' : 'No shift')}</div>{selectedShift && <div className="text-[10px] text-slate-500 font-mono mt-1 flex items-center gap-1"><Clock3 className="w-3 h-3" />{selectedShift.startTime} - {selectedShift.endTime}</div>}</div>}
                </div>;
              })}
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2"><div className="text-xs text-slate-500">{isLeader ? (lang === 'ar' ? 'اختار الشفت لكل يوم، ثم احفظ الأسبوع بالكامل. الشفت اليومي يتغلب على الشفت الافتراضي.' : 'Choose each daily shift and save the week. Daily assignments override the default shift.') : (lang === 'ar' ? 'هذا جدولك الأسبوعي، والشفت المحدد لكل يوم يستخدم في حساب الحضور.' : 'This is your weekly schedule; each assigned shift is used for attendance calculations.')}</div>{isLeader && <button type="button" onClick={saveWeek} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 text-xs font-black shadow-sm"><Save className="w-4 h-4" />{lang === 'ar' ? 'حفظ جدول الأسبوع' : 'Save Week'}</button>}</div>
            {savedAt && <div className="flex items-center gap-2 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2"><Check className="w-4 h-4" />{lang === 'ar' ? `تم حفظ جدول الأسبوع الساعة ${savedAt}` : `Week saved at ${savedAt}`}</div>}
            {error && <div className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">{error}</div>}
          </> : <div className="text-center py-10 text-sm text-slate-500">{lang === 'ar' ? 'لا يوجد موظف لعرض الجدول.' : 'No employee is available for this schedule.'}</div>}
        </div>
      </section>
    </div>
  );
};

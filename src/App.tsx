import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Users, Plus, LogOut, Languages } from 'lucide-react';
import { LoginModal } from './components/LoginModal';
import { WeeklyShiftSchedule } from './components/WeeklyShiftSchedule';
import { Employee, Language, Shift, DailyShiftAssignment } from './types';
import { INITIAL_EMPLOYEES, INITIAL_SHIFTS } from './mockData';

const ADMIN_ID = 'emp-002';
const ADMIN_EMAIL = 'ahmed.mahmoud@techsource-gds.com';

const normalizeEmployee = (raw: any): Employee => ({
  id: String(raw?.id || ''),
  companyId: raw?.companyId ?? raw?.company_id ?? 'tech-source',
  code: String(raw?.code || ''),
  nameAr: String(raw?.nameAr ?? raw?.name_ar ?? ''),
  nameEn: String(raw?.nameEn ?? raw?.name_en ?? ''),
  avatar: String(raw?.avatar || ''),
  email: String(raw?.email || ''),
  phone: String(raw?.phone || ''),
  department: String(raw?.department || ''),
  jobTitleAr: String(raw?.jobTitleAr ?? raw?.job_title_ar ?? ''),
  jobTitleEn: String(raw?.jobTitleEn ?? raw?.job_title_en ?? ''),
  shiftId: String(raw?.shiftId ?? raw?.shift_id ?? ''),
  pin: String(raw?.pin || ''),
  role: String(raw?.email || '').toLowerCase() === ADMIN_EMAIL ? 'admin' : (raw?.role || 'employee'),
  joinedDate: String(raw?.joinedDate ?? raw?.joined_date ?? new Date().toISOString().slice(0,10)),
  status: raw?.status === 'inactive' ? 'inactive' : 'active',
  teamLeaderId: raw?.teamLeaderId ?? raw?.team_leader_id,
  teamId: raw?.teamId ?? raw?.team_id,
});

const normalizeShift = (raw: any): Shift => ({
  ...raw,
  id: String(raw?.id || ''),
  nameAr: String(raw?.nameAr ?? raw?.name_ar ?? raw?.name ?? ''),
  nameEn: String(raw?.nameEn ?? raw?.name_en ?? raw?.name ?? ''),
  name: String(raw?.name ?? raw?.nameEn ?? raw?.nameAr ?? ''),
  startTime: String(raw?.startTime ?? raw?.start_time ?? '09:00'),
  endTime: String(raw?.endTime ?? raw?.end_time ?? '17:00'),
  durationMinutes: Number(raw?.durationMinutes ?? raw?.duration_minutes ?? 480),
  breakMinutes: Number(raw?.breakMinutes ?? raw?.break_minutes ?? 0),
  gracePeriodMinutes: Number(raw?.gracePeriodMinutes ?? raw?.grace_period_minutes ?? 0),
  workDays: Array.isArray(raw?.workDays) ? raw.workDays : [0,1,2,3,4],
  breaks: Array.isArray(raw?.breaks) ? raw.breaks : [],
}) as Shift;

export default function App() {
  const [lang, setLang] = useState<Language>('ar');
  const [employees, setEmployees] = useState<Employee[]>(INITIAL_EMPLOYEES.map(normalizeEmployee));
  const [shifts, setShifts] = useState<Shift[]>(INITIAL_SHIFTS.map(normalizeShift));
  const [assignments, setAssignments] = useState<DailyShiftAssignment[]>([]);
  const [currentUser, setCurrentUser] = useState<Employee | null>(() => {
    try {
      const saved = localStorage.getItem('logged_in_user');
      if (!saved) return null;
      const user = normalizeEmployee(JSON.parse(saved));
      return user.id === ADMIN_ID || user.email.toLowerCase() === ADMIN_EMAIL ? { ...user, role: 'admin' } : null;
    } catch { return null; }
  });
  const [loginOpen, setLoginOpen] = useState(!currentUser);
  const [showAddEmployee, setShowAddEmployee] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCode, setNewCode] = useState('');
  const [newPin, setNewPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const isAdmin = currentUser?.role === 'admin';

  const persist = async (payload: Record<string, unknown>) => {
    const response = await fetch('/api/sync', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'Cache-Control': 'no-cache' },
      body: JSON.stringify({ ...payload, lastUpdated: Date.now() }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result?.success === false) throw new Error(result?.error || result?.message || 'تعذر حفظ البيانات');
    return result;
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch('/api/data?_=' + Date.now(), { cache: 'no-store', headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' } });
        if (!response.ok) return;
        const data = await response.json();
        if (cancelled) return;
        const serverEmployees = Array.isArray(data.employees) ? data.employees.map(normalizeEmployee) : [];
        const admin = serverEmployees.find((e: Employee) => e.id === ADMIN_ID || e.email.toLowerCase() === ADMIN_EMAIL);
        const safeEmployees = serverEmployees.filter((e: Employee) => e.id === ADMIN_ID || e.email.toLowerCase() === ADMIN_EMAIL || e.status === 'active');
        if (admin) {
          const fixedAdmin = { ...admin, id: ADMIN_ID, role: 'admin' as const, email: ADMIN_EMAIL, nameAr: 'Ahmed Mahmoud Ahmed Mahmoud', nameEn: 'Ahmed Mahmoud Ahmed Mahmoud', code: admin.code || 'EMP002', status: 'active' as const };
          setEmployees([fixedAdmin, ...safeEmployees.filter((e: Employee) => e.id !== admin.id && e.email.toLowerCase() !== ADMIN_EMAIL)]);
        } else {
          setEmployees(INITIAL_EMPLOYEES.map(normalizeEmployee));
        }
        setShifts(Array.isArray(data.shifts) ? data.shifts.map(normalizeShift) : []);
        const schedule = Array.isArray(data.dailyShiftAssignments) ? data.dailyShiftAssignments : [];
        setAssignments(schedule);
        try {
          localStorage.setItem('attendance_employees', JSON.stringify(admin ? [admin, ...safeEmployees.filter((e: Employee) => e.id !== admin.id)] : INITIAL_EMPLOYEES));
          localStorage.setItem('attendance_shifts', JSON.stringify(data.shifts || []));
          localStorage.setItem('daily_shift_assignments', JSON.stringify(schedule));
          for (const key of ['attendance_records','attendance_leaves','attendance_notifications','notifications','urgent_notice','attendance_current_user']) localStorage.removeItem(key);
        } catch {}
      } catch (e) { console.error('Scheduling data load failed', e); }
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  const handleLogin = (raw: Employee) => {
    const user = normalizeEmployee(raw);
    if (user.id !== ADMIN_ID && user.email.toLowerCase() !== ADMIN_EMAIL) {
      setError(lang === 'ar' ? 'النظام مخصص حاليًا لحساب الإدارة فقط.' : 'Only the administrator account is enabled during setup.');
      return;
    }
    const admin = { ...user, id: ADMIN_ID, role: 'admin' as const, email: ADMIN_EMAIL, nameAr: 'Ahmed Mahmoud Ahmed Mahmoud', nameEn: 'Ahmed Mahmoud Ahmed Mahmoud', status: 'active' as const };
    setCurrentUser(admin);
    localStorage.setItem('logged_in_user', JSON.stringify(admin));
    setLoginOpen(false);
    setError('');
  };

  const addEmployee = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isAdmin || !newName.trim() || !newCode.trim() || !newPin.trim()) return;
    setBusy(true); setError('');
    const id = 'emp-' + newCode.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    if (employees.some(e => e.id === id || e.code.toLowerCase() === newCode.trim().toLowerCase())) {
      setError(lang === 'ar' ? 'كود الموظف مستخدم بالفعل.' : 'Employee code already exists.');
      setBusy(false); return;
    }
    const employee: Employee = {
      id, companyId: 'tech-source', code: newCode.trim().toUpperCase(), nameAr: newName.trim(), nameEn: newName.trim(),
      avatar: '', email: '', phone: '', department: 'CX', jobTitleAr: 'Employee', jobTitleEn: 'Employee',
      shiftId: '', pin: newPin.trim(), role: 'employee', joinedDate: new Date().toISOString().slice(0,10), status: 'active',
    };
    try {
      const next = [...employees, employee];
      await persist({ employees: [employee] });
      setEmployees(next);
      localStorage.setItem('attendance_employees', JSON.stringify(next));
      setNewName(''); setNewCode(''); setNewPin(''); setShowAddEmployee(false);
    } catch (e: any) { setError(e?.message || 'تعذر إضافة الموظف'); }
    finally { setBusy(false); }
  };

  const saveShifts = async (next: Shift[]) => {
    setShifts(next);
    localStorage.setItem('attendance_shifts', JSON.stringify(next));
    try { await persist({ shifts: next }); } catch (e: any) { setError(e?.message || 'تعذر حفظ الورديات'); }
  };

  const handleAddShift = (shift: Shift) => { void saveShifts([...shifts, shift]); };
  const handleUpdateShift = (shift: Shift) => { void saveShifts(shifts.map(s => s.id === shift.id ? shift : s)); };
  const handleDeleteShift = (shiftId: string) => { void saveShifts(shifts.filter(s => s.id !== shiftId)); };

  const visibleEmployees = useMemo(() => employees.filter(e => e.id !== ADMIN_ID || e.role === 'admin'), [employees]);

  if (!currentUser || loginOpen) {
    return <div className="min-h-screen bg-slate-100 p-4" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <div className="mx-auto mb-4 flex max-w-5xl justify-end">
        <button onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')} className="rounded-lg border bg-white px-3 py-2 text-sm"><Languages className="mr-2 inline h-4 w-4" />{lang === 'ar' ? 'English' : 'العربية'}</button>
      </div>
      <LoginModal isOpen={loginOpen} onClose={() => setLoginOpen(true)} employees={employees} onLoginSuccess={handleLogin} lang={lang} />
      {error && <p className="mx-auto mt-3 max-w-md rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    </div>;
  }

  return <main className="min-h-screen bg-slate-100 text-slate-900" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3"><div className="rounded-xl bg-emerald-100 p-2 text-emerald-700"><CalendarDays className="h-6 w-6" /></div><div><h1 className="text-lg font-black">{lang === 'ar' ? 'نظام جداول الورديات' : 'Shift Scheduling System'}</h1><p className="text-xs text-slate-500">TECH SOURCE - GDS</p></div></div>
        <div className="flex items-center gap-2"><span className="hidden text-sm font-bold sm:inline">{currentUser.nameAr}</span><button onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')} className="rounded-lg border px-3 py-2 text-sm"><Languages className="mr-1 inline h-4 w-4" />{lang === 'ar' ? 'EN' : 'عربي'}</button><button onClick={() => { localStorage.removeItem('logged_in_user'); setCurrentUser(null); setLoginOpen(true); }} className="rounded-lg border px-3 py-2 text-sm"><LogOut className="mr-1 inline h-4 w-4" />{lang === 'ar' ? 'خروج' : 'Log out'}</button></div>
      </div>
    </header>
    <div className="mx-auto grid max-w-[1600px] gap-5 p-3 sm:p-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <section className="min-w-0"><WeeklyShiftSchedule employees={visibleEmployees} shifts={shifts} dailyShiftAssignments={assignments} currentUser={currentUser} lang={lang} onAddShift={handleAddShift} onUpdateShift={handleUpdateShift} onDeleteShift={handleDeleteShift} /></section>
      {isAdmin && <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between"><h2 className="font-black">{lang === 'ar' ? 'إدارة الموظفين' : 'Employee Management'}</h2><Users className="h-5 w-5 text-slate-500" /></div>
        <p className="mb-4 text-xs leading-5 text-slate-500">{lang === 'ar' ? 'أضف الموظفين الجدد ليظهروا في جدول الورديات. لا توجد بيانات حضور أو إجازات في هذا النظام.' : 'Add employees to make them available in the roster. Attendance and leave data are not part of this system.'}</p>
        <button onClick={() => setShowAddEmployee(!showAddEmployee)} className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white"><Plus className="h-4 w-4" />{lang === 'ar' ? 'إضافة موظف' : 'Add employee'}</button>
        {showAddEmployee && <form onSubmit={addEmployee} className="mt-4 space-y-3">
          <input required value={newName} onChange={e => setNewName(e.target.value)} placeholder={lang === 'ar' ? 'اسم الموظف' : 'Employee name'} className="w-full rounded-lg border px-3 py-2 text-sm" />
          <input required value={newCode} onChange={e => setNewCode(e.target.value)} placeholder={lang === 'ar' ? 'كود الموظف' : 'Employee code'} className="w-full rounded-lg border px-3 py-2 text-sm" />
          <input required value={newPin} onChange={e => setNewPin(e.target.value)} placeholder={lang === 'ar' ? 'كلمة مرور مؤقتة' : 'Temporary password'} className="w-full rounded-lg border px-3 py-2 text-sm" />
          <button disabled={busy} className="w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-bold text-white disabled:opacity-50">{busy ? (lang === 'ar' ? 'جاري الحفظ...' : 'Saving...') : (lang === 'ar' ? 'حفظ الموظف' : 'Save employee')}</button>
        </form>}
        {error && <p className="mt-3 rounded-lg bg-red-50 p-3 text-xs text-red-700">{error}</p>}
        <div className="mt-4 space-y-2">{visibleEmployees.filter(e => e.id !== ADMIN_ID).map(e => <div key={e.id} className="rounded-lg bg-slate-50 px-3 py-2"><div className="text-sm font-bold">{lang === 'ar' ? e.nameAr : e.nameEn}</div><div className="text-xs text-slate-500">{e.code}</div></div>)}</div>
      </aside>}
    </div>
  </main>;
}

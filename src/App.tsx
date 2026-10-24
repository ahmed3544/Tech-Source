import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Users, Plus, LogOut, Languages, Pencil, Trash2, Save, X } from 'lucide-react';
import { LoginModal } from './components/LoginModal';
import { WeeklyShiftSchedule } from './components/WeeklyShiftSchedule';
import { Employee, Language, Shift, DailyShiftAssignment } from './types';
import { INITIAL_EMPLOYEES, INITIAL_SHIFTS } from './mockData';
import { authHeaders, errorToMessage, extractApiError, parseResponse } from './utils/errors';
import { HolidayRange, LeaveRange } from './utils/scheduleStatus';

const ADMIN_ID = 'emp-002';
const ADMIN_EMAIL = 'ahmed.mahmoud@techsource-gds.com';

const normalizeRole = (value: unknown): Employee['role'] => {
  const role = String(value || 'employee').trim().toLowerCase();
  if (role === 'admin' || role === 'company_admin' || role === 'platform_admin') return role as Employee['role'];
  if (role === 'leader' || role === 'team_leader' || role === 'team-leader' || role === 'tl') return 'leader';
  return 'employee';
};

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
  role: String(raw?.email || '').toLowerCase() === ADMIN_EMAIL || String(raw?.id || '') === ADMIN_ID ? 'admin' : normalizeRole(raw?.role),
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
  const [leaveRequests, setLeaveRequests] = useState<LeaveRange[]>([]);
  const [holidays, setHolidays] = useState<HolidayRange[]>([]);
  const [successMessage, setSuccessMessage] = useState('');
  const [currentUser, setCurrentUser] = useState<Employee | null>(() => {
    try {
      const saved = localStorage.getItem('logged_in_user');
      if (!saved) return null;
      const user = normalizeEmployee(JSON.parse(saved));
      return user.id && user.status === 'active' ? { ...user, role: user.id === ADMIN_ID || user.email.toLowerCase() === ADMIN_EMAIL ? 'admin' : normalizeRole(user.role) } : null;
    } catch { return null; }
  });
  const [loginOpen, setLoginOpen] = useState(!currentUser);
  const [showAddEmployee, setShowAddEmployee] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCode, setNewCode] = useState('');
  const [newPin, setNewPin] = useState('');
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editCode, setEditCode] = useState('');
  const [editPin, setEditPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const isAdmin = currentUser?.role === 'admin';

  const persist = async (payload: Record<string, unknown>) => {
    const response = await fetch('/api/sync', {
      method: 'POST',
      credentials: 'include',
      headers: authHeaders({ 'Content-Type': 'application/json', Accept: 'application/json', 'Cache-Control': 'no-cache' }),
      body: JSON.stringify({ ...payload, lastUpdated: Date.now() }),
    });
    const result = await parseResponse(response);
    if (!response.ok || result?.success === false) throw new Error(extractApiError(result, 'تعذر حفظ البيانات'));
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
        setLeaveRequests(Array.isArray(data.leaveRequests) ? data.leaveRequests : []);
        setHolidays(Array.isArray(data.officialHolidays) ? data.officialHolidays : []);
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
    if (!user.id || user.status !== 'active') {
      setError(lang === 'ar' ? 'الحساب غير صالح أو غير مفعّل.' : 'This account is invalid or inactive.');
      return;
    }
    const signedInUser = user.id === ADMIN_ID || user.email.toLowerCase() === ADMIN_EMAIL
      ? { ...user, id: ADMIN_ID, role: 'admin' as const, email: ADMIN_EMAIL, nameAr: 'Ahmed Mahmoud Ahmed Mahmoud', nameEn: 'Ahmed Mahmoud Ahmed Mahmoud', status: 'active' as const }
      : { ...user, role: normalizeRole(user.role) };
    setCurrentUser(signedInUser);
    localStorage.setItem('logged_in_user', JSON.stringify(signedInUser));
    setLoginOpen(false);
    setError('');
  };

  const addEmployee = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isAdmin || busy) return;
    if (!newName.trim() || !newCode.trim() || !newPin.trim()) return;
    setBusy(true); setError(''); setSuccessMessage('');
    const code = newCode.trim().toUpperCase();
    if (employees.some(e => e.code?.toLowerCase() === code.toLowerCase())) {
      setError(lang === 'ar' ? 'كود الموظف مستخدم بالفعل.' : 'Employee code already exists.');
      setBusy(false); return;
    }
    try {
      const response = await fetch('/api/employees', {
        method: 'POST', credentials: 'include', cache: 'no-store',
        headers: authHeaders({ 'Content-Type': 'application/json', Accept: 'application/json', 'Cache-Control': 'no-cache' }),
        body: JSON.stringify({ code, nameAr: newName.trim(), nameEn: newName.trim(), pin: newPin.trim(), role: 'employee', department: 'CX' }),
      });
      const result = await parseResponse(response);
      if (!response.ok || result?.success === false) throw new Error(extractApiError(result, lang === 'ar' ? 'تعذر إضافة الموظف' : 'Could not add the employee'));
      const created = result?.employee ? normalizeEmployee(result.employee) : null;
      const next = created ? [...employees, created] : employees;
      setEmployees(next);
      localStorage.setItem('attendance_employees', JSON.stringify(next));
      setNewName(''); setNewCode(''); setNewPin(''); setShowAddEmployee(false);
      setSuccessMessage(lang === 'ar' ? `تم إضافة الموظف ${code} بنجاح` : `Employee ${code} added successfully`);
    } catch (e: unknown) { setError(errorToMessage(e, lang === 'ar' ? 'تعذر إضافة الموظف' : 'Could not add the employee')); }
    finally { setBusy(false); }
  };

  const startEditEmployee = (employee: Employee) => {
    setEditingEmployeeId(employee.id);
    setEditName(employee.nameAr || employee.nameEn || '');
    setEditCode(employee.code || '');
    setEditPin('');
    setError('');
  };

  const saveEmployeeEdits = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isAdmin || busy || !editingEmployeeId) return;
    if (!editName.trim() || !editCode.trim()) return;
    const normalizedCode = editCode.trim().toLowerCase();
    if (employees.some(e => e.id !== editingEmployeeId && String(e.code || '').trim().toLowerCase() === normalizedCode)) {
      setError(lang === 'ar' ? 'كود الموظف مستخدم بالفعل.' : 'Employee code is already in use.');
      return;
    }
    setBusy(true); setError(''); setSuccessMessage('');
    try {
      // Only send the fields the manager actually changed — unchanged fields
      // are never overwritten with empty or undefined values.
      const target = employees.find(e => e.id === editingEmployeeId);
      const payload: Record<string, string> = {};
      if (!target || target.code !== editCode.trim().toUpperCase()) payload.code = editCode.trim().toUpperCase();
      if (!target || target.nameAr !== editName.trim()) payload.nameAr = editName.trim();
      if (!target || target.nameEn !== editName.trim()) payload.nameEn = editName.trim();
      if (editPin.trim()) payload.pin = editPin.trim();
      if (Object.keys(payload).length === 0) {
        setEditingEmployeeId(null); setEditName(''); setEditCode(''); setEditPin('');
        setSuccessMessage(lang === 'ar' ? 'لا توجد تغييرات للحفظ.' : 'No changes to save.');
        return;
      }
      const response = await fetch('/api/employees-update', {
        method: 'POST', credentials: 'include', cache: 'no-store',
        headers: authHeaders({ 'Content-Type': 'application/json', Accept: 'application/json', 'Cache-Control': 'no-cache' }),
        body: JSON.stringify({ id: editingEmployeeId, ...payload }),
      });
      const result = await parseResponse(response);
      // Success is only reported after the server confirms the update.
      if (!response.ok || result?.success === false) throw new Error(extractApiError(result, lang === 'ar' ? 'تعذر تعديل الموظف.' : 'Could not update employee.'));
      const savedEmployee = result?.employee ? normalizeEmployee(result.employee) : null;
      // Refresh state from the server's authoritative row (no stale data).
      const next = employees.map(e => e.id === editingEmployeeId ? (savedEmployee ?? {
        ...e, ...(payload as Partial<Employee>),
      }) : e);
      setEmployees(next);
      localStorage.setItem('attendance_employees', JSON.stringify(next));
      if (currentUser?.id === editingEmployeeId && savedEmployee) {
        const updatedUser = { ...currentUser, ...savedEmployee };
        setCurrentUser(updatedUser);
        localStorage.setItem('logged_in_user', JSON.stringify(updatedUser));
      }
      setEditingEmployeeId(null); setEditName(''); setEditCode(''); setEditPin('');
      setSuccessMessage(lang === 'ar' ? 'تم حفظ بيانات الموظف بنجاح' : 'Employee updated successfully');
    } catch (e: unknown) {
      setError(errorToMessage(e, lang === 'ar' ? 'حدث خطأ أثناء تعديل الموظف.' : 'Failed to update employee.'));
    } finally { setBusy(false); }
  };

  const refreshFromServer = async () => {
    try {
      const response = await fetch('/api/data?_=' + Date.now(), { cache: 'no-store', headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' } });
      if (!response.ok) return;
      const data = await parseResponse(response);
      if (Array.isArray(data.employees)) setEmployees(data.employees.map(normalizeEmployee).filter((e: Employee) => e.status === 'active' || e.id === ADMIN_ID));
      if (Array.isArray(data.shifts)) setShifts(data.shifts.map(normalizeShift));
      if (Array.isArray(data.dailyShiftAssignments)) setAssignments(data.dailyShiftAssignments);
      if (Array.isArray(data.leaveRequests)) setLeaveRequests(data.leaveRequests);
      if (Array.isArray(data.officialHolidays)) setHolidays(data.officialHolidays);
    } catch { /* keep current state */ }
  };

  const deleteEmployee = async (employee: Employee) => {
    if (!isAdmin || busy || employee.id === ADMIN_ID || employee.id === currentUser?.id) return;
    const confirmed = window.confirm(lang === 'ar'
      ? `هل أنت متأكد من حذف حساب ${employee.nameAr || employee.nameEn}؟ لا يمكن التراجع عن الحذف.`
      : `Delete account for ${employee.nameEn || employee.nameAr}? This cannot be undone.`);
    if (!confirmed) return;
    setBusy(true); setError(''); setSuccessMessage('');
    try {
      const response = await fetch('/api/employees-delete', {
        method: 'POST', credentials: 'include', cache: 'no-store',
        headers: authHeaders({ Accept: 'application/json', 'Cache-Control': 'no-cache' }),
        body: JSON.stringify({ id: employee.id }),
      });
      const result = await parseResponse(response);
      if (!response.ok || result?.success === false) throw new Error(extractApiError(result, lang === 'ar' ? 'تعذر حذف الموظف.' : 'Could not delete employee.'));
      const next = employees.filter(e => e.id !== employee.id);
      setEmployees(next);
      localStorage.setItem('attendance_employees', JSON.stringify(next));
      if (editingEmployeeId === employee.id) setEditingEmployeeId(null);
      setSuccessMessage(lang === 'ar' ? 'تم حذف الموظف بنجاح' : 'Employee deleted successfully');
    } catch (e: unknown) {
      setError(errorToMessage(e, lang === 'ar' ? 'تعذر حذف الموظف.' : 'Could not delete employee.'));
    } finally { setBusy(false); }
  };

  const saveShifts = async (next: Shift[], deletedShiftIds: string[] = []) => {
    setError('');
    try {
      // Persist deletions explicitly: the sync API otherwise only upserts shifts,
      // which makes deleted shifts reappear after a page refresh.
      await persist({ shifts: next, ...(deletedShiftIds.length ? { deletedShiftIds } : {}) });
      setShifts(next);
      localStorage.setItem('attendance_shifts', JSON.stringify(next));
    } catch (e: unknown) {
      setError(errorToMessage(e, 'تعذر حفظ الورديات'));
    }
  };

  const handleAddShift = (shift: Shift) => { void saveShifts([...shifts, shift]); };
  const handleUpdateShift = (shift: Shift) => { void saveShifts(shifts.map(s => s.id === shift.id ? shift : s)); };
  const handleDeleteShift = (shiftId: string) => { void saveShifts(shifts.filter(s => s.id !== shiftId), [shiftId]); };

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
        <div className="flex items-center gap-2"><span className="hidden text-sm font-bold sm:inline">{currentUser.nameAr}</span><button onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')} className="rounded-lg border px-3 py-2 text-sm"><Languages className="mr-1 inline h-4 w-4" />{lang === 'ar' ? 'EN' : 'عربي'}</button><button onClick={() => { localStorage.removeItem('logged_in_user'); try { sessionStorage.removeItem('auth_pin'); } catch {} setCurrentUser(null); setLoginOpen(true); }} className="rounded-lg border px-3 py-2 text-sm"><LogOut className="mr-1 inline h-4 w-4" />{lang === 'ar' ? 'خروج' : 'Log out'}</button></div>
      </div>
    </header>
    <div className="mx-auto grid max-w-[1600px] gap-5 p-3 sm:p-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <section className="min-w-0"><WeeklyShiftSchedule employees={visibleEmployees} shifts={shifts} dailyShiftAssignments={assignments} leaveRequests={leaveRequests} holidays={holidays} currentUser={currentUser} lang={lang} onAddShift={handleAddShift} onUpdateShift={handleUpdateShift} onDeleteShift={handleDeleteShift} /></section>
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
        {successMessage && !error && <p className="mt-3 rounded-lg bg-emerald-50 p-3 text-xs font-bold text-emerald-700">{successMessage}</p>}
        <div className="mt-4 space-y-2">{visibleEmployees.filter(e => e.id !== ADMIN_ID).map(e => <div key={e.id} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
          {editingEmployeeId === e.id ? <form onSubmit={saveEmployeeEdits} className="space-y-2">
            <input required value={editName} onChange={event => setEditName(event.target.value)} placeholder={lang === 'ar' ? 'اسم الموظف' : 'Employee name'} className="w-full rounded-lg border bg-white px-3 py-2 text-sm" />
            <input required value={editCode} onChange={event => setEditCode(event.target.value)} placeholder={lang === 'ar' ? 'كود الموظف' : 'Employee code'} className="w-full rounded-lg border bg-white px-3 py-2 text-sm" />
            <input value={editPin} onChange={event => setEditPin(event.target.value)} placeholder={lang === 'ar' ? 'كلمة مرور جديدة (اتركها فارغة دون تغيير)' : 'New password (leave blank to keep current)'} className="w-full rounded-lg border bg-white px-3 py-2 text-sm" autoComplete="new-password" />
            <div className="flex gap-2">
              <button disabled={busy} className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-emerald-600 px-2 py-2 text-xs font-bold text-white disabled:opacity-50"><Save className="h-3.5 w-3.5" />{lang === 'ar' ? 'حفظ' : 'Save'}</button>
              <button type="button" onClick={() => setEditingEmployeeId(null)} className="flex items-center justify-center gap-1 rounded-lg border bg-white px-2 py-2 text-xs"><X className="h-3.5 w-3.5" />{lang === 'ar' ? 'إلغاء' : 'Cancel'}</button>
            </div>
          </form> : <>
            <div className="text-sm font-bold">{lang === 'ar' ? e.nameAr : e.nameEn}</div>
            <div className="mt-1 text-xs text-slate-500">{lang === 'ar' ? 'الكود:' : 'Code:'} <span className="font-mono font-bold">{e.code}</span> · {e.status === 'inactive' ? (lang === 'ar' ? 'غير مفعّل' : 'Inactive') : (lang === 'ar' ? 'مفعّل' : 'Active')}</div>
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={() => startEditEmployee(e)} className="flex items-center gap-1 rounded-lg border bg-white px-2 py-1.5 text-xs font-semibold"><Pencil className="h-3.5 w-3.5" />{lang === 'ar' ? 'تعديل الكود / الباسورد' : 'Edit code / password'}</button>
              <button type="button" disabled={busy} onClick={() => void deleteEmployee(e)} className="flex items-center gap-1 rounded-lg border border-red-200 bg-white px-2 py-1.5 text-xs font-semibold text-red-700 disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" />{lang === 'ar' ? 'حذف' : 'Delete'}</button>
            </div>
          </>}
        </div>)}</div>
      </aside>}
    </div>
  </main>;
}

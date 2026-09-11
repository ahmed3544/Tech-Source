import React, { useMemo, useState } from 'react';
import { Camera, Edit3, FileText, LayoutGrid, LayoutList, Plus, Search, Trash2, X } from 'lucide-react';
import { localizeBackendValue } from '../i18n';
import { Employee, Shift, AttendanceRecord, LeaveRequest, Language } from '../types';
import { UserAvatar } from './UserAvatar';
import { AvatarModal } from './AvatarModal';
import { calculateWorkDaysInPeriod, getLeaveTypeLabel, getTodayString } from '../utils/helpers';

interface EmployeeManagerProps {
  employees: Employee[];
  shifts: Shift[];
  attendanceRecords: AttendanceRecord[];
  leaveRequests?: LeaveRequest[];
  onAddEmployee: (emp: Employee) => void;
  onUpdateEmployee: (emp: Employee) => void;
  onDeleteEmployee: (empId: string) => void;
  lang: Language;
  onOpenImportModal?: () => void;
  globalSearchTerm?: string;
}

export const EmployeeManager: React.FC<EmployeeManagerProps> = ({
  employees, shifts, attendanceRecords, leaveRequests = [], onAddEmployee, onUpdateEmployee,
  onDeleteEmployee, lang, onOpenImportModal, globalSearchTerm,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDept, setSelectedDept] = useState('all');
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [viewEmpDetails, setViewEmpDetails] = useState<Employee | null>(null);
  const [deletingEmployeeId, setDeletingEmployeeId] = useState<string | null>(null);
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const [form, setForm] = useState({ nameAr:'', nameEn:'', code:'', department:'CX', jobTitleAr:'', jobTitleEn:'', email:'', phone:'', pin:'Tech_123', shiftId:'', role:'employee' as 'employee'|'leader', annualLeaveBalance:15, avatar:'' });

  const activeSearch = globalSearchTerm !== undefined && globalSearchTerm !== '' ? globalSearchTerm : searchTerm;
  const departments = useMemo(() => Array.from(new Set(employees.map(e => e.department).filter(Boolean))), [employees]);
  const filtered = useMemo(() => {
    const q = activeSearch.trim().toLowerCase();
    return employees.filter(emp => {
      const haystack = [emp.nameAr, emp.nameEn, emp.code, emp.department, emp.jobTitleAr, emp.jobTitleEn].filter(Boolean).join(' ').toLowerCase();
      return (!q || haystack.includes(q)) && (selectedDept === 'all' || emp.department === selectedDept);
    });
  }, [employees, activeSearch, selectedDept]);

  const resetForm = () => setForm({ nameAr:'', nameEn:'', code:`EMP${String(employees.length + 1).padStart(3,'0')}`, department:'CX', jobTitleAr:'', jobTitleEn:'', email:'', phone:'', pin:'Tech_123', shiftId:shifts[0]?.id || 'shift-1', role:'employee', annualLeaveBalance:15, avatar:'' });
  const openAdd = () => { resetForm(); setShowAddModal(true); };
  const openEdit = (emp: Employee) => {
    setEditingEmployee(emp);
    setForm({ nameAr:emp.nameAr || '', nameEn:emp.nameEn || '', code:emp.code || '', department:emp.department || 'CX', jobTitleAr:emp.jobTitleAr || '', jobTitleEn:emp.jobTitleEn || '', email:emp.email || '', phone:emp.phone || '', pin:emp.pin || 'Tech_123', shiftId:emp.shiftId || shifts[0]?.id || 'shift-1', role:emp.role === 'leader' ? 'leader' : 'employee', annualLeaveBalance:Number(emp.annualLeaveBalance ?? ((emp.casualLeaveBalance ?? 7) + (emp.regularLeaveBalance ?? 8))), avatar:emp.avatar || '' });
  };
  const saveEmployee = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nameAr.trim() || !form.code.trim()) return;
    if (editingEmployee) onUpdateEmployee({ ...editingEmployee, ...form, nameAr:form.nameAr.trim(), nameEn:form.nameEn.trim() || form.nameAr.trim(), annualLeaveBalance:Number(form.annualLeaveBalance) || 0 });
    else onAddEmployee({ id:`emp-${Date.now()}`, ...form, nameAr:form.nameAr.trim(), nameEn:form.nameEn.trim() || form.nameAr.trim(), avatar:form.avatar || '', email:form.email || `${form.code.toLowerCase()}@techsource-gds.com`, phone:form.phone || '', joinedDate:getTodayString(), status:'active', annualLeaveBalance:Number(form.annualLeaveBalance) || 0 });
    setEditingEmployee(null); setShowAddModal(false);
  };
  const shiftFor = (emp: Employee) => shifts.find(s => s.id === emp.shiftId) || shifts[0] || { startTime:'09:00', endTime:'17:00', nameAr:'الوردية الصباحية', nameEn:'Morning Shift' } as Shift;
  const closeForm = () => { setEditingEmployee(null); setShowAddModal(false); setShowAvatarModal(false); };

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-2xl font-black text-slate-900 flex items-center gap-2.5 flex-wrap">
            <span>{lang === 'ar' ? 'دليل إدارة الموظفين والورديات' : 'Employee & Shift Directory'}</span>
            <span className="px-3 py-1 rounded-full bg-[#0d2240] text-white text-xs font-bold">TECH SOURCE GDS</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">{lang === 'ar' ? 'إضافة الموظفين وتخصيص الورديات والبيانات' : 'Manage employee profiles and shift assignments'}</p>
        </div>
        <div className="flex items-center gap-2">
          {onOpenImportModal && <button onClick={onOpenImportModal} className="px-4 py-2.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold text-xs">{lang === 'ar' ? 'استيراد Excel / CSV' : 'Import Excel / CSV'}</button>}
          <button onClick={openAdd} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 text-white font-bold text-xs"><Plus className="w-4 h-4" />{lang === 'ar' ? 'إضافة موظف جديد' : 'Add New Employee'}</button>
        </div>
      </div>

      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row gap-3 justify-between">
        <div className="flex gap-3 flex-1">
          <div className="relative w-full sm:w-80"><Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" /><input value={searchTerm} onChange={e=>setSearchTerm(e.target.value)} placeholder={lang === 'ar' ? 'بحث بالاسم أو الكود...' : 'Search name or code...'} className="w-full pr-9 pl-3 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none" /></div>
          <select value={selectedDept} onChange={e=>setSelectedDept(e.target.value)} className="text-xs bg-slate-50 border border-slate-200 rounded-xl px-3"><option value="all">{lang === 'ar' ? 'كل الأقسام' : 'All Departments'}</option>{departments.map(d=><option key={d} value={d}>{localizeBackendValue(d,lang)}</option>)}</select>
        </div>
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl"><button onClick={()=>setViewMode('table')} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${viewMode==='table'?'bg-white shadow':''}`}><LayoutList className="inline w-4 h-4 mr-1" />{lang==='ar'?'جدول':'Table'}</button><button onClick={()=>setViewMode('grid')} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${viewMode==='grid'?'bg-white shadow':''}`}><LayoutGrid className="inline w-4 h-4 mr-1" />{lang==='ar'?'بطاقات':'Cards'}</button></div>
      </div>

      {viewMode === 'table' ? <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-right text-xs"><thead><tr className="bg-[#0d2240] text-white"><th className="p-4">{lang==='ar'?'الكود':'Code'}</th><th className="p-4">{lang==='ar'?'الموظف':'Employee'}</th><th className="p-4">PIN</th><th className="p-4">{lang==='ar'?'القسم':'Department'}</th><th className="p-4">{lang==='ar'?'الوردية':'Shift'}</th><th className="p-4">{lang==='ar'?'الإجازات':'Leave'}</th><th className="p-4">{lang==='ar'?'إجراءات':'Actions'}</th></tr></thead><tbody className="divide-y divide-slate-100">{filtered.map(emp=>{const shift=shiftFor(emp);const leave=emp.annualLeaveBalance ?? ((emp.casualLeaveBalance??7)+(emp.regularLeaveBalance??8));return <tr key={emp.id} className="hover:bg-slate-50"><td className="p-4 font-mono font-bold">{emp.code}</td><td className="p-4"><div className="flex items-center gap-3"><UserAvatar name={emp.nameEn||emp.nameAr} code={emp.code} avatar={emp.avatar} size="md" /><div><div className="font-bold text-slate-900">{lang==='ar'?emp.nameAr:emp.nameEn}</div><div className="text-[11px] text-slate-400">{lang==='ar'?emp.jobTitleAr:emp.jobTitleEn}</div></div></div></td><td className="p-4 font-mono">{emp.pin || 'Tech_123'}</td><td className="p-4">{localizeBackendValue(emp.department,lang)}</td><td className="p-4 font-mono">{shift.startTime} - {shift.endTime}</td><td className="p-4 font-bold text-emerald-700">{leave} {lang==='ar'?'يوم':'days'}</td><td className="p-4"><div className="flex gap-2"><button onClick={()=>openEdit(emp)} className="p-2 rounded-lg bg-blue-50 text-blue-700"><Edit3 className="w-4 h-4" /></button><button onClick={()=>setViewEmpDetails(emp)} className="p-2 rounded-lg bg-slate-100"><FileText className="w-4 h-4" /></button><button onClick={()=>setDeletingEmployeeId(emp.id)} className="p-2 rounded-lg bg-rose-50 text-rose-700"><Trash2 className="w-4 h-4" /></button></div></td></tr>})}</tbody></table></div></div> : <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">{filtered.map(emp=>{const shift=shiftFor(emp);return <div key={emp.id} className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm"><div className="flex justify-between"><UserAvatar name={emp.nameEn||emp.nameAr} code={emp.code} avatar={emp.avatar} size="lg" /><span className="font-mono text-xs font-bold">{emp.code}</span></div><h3 className="mt-3 font-bold">{lang==='ar'?emp.nameAr:emp.nameEn}</h3><p className="text-xs text-emerald-600">{lang==='ar'?emp.jobTitleAr:emp.jobTitleEn}</p><p className="text-xs text-slate-500 mt-2">{shift.startTime} - {shift.endTime}</p><div className="flex gap-2 mt-4"><button onClick={()=>openEdit(emp)} className="flex-1 py-2 rounded-xl bg-blue-50 text-blue-700 text-xs font-bold">{lang==='ar'?'تعديل':'Edit'}</button><button onClick={()=>setViewEmpDetails(emp)} className="px-3 py-2 rounded-xl bg-slate-900 text-white text-xs">{lang==='ar'?'عرض':'View'}</button></div></div>})}</div>}

      {(showAddModal || editingEmployee) && <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4"><div className="bg-white w-full max-w-2xl rounded-3xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto"><div className="flex justify-between items-center mb-5"><h3 className="text-lg font-black">{editingEmployee ? (lang==='ar'?'تعديل بيانات الموظف':'Edit Employee') : (lang==='ar'?'إضافة موظف جديد':'Add Employee')}</h3><button onClick={closeForm}><X /></button></div><form onSubmit={saveEmployee} className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs"><div className="sm:col-span-2 flex items-center gap-4 bg-slate-50 p-3 rounded-2xl"><button type="button" onClick={()=>setShowAvatarModal(true)} className="relative"><UserAvatar name={form.nameEn||form.nameAr} code={form.code} avatar={form.avatar} size="lg" /><span className="absolute bottom-0 right-0 bg-slate-900 text-white p-1 rounded-full"><Camera className="w-3 h-3" /></span></button><div><div className="font-bold">{lang==='ar'?'الصورة الشخصية':'Profile Photo'}</div><button type="button" onClick={()=>setShowAvatarModal(true)} className="text-blue-700 font-bold mt-1">{lang==='ar'?'تغيير الصورة':'Change photo'}</button></div></div>{[['nameAr','الاسم بالعربية'],['nameEn','الاسم بالإنجليزية'],['code','كود الموظف'],['pin','PIN'],['department','القسم'],['jobTitleAr','المسمى الوظيفي'],['email','البريد الإلكتروني'],['phone','الهاتف']].map(([key,label])=><label key={key} className="font-bold text-slate-700">{label}<input value={(form as any)[key]} onChange={e=>setForm(f=>({...f,[key]:e.target.value}))} className="mt-1 w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 font-normal" /></label>)}<label className="font-bold">الوردية<select value={form.shiftId} onChange={e=>setForm(f=>({...f,shiftId:e.target.value}))} className="mt-1 w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 font-normal">{shifts.map(s=><option key={s.id} value={s.id}>{s.nameAr || s.nameEn} ({s.startTime}-{s.endTime})</option>)}</select></label><label className="font-bold">{lang==='ar'?'الصلاحية':'Role'}<select value={form.role} onChange={e=>setForm(f=>({...f,role:e.target.value as 'employee'|'leader'}))} className="mt-1 w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5"><option value="employee">{lang==='ar'?'موظف':'Employee'}</option><option value="leader">TL</option></select></label><label className="font-bold">{lang==='ar'?'رصيد الإجازات':'Annual Leave'}<input type="number" min="0" value={form.annualLeaveBalance} onChange={e=>setForm(f=>({...f,annualLeaveBalance:Number(e.target.value)}))} className="mt-1 w-full bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5" /></label><div className="sm:col-span-2 flex justify-end gap-2 pt-3 border-t"><button type="button" onClick={closeForm} className="px-5 py-2 rounded-xl bg-slate-100 font-bold">{lang==='ar'?'إلغاء':'Cancel'}</button><button type="submit" className="px-5 py-2 rounded-xl bg-slate-900 text-white font-bold">{lang==='ar'?'حفظ':'Save'}</button></div></form></div></div>}

      {viewEmpDetails && <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4"><div className="bg-white w-full max-w-xl rounded-3xl p-6 max-h-[90vh] overflow-y-auto"><div className="flex justify-between"><h3 className="font-black text-lg">{lang==='ar'?'ملف الموظف والسجل':'Employee Profile & History'}</h3><button onClick={()=>setViewEmpDetails(null)}><X /></button></div><div className="flex items-center gap-4 bg-slate-50 p-4 rounded-2xl mt-4"><UserAvatar name={viewEmpDetails.nameEn||viewEmpDetails.nameAr} code={viewEmpDetails.code} avatar={viewEmpDetails.avatar} size="xl" /><div><h4 className="font-bold">{viewEmpDetails.nameAr}</h4><p className="text-xs text-slate-500">{viewEmpDetails.code} • {viewEmpDetails.department}</p></div></div><h4 className="font-bold text-sm mt-5">{lang==='ar'?'سجل الإجازات':'Leave History'}</h4><div className="space-y-2 mt-2">{leaveRequests.filter(l=>l.employeeId===viewEmpDetails.id).map(l=><div key={l.id} className="p-3 rounded-xl bg-slate-50 border text-xs"><div className="flex justify-between font-bold"><span>{getLeaveTypeLabel(l.type,lang,l.reason)}</span><span>{l.status}</span></div><div className="mt-1">{l.startDate} → {l.endDate} ({calculateWorkDaysInPeriod(l.startDate,l.endDate)} {lang==='ar'?'أيام':'days'})</div></div>)}{!leaveRequests.some(l=>l.employeeId===viewEmpDetails.id)&&<p className="text-xs text-slate-400">{lang==='ar'?'لا توجد طلبات إجازة':'No leave requests'}</p>}</div><h4 className="font-bold text-sm mt-5">{lang==='ar'?'سجل الحضور':'Attendance History'}</h4><div className="space-y-2 mt-2">{attendanceRecords.filter(r=>r.employeeId===viewEmpDetails.id).slice(-10).reverse().map(r=><div key={r.id} className="p-3 rounded-xl bg-slate-50 border text-xs flex justify-between"><span>{r.date}</span><span>{r.checkIn||'--'} - {r.checkOut||'--'}</span></div>)}</div></div></div>}

      {deletingEmployeeId && <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4"><div className="bg-white rounded-2xl p-6 max-w-md w-full text-center"><Trash2 className="mx-auto text-rose-600 w-8 h-8 mb-3" /><h3 className="font-black text-lg">{lang==='ar'?'تأكيد حذف الموظف':'Confirm Delete'}</h3><p className="text-sm text-slate-500 my-4">{lang==='ar'?'هل أنت متأكد من حذف الموظف؟':'Are you sure you want to delete this employee?'}</p><div className="flex justify-center gap-3"><button onClick={()=>setDeletingEmployeeId(null)} className="px-5 py-2 rounded-xl bg-slate-100 font-bold">{lang==='ar'?'إلغاء':'Cancel'}</button><button onClick={()=>{onDeleteEmployee(deletingEmployeeId);setDeletingEmployeeId(null)}} className="px-5 py-2 rounded-xl bg-rose-600 text-white font-bold">{lang==='ar'?'حذف':'Delete'}</button></div></div></div>}

      {showAvatarModal && (showAddModal || editingEmployee) && <AvatarModal isOpen={showAvatarModal} onClose={()=>setShowAvatarModal(false)} employee={{ ...(editingEmployee || { id:'new', code:form.code, nameAr:form.nameAr, nameEn:form.nameEn, avatar:form.avatar, email:form.email, phone:form.phone, department:form.department, jobTitleAr:form.jobTitleAr, jobTitleEn:form.jobTitleEn, shiftId:form.shiftId, pin:form.pin, role:form.role, joinedDate:getTodayString(), status:'active', annualLeaveBalance:form.annualLeaveBalance } as Employee), avatar:form.avatar }} onSaveAvatar={url=>setForm(f=>({...f,avatar:url}))} lang={lang} />}
    </div>
  );
};

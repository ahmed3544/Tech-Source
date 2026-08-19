import React, { useState } from 'react';
import { 
  Users, 
  UserPlus, 
  Search, 
  Mail, 
  Phone, 
  Building2, 
  KeyRound, 
  Calendar, 
  X, 
  CheckCircle2, 
  Clock, 
  ShieldCheck,
  Edit2,
  Edit3,
  Trash2,
  FileText,
  LayoutList,
  LayoutGrid,
  FileSpreadsheet,
  Palmtree,
  Camera
} from 'lucide-react';
import { Employee, Shift, AttendanceRecord, LeaveRequest, Language } from '../types';
import { UserAvatar } from './UserAvatar';
import { getFirstTwoNames, getTodayString, getLeaveTypeLabel, calculateWorkDaysInPeriod } from '../utils/helpers';
import { AvatarModal } from './AvatarModal';

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
  employees,
  shifts,
  attendanceRecords,
  leaveRequests = [],
  onAddEmployee,
  onUpdateEmployee,
  onDeleteEmployee,
  lang,
  onOpenImportModal,
  globalSearchTerm,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDept, setSelectedDept] = useState('all');
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [deletingEmployeeId, setDeletingEmployeeId] = useState<string | null>(null);
  const [viewEmpDetails, setViewEmpDetails] = useState<Employee | null>(null);

  // Add Form
  const [nameAr, setNameAr] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [code, setCode] = useState(`EMP${String(employees.length + 1).padStart(3, '0')}`);
  const [department, setDepartment] = useState('CX');
  const [jobTitleAr, setJobTitleAr] = useState('');
  const [jobTitleEn, setJobTitleEn] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('Tech_123');
  const [shiftId, setShiftId] = useState(shifts[0]?.id || 'shift-1');
  const [role, setRole] = useState<'employee' | 'leader'>('employee');
  const [annualLeaveBalance, setAnnualLeaveBalance] = useState<number>(15);

  // Edit Form State
  const [editNameAr, setEditNameAr] = useState('');
  const [editNameEn, setEditNameEn] = useState('');
  const [editCode, setEditCode] = useState('');
  const [editDepartment, setEditDepartment] = useState('');
  const [editJobTitleAr, setEditJobTitleAr] = useState('');
  const [editJobTitleEn, setEditJobTitleEn] = useState('');
  const [editPin, setEditPin] = useState('');
  const [editShiftId, setEditShiftId] = useState('');
  const [editRole, setEditRole] = useState<'employee' | 'leader'>('employee');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editAnnualLeaveBalance, setEditAnnualLeaveBalance] = useState<number>(15);
  const [editAvatar, setEditAvatar] = useState('');
  const [isPhotoRemoved, setIsPhotoRemoved] = useState(false);
  const [showAvatarModalForEdit, setShowAvatarModalForEdit] = useState(false);

  const openEditModal = (emp: Employee) => {
    setEditingEmployee(emp);
    setEditNameAr(emp.nameAr);
    setEditNameEn(emp.nameEn);
    setEditCode(emp.code);
    setEditDepartment(emp.department);
    setEditJobTitleAr(emp.jobTitleAr);
    setEditJobTitleEn(emp.jobTitleEn);
    setEditPin(emp.pin);
    setEditShiftId(emp.shiftId || shifts[0]?.id || 'shift-1');
    setEditRole(emp.role || 'employee');
    setEditEmail(emp.email);
    setEditPhone(emp.phone);
    setEditAnnualLeaveBalance(emp.annualLeaveBalance ?? (emp.casualLeaveBalance ?? 7) + (emp.regularLeaveBalance ?? 8));
    setEditAvatar(emp.avatar || '');
    setIsPhotoRemoved(false);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEmployee || !editNameAr) return;

    const finalAvatar = isPhotoRemoved
      ? ''
      : (editAvatar && editAvatar.trim() !== '' ? editAvatar : (editingEmployee.avatar || ''));

    const updated: Employee = {
      ...editingEmployee,
      nameAr: editNameAr,
      nameEn: editNameEn || editNameAr,
      code: editCode,
      department: editDepartment,
      jobTitleAr: editJobTitleAr || 'موظف',
      jobTitleEn: editJobTitleEn || 'Employee',
      pin: editPin,
      shiftId: editShiftId,
      role: editRole,
      email: editEmail,
      phone: editPhone,
      annualLeaveBalance: Number(editAnnualLeaveBalance) >= 0 ? Number(editAnnualLeaveBalance) : 15,
      avatar: finalAvatar,
      _isPhotoRemoved: isPhotoRemoved,
    };

    onUpdateEmployee(updated);
    setEditingEmployee(null);
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameAr) return;

    const newEmp: Employee = {
      id: `emp-${Date.now()}`,
      code,
      nameAr,
      nameEn: nameEn || nameAr,
      avatar: '',
      email: email || `${code.toLowerCase()}@techsource-gds.com`,
      phone: phone || '+966 50 000 0000',
      department,
      jobTitleAr: jobTitleAr || 'موظف',
      jobTitleEn: jobTitleEn || 'Employee',
      shiftId,
      pin: pin || 'Tech_123',
      role,
      joinedDate: getTodayString(),
      status: 'active',
      annualLeaveBalance: Number(annualLeaveBalance) >= 0 ? Number(annualLeaveBalance) : 15,
    };

    onAddEmployee(newEmp);
    setShowAddModal(false);
    // Reset form
    setNameAr('');
    setNameEn('');
    setJobTitleAr('');
    setJobTitleEn('');
    setEmail('');
    setPhone('');
    setPin('Tech_123');
  };

  const activeSearch = globalSearchTerm !== undefined && globalSearchTerm !== '' ? globalSearchTerm : searchTerm;

  const filtered = employees.filter(emp => {
    const q = activeSearch.trim().toLowerCase();
    const matchesSearch = !q || 
      (emp.nameAr && emp.nameAr.toLowerCase().includes(q)) || 
      (emp.nameEn && emp.nameEn.toLowerCase().includes(q)) || 
      (emp.code && emp.code.toLowerCase().includes(q)) ||
      (emp.department && emp.department.toLowerCase().includes(q)) ||
      (emp.jobTitleAr && emp.jobTitleAr.toLowerCase().includes(q));
    const matchesDept = selectedDept === 'all' || emp.department === selectedDept;
    return matchesSearch && matchesDept;
  });

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Top Action Bar */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2.5 flex-wrap">
            <span>{lang === 'ar' ? 'دليل إدارة الموظفين والورديات' : 'Employee & Shift Directory'}</span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#0d2240] text-white text-xs font-bold border border-blue-900 shadow-sm shrink-0" dir="ltr">
              <img src="/logo.png" alt="Tech Source" className="w-4 h-4 object-contain bg-white rounded-full p-0.5" onError={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }} />
              <span>TECH SOURCE GDS</span>
            </span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            {lang === 'ar' ? 'إضافة الموظفين وتخصيص الورديات والرموز السرية' : 'Manage employee profiles, shift assignments & PIN codes'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {onOpenImportModal && (
            <button
              onClick={onOpenImportModal}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-xs border border-emerald-200 transition-all shadow-sm"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <span>{lang === 'ar' ? 'استيراد من Excel / CSV' : 'Import Excel / CSV'}</span>
            </button>
          )}

          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-md transition-all"
          >
            <UserPlus className="w-4 h-4 text-emerald-400" />
            <span>{lang === 'ar' ? 'إضافة موظف جديد' : 'Add New Employee'}</span>
          </button>
        </div>
      </div>

      {/* Filter controls & View Toggle Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto flex-1">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={lang === 'ar' ? 'بحث بالاسم، كود الموظف (EMP001)...' : 'Search employee name or code...'}
              className="w-full text-xs pr-9 pl-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 font-sans"
            />
          </div>

          <select
            value={selectedDept}
            onChange={(e) => setSelectedDept(e.target.value)}
            className="w-full sm:w-auto text-xs bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 font-sans"
          >
            <option value="all">{lang === 'ar' ? 'جميع الأقسام' : 'All Departments'}</option>
            <option value="CX">CX</option>
            <option value="E-Commerce">E-Commerce</option>
            <option value="Quality">Quality</option>
          </select>
        </div>

        {/* View Mode Toggle Switch */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 shrink-0">
          <button
            onClick={() => setViewMode('table')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              viewMode === 'table' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <LayoutList className="w-3.5 h-3.5" />
            <span>{lang === 'ar' ? 'جدول الموظفين' : 'Table View'}</span>
          </button>

          <button
            onClick={() => setViewMode('grid')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              viewMode === 'grid' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>{lang === 'ar' ? 'بطاقات' : 'Grid View'}</span>
          </button>
        </div>
      </div>

      {/* VIEW MODE 1: TABLE VIEW */}
      {viewMode === 'table' ? (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="bg-[#0d2240] text-white font-bold border-b border-blue-900">
                  <th className="py-4 px-4">{lang === 'ar' ? 'كود الموظف' : 'Employee Code'}</th>
                  <th className="py-4 px-4">{lang === 'ar' ? 'اسم الموظف' : 'Employee Name'}</th>
                  <th className="py-4 px-4">{lang === 'ar' ? 'كلمة المرور / PIN' : 'Password / PIN'}</th>
                  <th className="py-4 px-4">{lang === 'ar' ? 'رصيد الإجازات السنوية' : 'Annual Leave Balance'}</th>
                  <th className="py-4 px-4">{lang === 'ar' ? 'القسم' : 'Department'}</th>
                  <th className="py-4 px-4">{lang === 'ar' ? 'الوردية' : 'Shift'}</th>
                  <th className="py-4 px-4">{lang === 'ar' ? 'الصلاحية' : 'Role'}</th>
                  <th className="py-4 px-4 text-center">{lang === 'ar' ? 'الإجراءات (تعديل / حذف)' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((emp) => {
                  const shift = shifts.find(s => s.id === emp.shiftId) || shifts[0];
                  const isLeaderRole = emp.role === 'leader';
                  const leaveDays = emp.annualLeaveBalance ?? ((emp.casualLeaveBalance ?? 7) + (emp.regularLeaveBalance ?? 8));

                  return (
                    <tr key={emp.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Code */}
                      <td className="py-3.5 px-4">
                        <span className="font-mono font-bold bg-[#0d2240] text-white px-2 py-0.5 rounded text-[11px]">
                          {emp.code}
                        </span>
                      </td>

                      {/* Name & Job */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <UserAvatar name={emp.nameEn || emp.nameAr} code={emp.code} avatar={emp.avatar} size="md" />
                          <div>
                            <div className="font-bold text-slate-900 text-sm whitespace-nowrap" title={lang === 'ar' ? emp.nameAr : emp.nameEn}>
                              {getFirstTwoNames(lang === 'ar' ? emp.nameAr : emp.nameEn)}
                            </div>
                            <div className="text-[11px] text-slate-400">{emp.jobTitleAr}</div>
                          </div>
                        </div>
                      </td>

                      {/* PIN / Password */}
                      <td className="py-3.5 px-4">
                        <span className="font-mono font-bold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200">
                          {emp.pin || 'Tech_123'}
                        </span>
                      </td>

                      {/* Annual Leave Balance */}
                      <td className="py-3.5 px-4">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-emerald-50 text-emerald-800 border border-emerald-200">
                          <span className="font-mono text-sm font-extrabold text-emerald-950">{leaveDays}</span>
                          <span>{lang === 'ar' ? 'يوم' : 'Days'}</span>
                        </span>
                      </td>

                      {/* Department */}
                      <td className="py-3.5 px-4 text-slate-700 font-semibold">{emp.department}</td>

                      {/* Shift */}
                      <td className="py-3.5 px-4">
                        <span className="text-slate-600 font-mono text-[11px]">
                          {shift.startTime} - {shift.endTime}
                        </span>
                      </td>

                      {/* Role */}
                      <td className="py-3.5 px-4">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                          isLeaderRole 
                            ? 'bg-amber-100 text-amber-900 border-amber-300' 
                            : 'bg-slate-100 text-slate-700 border-slate-200'
                        }`}>
                          {isLeaderRole ? 'TL' : (lang === 'ar' ? 'موظف' : 'Employee')}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => openEditModal(emp)}
                            className="p-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition-colors"
                            title={lang === 'ar' ? 'تعديل بيانات الموظف' : 'Edit Employee'}
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => setDeletingEmployeeId(emp.id)}
                            className="p-1.5 rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 transition-colors"
                            title={lang === 'ar' ? 'حذف الموظف' : 'Delete Employee'}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => setViewEmpDetails(emp)}
                            className="p-1.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
                            title={lang === 'ar' ? 'عرض التقرير والملف' : 'View Profile'}
                          >
                            <FileText className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* VIEW MODE 2: GRID VIEW */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {filtered.map((emp) => {
            const shift = shifts.find(s => s.id === emp.shiftId) || shifts[0];
            const isLeaderRole = emp.role === 'leader';

            return (
              <div
                key={emp.id}
                className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm hover:shadow-md transition-all space-y-4 flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between">
                    <UserAvatar name={emp.nameEn || emp.nameAr} code={emp.code} avatar={emp.avatar} size="lg" />
                    <span className="text-xs font-mono font-bold bg-[#0d2240] text-white px-2 py-0.5 rounded-md">
                      #{emp.code}
                    </span>
                  </div>

                  <div>
                    <h3 className="font-bold text-slate-900 text-base leading-snug whitespace-nowrap" title={lang === 'ar' ? emp.nameAr : emp.nameEn}>
                      {getFirstTwoNames(lang === 'ar' ? emp.nameAr : emp.nameEn)}
                    </h3>
                    <p className="text-xs text-emerald-600 font-semibold mt-0.5">
                      {lang === 'ar' ? emp.jobTitleAr : emp.jobTitleEn}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">{emp.department}</p>
                  </div>
                </div>

                {/* Shift & Role Badge */}
                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between text-slate-600">
                    <span className="text-[11px] font-semibold">{lang === 'ar' ? 'كلمة المرور / PIN:' : 'PIN:'}</span>
                    <span className="font-mono font-bold text-slate-800">{emp.pin}</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-600">
                    <span className="text-[11px] font-semibold">{lang === 'ar' ? 'الورديّة:' : 'Shift:'}</span>
                    <span className="font-bold text-slate-800">{shift.startTime} - {shift.endTime}</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-600">
                    <span className="text-[11px] font-semibold">{lang === 'ar' ? 'الصلاحية:' : 'Role:'}</span>
                    <span className={`font-bold text-[10px] px-2 py-0.5 rounded ${isLeaderRole ? 'bg-amber-100 text-amber-900' : 'bg-slate-200 text-slate-800'}`}>
                      {isLeaderRole ? 'TL' : 'موظف'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => openEditModal(emp)}
                    className="flex-1 py-2 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-xl text-xs font-bold transition-colors border border-blue-200 flex items-center justify-center gap-1"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>تعديل</span>
                  </button>

                  <button
                    onClick={() => setDeletingEmployeeId(emp.id)}
                    className="py-2 px-3 bg-rose-50 text-rose-700 hover:bg-rose-100 rounded-xl text-xs font-bold transition-colors border border-rose-200"
                    title="حذف"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={() => setViewEmpDetails(emp)}
                    className="py-2 px-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors"
                  >
                    عرض
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Employee Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-3xl p-6 shadow-2xl border border-slate-200 space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-lg">
                {lang === 'ar' ? 'إضافة موظف جديد' : 'Add New Employee'}
              </h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">الاسم بالعربية</label>
                  <input
                    type="text"
                    required
                    value={nameAr}
                    onChange={(e) => setNameAr(e.target.value)}
                    placeholder="عبدالله محمد القحطاني"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">الاسم بالإنجليزية</label>
                  <input
                    type="text"
                    value={nameEn}
                    onChange={(e) => setNameEn(e.target.value)}
                    placeholder="Abdullah Al-Qahtani"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">الكود الوظيفي (ID)</label>
                  <input
                    type="text"
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">رمز PIN للدخول (4 أرقام)</label>
                  <input
                    type="text"
                    maxLength={4}
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 font-mono font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">القسم</label>
                  <select
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 font-medium"
                  >
                    <option value="CX">CX</option>
                    <option value="E-Commerce">E-Commerce</option>
                    <option value="Quality">Quality</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">الورديّة</label>
                  <select
                    value={shiftId}
                    onChange={(e) => setShiftId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 font-medium"
                  >
                    {shifts.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.nameAr} ({s.startTime} - {s.endTime})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">المسمى الوظيفي (عربي)</label>
                  <input
                    type="text"
                    value={jobTitleAr}
                    onChange={(e) => setJobTitleAr(e.target.value)}
                    placeholder="مطور برمجيات"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5"
                  />
                </div>
                <div>
                  <label className="block font-bold font-sans text-emerald-800 text-slate-700 mb-1">
                    {lang === 'ar' ? 'رصيد الإجازات السنوية (أيام)' : 'Annual Leave Balance (Days)'}
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="60"
                    value={annualLeaveBalance}
                    onChange={(e) => setAnnualLeaveBalance(Number(e.target.value))}
                    className="w-full bg-emerald-50/70 border border-emerald-300 rounded-xl px-3 py-2.5 font-bold text-emerald-950 font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-semibold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold"
                >
                  حفظ وتأكيد
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Employee Modal */}
      {editingEmployee && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-3xl p-6 shadow-2xl border border-slate-200 space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-lg flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-blue-600" />
                <span>{lang === 'ar' ? 'تعديل بيانات الموظف' : 'Edit Employee Details'}</span>
              </h3>
              <button onClick={() => setEditingEmployee(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-4 text-xs font-sans">
              {/* Profile Avatar Edit Section */}
              <div className="flex items-center gap-4 bg-slate-50 p-3 rounded-2xl border border-slate-200">
                <div className="relative group cursor-pointer shrink-0" onClick={() => setShowAvatarModalForEdit(true)}>
                  <UserAvatar name={editNameEn || editNameAr} code={editCode} avatar={isPhotoRemoved ? '' : (editAvatar || editingEmployee.avatar)} size="lg" />
                  <div className="absolute inset-0 rounded-full bg-slate-950/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Camera className="w-4 h-4 text-emerald-400" />
                  </div>
                </div>
                <div className="flex-1">
                  <span className="font-bold text-slate-800 text-xs block">
                    {lang === 'ar' ? 'الصورة الشخصية (البروفايل)' : 'Profile Photo'}
                  </span>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    {lang === 'ar' ? 'يمكن رفع صورة جديدة من جهازك أو اختيار صورة من الصور المتاحة' : 'Upload custom photo or select a preset avatar'}
                  </p>
                  <div className="flex items-center gap-3 mt-1.5">
                    <button
                      type="button"
                      onClick={() => setShowAvatarModalForEdit(true)}
                      className="text-xs text-blue-700 hover:text-blue-900 font-bold flex items-center gap-1 underline decoration-dotted"
                    >
                      <Camera className="w-3.5 h-3.5 text-blue-600" />
                      <span>{lang === 'ar' ? 'تغيير الصورة' : 'Change Photo'}</span>
                    </button>
                    {(!isPhotoRemoved && (editAvatar || editingEmployee?.avatar)) && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditAvatar('');
                          setIsPhotoRemoved(true);
                        }}
                        className="text-xs text-rose-600 hover:text-rose-800 font-bold flex items-center gap-1 underline decoration-dotted"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                        <span>{lang === 'ar' ? 'حذف الصورة' : 'Remove Photo'}</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">الاسم بالعربية</label>
                  <input
                    type="text"
                    required
                    value={editNameAr}
                    onChange={(e) => setEditNameAr(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">الاسم بالإنجليزية</label>
                  <input
                    type="text"
                    value={editNameEn}
                    onChange={(e) => setEditNameEn(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">كود الموظف (Code)</label>
                  <input
                    type="text"
                    required
                    value={editCode}
                    onChange={(e) => setEditCode(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">كلمة المرور / الرمز PIN</label>
                  <input
                    type="text"
                    value={editPin}
                    onChange={(e) => setEditPin(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 font-mono font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">القسم التابع له</label>
                  <select
                    value={editDepartment}
                    onChange={(e) => setEditDepartment(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 font-semibold"
                  >
                    <option value="CX">CX</option>
                    <option value="E-Commerce">E-Commerce</option>
                    <option value="Quality">Quality</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">الصلاحية بالنظام</label>
                  <select
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value as 'employee' | 'leader')}
                    className="w-full bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 font-bold text-amber-900"
                  >
                    <option value="employee">موظف (Employee)</option>
                    <option value="leader">TL</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {lang === 'ar' ? 'المسمى الوظيفي' : 'Job Title'}
                  </label>
                  <input
                    type="text"
                    value={editJobTitleAr}
                    onChange={(e) => setEditJobTitleAr(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5"
                  />
                </div>
                <div>
                  <label className="block font-bold text-emerald-800 mb-1">
                    {lang === 'ar' ? 'رصيد الإجازات السنوية (أيام)' : 'Annual Leave Balance (Days)'}
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="90"
                    value={editAnnualLeaveBalance}
                    onChange={(e) => setEditAnnualLeaveBalance(Number(e.target.value))}
                    className="w-full bg-emerald-50 border border-emerald-300 rounded-xl px-3 py-2.5 font-bold font-mono text-emerald-950"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingEmployee(null)}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-semibold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 rounded-xl bg-[#0d2240] hover:bg-[#153460] text-white font-bold shadow"
                >
                  حفظ التعديلات
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Employee Profile Modal */}
      {viewEmpDetails && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-xl rounded-3xl p-6 shadow-2xl border border-slate-200 space-y-6 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-lg">
                {lang === 'ar' ? 'ملف الموظف والسجل التاريخي' : 'Employee Profile & History'}
              </h3>
              <button onClick={() => setViewEmpDetails(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex items-center justify-between gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200">
              <div className="flex items-center gap-4">
                <UserAvatar name={viewEmpDetails.nameEn || viewEmpDetails.nameAr} code={viewEmpDetails.code} size="xl" />
                <div>
                  <h4 className="font-bold text-lg text-slate-900">{viewEmpDetails.nameAr}</h4>
                  <p className="text-xs text-emerald-600 font-semibold">{viewEmpDetails.jobTitleAr} • {viewEmpDetails.department}</p>
                  <p className="text-[11px] text-slate-400 font-mono mt-1">كود: #{viewEmpDetails.code} | PIN: {viewEmpDetails.pin}</p>
                </div>
              </div>
              <div className="text-left bg-emerald-50 border border-emerald-200 p-3 rounded-xl shrink-0">
                <span className="text-[10px] text-emerald-800 font-bold block">{lang === 'ar' ? 'رصيد الإجازات السنوية' : 'Annual Leave Balance'}</span>
                <span className="text-lg font-black text-emerald-700 font-mono">{viewEmpDetails.annualLeaveBalance ?? ((viewEmpDetails.casualLeaveBalance ?? 7) + (viewEmpDetails.regularLeaveBalance ?? 8))} {lang === 'ar' ? 'يوم' : 'Days'}</span>
              </div>
            </div>

            {/* Approved Leave Days & History (Visible to Team Leader) */}
            <div className="space-y-2">
              <h4 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                <Palmtree className="w-4 h-4 text-emerald-600" />
                <span>{lang === 'ar' ? 'أيام الإجازات المعتمده والطلبات (سجل الإجازات):' : 'Leave Days & Approved Dates History:'}</span>
              </h4>
              <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                {leaveRequests.filter(l => l.employeeId === viewEmpDetails.id).length > 0 ? (
                  leaveRequests.filter(l => l.employeeId === viewEmpDetails.id).map(req => {
                    const dayCount = calculateWorkDaysInPeriod(req.startDate, req.endDate);

                    return (
                      <div key={req.id} className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-800">
                            {getLeaveTypeLabel(req.type, lang, req.reason)}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            req.status === 'approved' ? 'bg-emerald-100 text-emerald-800 border-emerald-300' :
                            req.status === 'rejected' ? 'bg-rose-100 text-rose-800 border-rose-300' :
                            'bg-amber-100 text-amber-800 border-amber-300'
                          }`}>
                            {req.status === 'approved' ? 'معتمدة' : req.status === 'rejected' ? 'مرفوضة' : 'قيد النظر'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between font-mono text-[11px] text-slate-600">
                          <span>التاريخ: {req.startDate}  إلى  {req.endDate}</span>
                          <span className="font-bold text-emerald-700 font-sans">({dayCount} أيام)</span>
                        </div>
                        <p className="text-[10px] text-slate-500 italic">السبب: {req.reason}</p>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-xs text-slate-400 text-center py-3 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                    {lang === 'ar' ? 'لا توجد طلبات إجازة مسجلة لهذا الموظف' : 'No recorded leave requests for this employee'}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-slate-500" />
                <span>{lang === 'ar' ? 'سجل الحضور والغياب الأخير:' : 'Recent Attendance Log:'}</span>
              </h4>
              <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                {attendanceRecords.filter(r => r.employeeId === viewEmpDetails.id).length > 0 ? (
                  attendanceRecords.filter(r => r.employeeId === viewEmpDetails.id).map(r => (
                    <div key={r.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs">
                      <div>
                        <span className="font-mono font-bold text-slate-800">{r.date}</span>
                        <span className="text-slate-500 mr-3">{r.checkIn || '--'} - {r.checkOut || '--'}</span>
                      </div>
                      <span className="font-bold text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-full text-[10px]">
                        {r.workHours} ساعة عمل
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-400 text-center py-2">{lang === 'ar' ? 'لا توجد سجلات حضور' : 'No attendance logs'}</p>
                )}
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setViewEmpDetails(null)}
                className="px-6 py-2 bg-slate-900 text-white font-bold rounded-xl text-xs"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingEmployeeId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 border border-slate-100 text-center">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 mb-2">
              {lang === 'ar' ? 'تأكيد حذف الموظف' : 'Confirm Delete Employee'}
            </h3>
            <p className="text-sm text-slate-600 mb-6">
              {lang === 'ar'
                ? 'هل أنت تأكد من رغبتك في حذف هذا الموظف؟ سيتم حذف جميع بياناته وسجلاته نهائياً ولن يظهر مرة أخرى.'
                : 'Are you sure you want to delete this employee? Their data and logs will be permanently removed.'}
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setDeletingEmployeeId(null)}
                className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-bold text-sm transition"
              >
                {lang === 'ar' ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (deletingEmployeeId) {
                    onDeleteEmployee(deletingEmployeeId);
                    setDeletingEmployeeId(null);
                  }
                }}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm shadow-md transition"
              >
                {lang === 'ar' ? 'تأكيد الحذف النهائي' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Avatar Modal for Employee Manager Edit Modal */}
      {editingEmployee && (
        <AvatarModal
          isOpen={showAvatarModalForEdit}
          onClose={() => setShowAvatarModalForEdit(false)}
          employee={{ ...editingEmployee, avatar: isPhotoRemoved ? '' : (editAvatar || editingEmployee.avatar) }}
          onSaveAvatar={(newAvatarUrl) => {
            if (newAvatarUrl === '') {
              setEditAvatar('');
              setIsPhotoRemoved(true);
            } else {
              setEditAvatar(newAvatarUrl);
              setIsPhotoRemoved(false);
            }
          }}
          lang={lang}
        />
      )}
    </div>
  );
};

import React, { useState } from 'react';
import { 
  Palmtree, 
  Plus, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  UserCheck, 
  Calendar, 
  X,
  FileText,
  Stethoscope,
  Upload,
  Image as ImageIcon,
  Eye,
  Flag,
  Trash2,
  RotateCcw,
  Search
} from 'lucide-react';
import { LeaveRequest, Employee, LeaveType, LeaveStatus, Language, OfficialHoliday, PermissionSlot } from '../types';
import { INITIAL_OFFICIAL_HOLIDAYS } from '../mockData';
import { UserAvatar } from './UserAvatar';
import { getTodayString } from '../utils/helpers';

interface LeaveManagerProps {
  leaveRequests: LeaveRequest[];
  employees: Employee[];
  officialHolidays?: OfficialHoliday[];
  onAddLeave: (req: LeaveRequest) => void;
  onUpdateLeaveStatus: (id: string, status: LeaveStatus, reviewNotes?: string) => void;
  onDeleteLeave?: (id: string) => void;
  onAddOfficialHoliday?: (hol: OfficialHoliday) => void;
  onDeleteOfficialHoliday?: (id: string) => void;
  lang: Language;
  currentUser?: Employee | null;
  globalSearchTerm?: string;
}

export const LeaveManager: React.FC<LeaveManagerProps> = ({
  leaveRequests,
  employees,
  officialHolidays = INITIAL_OFFICIAL_HOLIDAYS,
  onAddLeave,
  onUpdateLeaveStatus,
  onDeleteLeave,
  onAddOfficialHoliday,
  onDeleteOfficialHoliday,
  lang,
  currentUser,
  globalSearchTerm,
}) => {
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'approved' | 'rejected' | 'holidays'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLeaveMonth, setSelectedLeaveMonth] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAddHolidayModal, setShowAddHolidayModal] = useState(false);
  const [previewAttachment, setPreviewAttachment] = useState<{ url: string; title: string } | null>(null);

  // Leave Form State
  const [employeeId, setEmployeeId] = useState(employees[0]?.id || '');
  const [type, setType] = useState<LeaveType>('annual');
  const [startDate, setStartDate] = useState(getTodayString());
  const [endDate, setEndDate] = useState(getTodayString());
  const [reason, setReason] = useState('');
  const [initialStatus, setInitialStatus] = useState<LeaveStatus>('approved');
  const [attachmentUrl, setAttachmentUrl] = useState<string>('');
  const [attachmentName, setAttachmentName] = useState<string>('');
  const [permissionSlot, setPermissionSlot] = useState<PermissionSlot>('first_half');

  // Official Holiday Form State
  const [holNameAr, setHolNameAr] = useState('');
  const [holStartDate, setHolStartDate] = useState(getTodayString());
  const [holEndDate, setHolEndDate] = useState(getTodayString());
  const [holType, setHolType] = useState<'national' | 'religious' | 'official'>('national');

  const selectedEmp = employees.find(e => e.id === employeeId) || employees[0];

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAttachmentName(file.name);
      const reader = new FileReader();
      reader.onloadend = () => {
        setAttachmentUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const setDemoMedicalReport = () => {
    setAttachmentUrl('https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?auto=format&fit=crop&w=800&q=80');
    setAttachmentName('تقرير_طبي_مستشفى_السلام.png');
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason) return;

    const newReq: LeaveRequest = {
      id: `leave-${Date.now()}`,
      employeeId,
      type,
      startDate,
      endDate,
      reason,
      status: initialStatus,
      createdAt: getTodayString(),
      attachmentUrl: attachmentUrl || undefined,
      attachmentName: attachmentName || undefined,
      reviewNotes: initialStatus === 'approved' ? 'تم الاعتماد المباشر من الإدارة/التيم ليدر' : undefined,
      hours: type === 'permission' ? 2 : undefined,
      permissionSlot: type === 'permission' ? permissionSlot : undefined,
    };

    onAddLeave(newReq);
    setShowAddModal(false);
    setReason('');
    setAttachmentUrl('');
    setAttachmentName('');
  };

  const handleAddHolidaySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!holNameAr || !onAddOfficialHoliday) return;

    const start = new Date(holStartDate);
    const end = new Date(holEndDate);
    const diffTime = Math.max(0, end.getTime() - start.getTime());
    const daysCount = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1);

    const newHoliday: OfficialHoliday = {
      id: `hol-${Date.now()}`,
      nameAr: holNameAr,
      startDate: holStartDate,
      endDate: holEndDate,
      daysCount,
      type: holType,
    };

    onAddOfficialHoliday(newHoliday);
    setShowAddHolidayModal(false);
    setHolNameAr('');
  };

  // Dynamic available months extraction
  const availableMonths = React.useMemo(() => {
    const monthSet = new Set<string>();
    const todayMonth = getTodayString().slice(0, 7);
    monthSet.add(todayMonth);

    leaveRequests.forEach(req => {
      if (req.startDate && req.startDate.length >= 7) {
        monthSet.add(req.startDate.slice(0, 7));
      }
      if (req.endDate && req.endDate.length >= 7) {
        monthSet.add(req.endDate.slice(0, 7));
      }
    });

    return Array.from(monthSet).sort().reverse();
  }, [leaveRequests]);

  const getMonthLabel = (m: string) => {
    const [year, month] = m.split('-');
    const monthNamesAr: Record<string, string> = {
      '01': 'يناير', '02': 'فبراير', '03': 'مارس', '04': 'أبريل',
      '05': 'مايو', '06': 'يونيو', '07': 'يوليو', '08': 'أغسطس',
      '09': 'سبتمبر', '10': 'أكتوبر', '11': 'نوفمبر', '12': 'ديسمبر'
    };
    const name = monthNamesAr[month] || month;
    const isCurrent = m === getTodayString().slice(0, 7);
    return `${name} ${year}${isCurrent ? (lang === 'ar' ? ' (الشهر الحالي)' : ' (Current)') : ''}`;
  };

  // Calculate scoped pending count for tab badge
  const visiblePendingCount = React.useMemo(() => {
    return leaveRequests.filter(req => {
      if (req.status !== 'pending') return false;
      if (currentUser?.role === 'employee') {
        if (req.employeeId !== currentUser.id) return false;
      } else if (currentUser?.role === 'leader') {
        const hasExplicitTeam = employees.some(e => e.teamLeaderId === currentUser.id);
        if (hasExplicitTeam) {
          const assignedEmpIds = new Set(
            employees
              .filter(e => e.teamLeaderId === currentUser.id || (currentUser.teamId && e.teamId === currentUser.teamId))
              .map(e => e.id)
          );
          if (assignedEmpIds.size > 0 && !assignedEmpIds.has(req.employeeId) && req.employeeId !== currentUser.id) {
            return false;
          }
        }
      }
      return true;
    }).length;
  }, [leaveRequests, currentUser, employees]);

  const activeQuery = globalSearchTerm !== undefined && globalSearchTerm !== '' ? globalSearchTerm : searchQuery;

  const filteredRequests = leaveRequests.filter(req => {
    // 1. Team Leader / Employee / Admin scope filtering
    if (currentUser?.role === 'employee') {
      if (req.employeeId !== currentUser.id) return false;
    } else if (currentUser?.role === 'leader') {
      const q = activeQuery.toLowerCase().trim();
      if (!q) {
        const hasExplicitTeam = employees.some(e => e.teamLeaderId === currentUser.id);
        if (hasExplicitTeam) {
          const assignedEmpIds = new Set(
            employees
              .filter(e => e.teamLeaderId === currentUser.id || (currentUser.teamId && e.teamId === currentUser.teamId))
              .map(e => e.id)
          );
          if (assignedEmpIds.size > 0 && !assignedEmpIds.has(req.employeeId) && req.employeeId !== currentUser.id) {
            return false;
          }
        }
      }
    }

    const matchesStatus = activeTab === 'all' || req.status === activeTab;
    // CRITICAL: Pending requests require action and should NEVER be hidden by a specific month filter
    const matchesMonth = (activeTab === 'pending') || selectedLeaveMonth === 'all' || req.startDate.startsWith(selectedLeaveMonth) || req.endDate.startsWith(selectedLeaveMonth);
    const emp = employees.find(e => e.id === req.employeeId);
    const q = activeQuery.toLowerCase().trim();
    const matchesSearch = !q || (
      (emp && (emp.nameAr.includes(q) || emp.nameEn.toLowerCase().includes(q) || emp.code.toLowerCase().includes(q))) ||
      (req.reason && req.reason.toLowerCase().includes(q))
    );
    return matchesStatus && matchesMonth && matchesSearch;
  }).sort((a, b) => (b.createdAt || b.startDate || '').localeCompare(a.createdAt || a.startDate || ''));

  const getLeaveTypeText = (t: LeaveType) => {
    switch (t) {
      case 'annual': return 'إجازة سنوية اعتيادية';
      case 'casual': return 'إجازة عارضة (حد أقصى يومين)';
      case 'sick': return 'إجازة مرضية (تقرير طبي معتمد)';
      case 'permission': return 'إذن استئذان (حد أقصى ساعتين)';
      case 'maternity': return 'إجازة وضع (4 أشهر)';
      case 'paternity': return 'إجازة أبوة (يوم واحد)';
      case 'study': return 'إجازة امتحانات دراسية';
      case 'hajj': return 'إجازة حج / عمرة (شهر كامل)';
      case 'emergency': return 'إجازة طارئة';
      default: return t;
    }
  };

  const currentMonthStr = getTodayString().slice(0, 7); // e.g. "2026-08"
  const thisMonthHolidays = officialHolidays.filter(
    h => h.startDate.startsWith(currentMonthStr) || h.endDate.startsWith(currentMonthStr)
  );
  const totalThisMonthHolidayDays = thisMonthHolidays.reduce((acc, h) => acc + (h.daysCount || 1), 0);

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Top Header Card */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2.5 flex-wrap">
            <span>{lang === 'ar' ? 'إدارة طلبات الإجازات والاستئذان' : 'Leave & Permission Requests'}</span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#0d2240] text-white text-xs font-bold border border-blue-900 shadow-sm shrink-0" dir="ltr">
              <img src="/logo.png" alt="Tech Source" className="w-4 h-4 object-contain bg-white rounded-full p-0.5" onError={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }} />
              <span>TECH SOURCE GDS</span>
            </span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            {lang === 'ar' ? 'مراجعة واعتماد طلبات الموظفين، متابعة الأرصدة والأذونات' : 'Approve employee leave applications & track balances'}
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>{lang === 'ar' ? 'تقديم طلب إجازة جديد' : 'Submit Leave Request'}</span>
        </button>
      </div>

      {/* Tabs Filter */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('pending')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 ${
            activeTab === 'pending'
              ? 'bg-amber-500 text-slate-950 shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>{lang === 'ar' ? 'قيد الانتظار' : 'Pending'}</span>
          <span className="bg-slate-900 text-white text-[10px] px-2 py-0.2 rounded-full font-mono">
            {visiblePendingCount}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('approved')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 ${
            activeTab === 'approved'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <CheckCircle2 className="w-4 h-4" />
          <span>{lang === 'ar' ? 'المقبوّلة' : 'Approved'}</span>
        </button>

        <button
          onClick={() => setActiveTab('rejected')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 ${
            activeTab === 'rejected'
              ? 'bg-rose-600 text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <XCircle className="w-4 h-4" />
          <span>{lang === 'ar' ? 'المرفوضة' : 'Rejected'}</span>
        </button>

        <button
          onClick={() => setActiveTab('all')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 ${
            activeTab === 'all'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <span>{lang === 'ar' ? 'الكل' : 'All'}</span>
        </button>

        <button
          onClick={() => setActiveTab('holidays')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 ${
            activeTab === 'holidays'
              ? 'bg-purple-600 text-white shadow-sm'
              : 'bg-purple-50 text-purple-800 hover:bg-purple-100 border border-purple-200'
          }`}
        >
          <Flag className="w-4 h-4 text-purple-600" />
          <span>{lang === 'ar' ? 'الإجازات الرسمية والعطلات' : 'Official Holidays'}</span>
          <span className="bg-purple-200 text-purple-900 text-[10px] px-2 py-0.2 rounded-full font-mono">
            {officialHolidays.length}
          </span>
        </button>
      </div>

      {/* Secondary Search & Month Filters for Leave Requests */}
      {activeTab !== 'holidays' && (
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={lang === 'ar' ? 'بحث باسم الموظف، الكود، أو السبب...' : 'Search employee or reason...'}
              className="w-full text-xs pr-9 pl-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 font-sans"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <span className="text-xs font-bold text-slate-600 shrink-0">{lang === 'ar' ? 'تصفية حسب الشهر:' : 'Month:'}</span>
            <select
              value={selectedLeaveMonth}
              onChange={(e) => setSelectedLeaveMonth(e.target.value)}
              className="w-full sm:w-56 text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium font-sans"
            >
              <option value="all">{lang === 'ar' ? 'جميع الشهور 📅' : 'All Months'}</option>
              {availableMonths.map(m => (
                <option key={m} value={m}>
                  {getMonthLabel(m)}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
      {activeTab === 'holidays' ? (
        <div className="space-y-6">
          {/* Summary Box */}
          <div className="bg-gradient-to-r from-purple-900 via-indigo-900 to-slate-900 p-6 rounded-3xl text-white shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Flag className="w-5 h-5 text-amber-400" />
                <h3 className="text-lg font-bold">
                  {lang === 'ar' ? 'عطلات الدولة والإجازات الرسمية (الأعياد والمناسبات)' : 'National & Official Public Holidays'}
                </h3>
              </div>
              <p className="text-xs text-purple-200 max-w-2xl leading-relaxed">
                {lang === 'ar' 
                  ? `أيام العطلات الرسمية المعتمدة من الدولة كإجازات مدفوعة الأجر (الأعياد الدينية والوطنية). هذا الشهر (${currentMonthStr}) يضم ${totalThisMonthHolidayDays} أيام إجازة رسمية.`
                  : `Official paid holiday days. This month has ${totalThisMonthHolidayDays} holiday days.`}
              </p>
            </div>

            <button
              onClick={() => setShowAddHolidayModal(true)}
              className="px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl text-xs shadow-lg transition flex items-center gap-1.5 shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>{lang === 'ar' ? '+ إضافة مناسبة/إجازة رسمية' : '+ Add Official Holiday'}</span>
            </button>
          </div>

          {/* Current Month Highlighted Holidays */}
          {thisMonthHolidays.length > 0 && (
            <div className="bg-amber-50 border-2 border-amber-300/80 p-4 rounded-3xl space-y-2">
              <div className="flex items-center gap-2 text-amber-950 font-bold text-xs">
                <Calendar className="w-4 h-4 text-amber-700" />
                <span>عطلات هذا الشهر ({currentMonthStr}):</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                {thisMonthHolidays.map(h => (
                  <div key={h.id} className="bg-white p-3 rounded-2xl border border-amber-200 shadow-sm flex items-center justify-between text-xs">
                    <div>
                      <span className="font-bold text-slate-900 block">{h.nameAr}</span>
                      <span className="text-[10px] text-slate-500 font-mono">{h.startDate} {h.daysCount > 1 ? `(${h.daysCount} أيام)` : ''}</span>
                    </div>
                    <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-900">
                      إجازة رسمية 🏛️
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* All Official Holidays List Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {officialHolidays.map(h => (
              <div key={h.id} className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm flex flex-col justify-between space-y-3">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                      h.type === 'religious' 
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        : h.type === 'national'
                        ? 'bg-blue-50 text-blue-800 border border-blue-200'
                        : 'bg-purple-50 text-purple-800 border border-purple-200'
                    }`}>
                      {h.type === 'religious' ? 'عيد ديني 🌙' : h.type === 'national' ? 'مناسبة وطنية 🇪🇬' : 'عطلة رسمية 🏛️'}
                    </span>
                    <span className="text-xs font-mono font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-lg">
                      {h.daysCount} {h.daysCount === 1 ? 'يوم' : 'أيام'}
                    </span>
                  </div>

                  <h4 className="font-bold text-slate-900 text-sm">{h.nameAr}</h4>
                  <div className="text-xs font-mono text-slate-600 flex items-center justify-between bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    <span>التاريخ:</span>
                    <span className="font-bold text-slate-900">{h.startDate} {h.endDate !== h.startDate ? `إلى ${h.endDate}` : ''}</span>
                  </div>
                </div>

                {onDeleteOfficialHoliday && (
                  <div className="pt-2 border-t border-slate-100 flex justify-end">
                    <button
                      onClick={() => onDeleteOfficialHoliday(h.id)}
                      className="text-rose-600 hover:text-rose-800 text-[11px] font-bold flex items-center gap-1 hover:bg-rose-50 px-2.5 py-1 rounded-lg transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>حذف الإجازة</span>
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* VIEW 2: LEAVE REQUESTS GRID */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredRequests.length > 0 ? (
            filteredRequests.map((req) => {
              const emp = employees.find(e => e.id === req.employeeId);
              if (!emp) return null;

              return (
                <div
                  key={req.id}
                  className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-4 flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                      <div className="flex items-center gap-3">
                        <UserAvatar name={emp.nameEn || emp.nameAr} code={emp.code} size="md" />
                        <div>
                          <h4 className="font-bold text-slate-900 text-sm">{emp.nameAr}</h4>
                          <p className="text-[11px] text-slate-400">{emp.department} • {emp.jobTitleAr}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-[11px] font-bold px-3 py-1 rounded-full border ${
                          req.status === 'approved' 
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : req.status === 'rejected'
                            ? 'bg-rose-50 text-rose-700 border-rose-200'
                            : 'bg-amber-50 text-amber-700 border-amber-200'
                        }`}>
                          {req.status === 'approved' ? 'مقبول' : req.status === 'rejected' ? 'مرفوض' : 'قيد الانتظار'}
                        </span>
                        {onDeleteLeave && (
                          <button
                            type="button"
                            onClick={() => {
                              if (window.confirm(lang === 'ar' ? 'هل أنت متأكد من حذف طلب الإجازة هذا؟' : 'Delete this leave request?')) {
                                onDeleteLeave(req.id);
                              }
                            }}
                            className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors"
                            title={lang === 'ar' ? 'حذف طلب الإجازة' : 'Delete Leave Request'}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div className="flex items-center justify-between text-slate-600">
                        <span className="font-semibold">{lang === 'ar' ? 'نوع الطلب:' : 'Type:'}</span>
                        <span className={`font-bold px-2 py-0.5 rounded ${
                          req.type === 'sick' 
                            ? 'bg-rose-50 text-rose-800 border border-rose-200' 
                            : 'bg-emerald-50 text-emerald-700'
                        }`}>
                          {req.type === 'sick' ? '🩺 ' : ''}{getLeaveTypeText(req.type)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-slate-600 font-mono">
                        <span className="font-semibold font-sans">{lang === 'ar' ? 'الفترة:' : 'Dates:'}</span>
                        <span className="font-bold">{req.startDate} إلى {req.endDate}</span>
                      </div>

                      {req.type === 'permission' && (
                        <div className="bg-sky-50 border border-sky-200 rounded-2xl p-2.5 text-[11px] text-sky-950 font-bold flex items-center justify-between">
                          <span>تقسيم فترات الإذن:</span>
                          <span className="bg-white px-2.5 py-0.5 rounded-lg border border-sky-300 text-sky-800 font-mono">
                            {req.permissionSlot === 'first_half' ? '🌅 نصف اليوم الأول (حضور حتى 11:00 ص)' : req.permissionSlot === 'second_half' ? '🌆 نصف اليوم الثاني (انصراف 03:00 م)' : '⏱️ إذن ساعتان مخصص'}
                          </span>
                        </div>
                      )}

                      <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 text-slate-700">
                        <span className="font-bold block mb-1 text-[11px] text-slate-500">{lang === 'ar' ? 'السبب:' : 'Reason:'}</span>
                        <p className="leading-relaxed">{req.reason}</p>
                      </div>

                      {/* Attachment / Medical Report Preview Banner */}
                      {req.attachmentUrl && (
                        <div className="bg-rose-50/80 border border-rose-200 rounded-2xl p-3 flex items-center justify-between">
                          <div className="flex items-center gap-2 text-[11px] font-bold text-rose-950">
                            <Stethoscope className="w-4 h-4 text-rose-600 shrink-0" />
                            <div>
                              <span>التقرير الطبي المرفق:</span>
                              <span className="text-rose-700 font-normal block text-[10px] truncate max-w-[160px]">
                                {req.attachmentName || 'تقرير_طبي_معتمد.png'}
                              </span>
                            </div>
                          </div>

                          <button
                            onClick={() => setPreviewAttachment({ 
                              url: req.attachmentUrl!, 
                              title: `التقرير الطبي - الموظف: ${emp.nameAr} (${req.startDate})` 
                            })}
                            className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-[11px] font-bold flex items-center gap-1 transition shadow-sm shrink-0"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>معاينة المستند 👁️</span>
                          </button>
                        </div>
                      )}

                      {req.reviewNotes && (
                        <div className="bg-amber-50/60 p-2.5 rounded-xl border border-amber-200/60 text-[11px] text-amber-900">
                          <span className="font-bold">ملاحظة الإدارة: </span> {req.reviewNotes}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Approve / Reject Action Buttons for Pending */}
                  {req.status === 'pending' && (
                    <div className="flex items-center gap-2 pt-3 border-t border-slate-100">
                      <button
                        onClick={() => onUpdateLeaveStatus(req.id, 'approved', req.type === 'sick' ? 'تمت معاينة التقرير الطبي والاعتماد بنجاح' : 'تمت الموافقة من الموارد البشرية')}
                        className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs shadow-sm transition-colors flex items-center justify-center gap-1.5"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>{lang === 'ar' ? 'موافقة وتعتمد' : 'Approve'}</span>
                      </button>

                      <button
                        onClick={() => onUpdateLeaveStatus(req.id, 'rejected', 'نظراً لحاجة العمل في هذه الفترة')}
                        className="flex-1 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-xs shadow-sm transition-colors flex items-center justify-center gap-1.5"
                      >
                        <XCircle className="w-4 h-4" />
                        <span>{lang === 'ar' ? 'رفض الطلب' : 'Reject'}</span>
                      </button>
                    </div>
                  )}

                  {/* Actions for Approved Leaves (Allow Leader to Revoke / Cancel approval) */}
                  {req.status === 'approved' && (
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 pt-3 border-t border-slate-100">
                      <span className="text-[11px] text-emerald-700 font-bold flex items-center gap-1">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>{lang === 'ar' ? 'مقبولة وتخصم من الرصيد' : 'Approved Leave'}</span>
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => onUpdateLeaveStatus(req.id, 'pending', 'إعادة الطلب لقيد الدراسة بواسطة التيم ليدر')}
                          className="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-xl font-bold text-[11px] transition flex items-center gap-1 border border-amber-200"
                          title={lang === 'ar' ? 'إعادة الإجازة لقيد الانتظار' : 'Reset to pending'}
                        >
                          <RotateCcw className="w-3.5 h-3.5 text-amber-600" />
                          <span>{lang === 'ar' ? 'إعادة للانتظار' : 'To Pending'}</span>
                        </button>
                        <button
                          onClick={() => {
                            if (window.confirm(lang === 'ar' ? 'هل أنت متأكد من إلغاء هذه الإجازة المعتمدة؟ (سيتم استرجاع رصيد الموظف وإلغاء السجلات تلقائياً)' : 'Revoke approved leave and restore balance?')) {
                              onUpdateLeaveStatus(req.id, 'rejected', 'تم إلغاء الإجازة وتحديث الرصيد');
                            }
                          }}
                          className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-[11px] shadow-sm transition flex items-center gap-1.5"
                          title={lang === 'ar' ? 'إلغاء الإجازة المعتمدة واسترجاع رصيد الموظف' : 'Revoke approved leave'}
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>{lang === 'ar' ? 'إلغاء الإجازة ↩️' : 'Revoke Leave'}</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="col-span-2 bg-white rounded-3xl p-12 text-center text-slate-400 border border-slate-200">
              <Palmtree className="w-12 h-12 mx-auto mb-2 opacity-30" />
              <p className="font-semibold">{lang === 'ar' ? 'لا توجد طلبات إجازة في هذا القسم' : 'No leave requests found'}</p>
            </div>
          )}
        </div>
      )}

      {/* Submit New Request Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-3xl p-6 shadow-2xl border border-slate-200 space-y-5 max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-lg">
                {lang === 'ar' ? 'تقديم طلب إجازة جديد' : 'Submit Leave Request'}
              </h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">الموظف مقدم الطلب</label>
                <select
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 font-bold text-slate-900"
                >
                  {employees.map(e => (
                    <option key={e.id} value={e.id}>
                      {e.nameAr} - {e.department} (عارضة: {e.casualLeaveBalance ?? 7} | اعتيادي: {e.regularLeaveBalance ?? 8} | مرضية: {e.sickLeaveBalance ?? 30})
                    </option>
                  ))}
                </select>
              </div>

              {selectedEmp && (
                <div className="bg-emerald-50 border border-emerald-200 p-2.5 rounded-2xl flex items-center justify-between text-emerald-950 font-bold text-xs">
                  <span>أرصدة إجازات الموظف ({selectedEmp.nameAr}):</span>
                  <span className="font-mono text-emerald-800 bg-white px-2 py-0.5 rounded border border-emerald-300">
                    عارضة: {selectedEmp.casualLeaveBalance ?? 7}/7 | اعتيادي: {selectedEmp.regularLeaveBalance ?? 8}/8 | مرضية: {selectedEmp.sickLeaveBalance ?? 30}/30 يوم
                  </span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">نوع الطلب</label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value as LeaveType)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 font-bold text-slate-900"
                  >
                    <option value="annual">إجازة سنوية اعتيادية (تخصم من رصيد الـ 8 أيام)</option>
                    <option value="casual">إجازة عارضة (تخصم من رصيد الـ 7 أيام)</option>
                    <option value="permission">إذن استئذان (مرتان شهرياً - حد أقصى ساعتان)</option>
                    <option value="sick">إجازة مرضية (بتقرير طبي معتمد)</option>
                    <option value="emergency">إجازة طارئة أخرى</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">حالة القرار والاعتماد:</label>
                  <select
                    value={initialStatus}
                    onChange={(e) => setInitialStatus(e.target.value as LeaveStatus)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 font-bold text-slate-900"
                  >
                    <option value="approved">🟢 موافقة وتأكيد فوري (خصم مباشر من الرصيد)</option>
                    <option value="pending">🟡 إرسال كطلب قيد الانتظار</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">تاريخ البداية</label>
                  <input
                    type="date"
                    required
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">تاريخ النهاية</label>
                  <input
                    type="date"
                    required
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 font-mono"
                  />
                </div>
              </div>

              {/* Medical Report / File Upload Area */}
              {(type === 'sick' || true) && (
                <div className="bg-rose-50/60 border border-rose-200 rounded-2xl p-3 space-y-2">
                  <label className="block font-bold text-rose-950 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Stethoscope className="w-4 h-4 text-rose-600" />
                      <span>ارفاق صورة التقرير الطبي / المستند المرفق:</span>
                    </span>
                    <button
                      type="button"
                      onClick={setDemoMedicalReport}
                      className="text-[10px] text-rose-700 underline font-normal"
                    >
                      (استخدام صورة تقرير نموذج)
                    </button>
                  </label>

                  <div className="flex items-center gap-3">
                    <label className="flex-1 flex items-center justify-center gap-2 bg-white border border-rose-300 border-dashed hover:bg-rose-100/50 p-2.5 rounded-xl cursor-pointer text-rose-900 font-bold transition">
                      <Upload className="w-4 h-4 text-rose-600" />
                      <span>{attachmentName ? attachmentName : 'اختر صورة التقرير الطبي من جهازك'}</span>
                      <input type="file" accept="image/*,.pdf" onChange={handleFileUpload} className="hidden" />
                    </label>
                  </div>

                  {attachmentUrl && (
                    <div className="relative rounded-xl overflow-hidden border border-rose-200 max-h-32 bg-slate-900 flex items-center justify-center">
                      <img src={attachmentUrl} alt="Report Preview" className="max-h-32 object-contain" />
                      <button
                        type="button"
                        onClick={() => { setAttachmentUrl(''); setAttachmentName(''); }}
                        className="absolute top-1 right-1 bg-slate-900/80 text-white p-1 rounded-full text-[10px]"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block font-bold text-slate-700 mb-1">سبب الطلب وتفاصيل الإجازة</label>
                <textarea
                  required
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  placeholder="اكتب تفاصيل ومبررات الطلب..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5"
                />
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
                  className="px-6 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                >
                  إرسال الطلب
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add Official Holiday */}
      {showAddHolidayModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <Flag className="w-5 h-5 text-purple-600" />
                <span>إضافة مناسبة / إجازة رسمية للدولة</span>
              </h3>
              <button onClick={() => setShowAddHolidayModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddHolidaySubmit} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">اسم المناسبة / العطلة الرسمية</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: عيد الفطر المبارك / ثورة 30 يونيو"
                  value={holNameAr}
                  onChange={(e) => setHolNameAr(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold text-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">تاريخ البداية</label>
                  <input
                    type="date"
                    required
                    value={holStartDate}
                    onChange={(e) => setHolStartDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">تاريخ النهاية</label>
                  <input
                    type="date"
                    required
                    value={holEndDate}
                    onChange={(e) => setHolEndDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">تصنيف الإجازة الرسمية</label>
                <select
                  value={holType}
                  onChange={(e) => setHolType(e.target.value as any)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold"
                >
                  <option value="national">مناسبة وطنية 🇪🇬</option>
                  <option value="religious">عيد ديني 🌙</option>
                  <option value="official">عطلة رسمية بالدولة 🏛️</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setShowAddHolidayModal(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl"
                >
                  حفظ الإجازة الرسمية
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Lightbox Modal: Medical Report Document Viewer */}
      {previewAttachment && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white max-w-3xl w-full rounded-3xl p-6 shadow-2xl space-y-4 border border-slate-200">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <Stethoscope className="w-5 h-5 text-rose-600" />
                <span>{previewAttachment.title}</span>
              </h3>
              <button onClick={() => setPreviewAttachment(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="max-h-[70vh] overflow-auto flex items-center justify-center bg-slate-950 p-4 rounded-2xl border border-slate-800">
              <img src={previewAttachment.url} alt="Medical Report" className="max-w-full max-h-[60vh] object-contain rounded-lg shadow-2xl" />
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-slate-500 font-bold">📄 مستند تقرير طبي معتمد موجه لإدارة الموارد البشرية والتيم ليدر</span>
              <button onClick={() => setPreviewAttachment(null)} className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs">
                إغلاق المعاينة
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

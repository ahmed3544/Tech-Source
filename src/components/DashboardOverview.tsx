import React from 'react';
import { 
  Users, 
  UserCheck, 
  Clock, 
  UserX, 
  Palmtree, 
  CheckCircle2, 
  Plus, 
  FileSpreadsheet, 
  ArrowUpRight,
  UserPlus,
  AlertTriangle,
  Trash2
} from 'lucide-react';
import { Employee, AttendanceRecord, LeaveRequest, Language, LeaveStatus } from '../types';
import { UserAvatar } from './UserAvatar';
import { BreakTimer } from './BreakTimer';
import { WorkTimer } from './WorkTimer';
import { getStatusBadgeStyle, getStatusText, getLeaveTypeLabel, formatTime, toWesternDigits, getFirstTwoNames, getTodayString, isWeekend } from '../utils/helpers';

interface DashboardOverviewProps {
  employees: Employee[];
  attendanceRecords: AttendanceRecord[];
  leaveRequests: LeaveRequest[];
  onOpenManualPunch: () => void;
  onOpenAddEmployee: () => void;
  onExportCSV: () => void;
  onUpdateLeaveStatus?: (id: string, status: LeaveStatus, reviewNotes?: string) => void;
  onDeleteRecord?: (id: string) => void;
  onClearTodayRecords?: (date: string) => void;
  setActiveTab: (tab: 'dashboard' | 'kiosk' | 'attendance' | 'employees' | 'leaves' | 'analytics' | 'portal') => void;
  lang: Language;
  onForceEndBreak?: (empId: string) => void;
  currentUser?: Employee | null;
}

export const DashboardOverview: React.FC<DashboardOverviewProps> = ({
  employees,
  attendanceRecords,
  leaveRequests,
  onOpenManualPunch,
  onOpenAddEmployee,
  onExportCSV,
  onUpdateLeaveStatus,
  onDeleteRecord,
  onClearTodayRecords,
  setActiveTab,
  lang,
  onForceEndBreak,
  currentUser,
}) => {
  const todayStr = getTodayString();
  const todayRecords = attendanceRecords.filter(r => r.date === todayStr);

  const totalEmp = employees.length;

  // Approved leave for today (excluding hourly permissions)
  const todayApprovedLeaves = leaveRequests.filter(l => {
    return l.status === 'approved' && l.type !== 'permission' && l.startDate <= todayStr && l.endDate >= todayStr;
  });
  const leaveEmpIds = new Set([
    ...todayApprovedLeaves.map(l => l.employeeId),
    ...todayRecords.filter(r => r.status === 'on_leave').map(r => r.employeeId)
  ]);
  const leaveCount = leaveEmpIds.size;

  // Present today (has checkIn and not on leave)
  const presentRecords = todayRecords.filter(r => r.checkIn && r.status !== 'on_leave');
  const presentEmpIds = new Set(presentRecords.map(r => r.employeeId));
  const presentCount = presentEmpIds.size;

  // Late today (checking approved permission exemption)
  const lateRecords = todayRecords.filter(r => {
    if (!r.checkIn || r.status === 'on_leave') return false;
    const hasApprovedPermission = leaveRequests.some(
      l => l.employeeId === r.employeeId && l.type === 'permission' && l.status === 'approved' && l.startDate <= todayStr && l.endDate >= todayStr
    );
    if (hasApprovedPermission) return false;
    return r.status === 'late' || (r.lateMinutes !== undefined && r.lateMinutes > 0);
  });
  const lateEmpIds = new Set(lateRecords.map(r => r.employeeId));
  const lateCount = lateEmpIds.size;

  // Absent today
  const isTodayWeekend = isWeekend(todayStr);
  const absentEmpIds = new Set(
    todayRecords.filter(r => r.status === 'absent' && !r.checkIn).map(r => r.employeeId)
  );
  const absentCount = absentEmpIds.size;

  // Accurate Percentage Calculations
  const presentPct = totalEmp > 0 ? Math.round((presentCount / totalEmp) * 100) : 0;
  const latePctOfTotal = totalEmp > 0 ? Math.round((lateCount / totalEmp) * 100) : 0;
  const latePctOfPresent = presentCount > 0 ? Math.round((lateCount / presentCount) * 100) : 0;
  const absentPct = totalEmp > 0 ? Math.round((absentCount / totalEmp) * 100) : 0;
  const leavePct = totalEmp > 0 ? Math.round((leaveCount / totalEmp) * 100) : 0;

  // On-time punctuality rate among present employees
  const onTimeCount = Math.max(0, presentCount - lateCount);
  const complianceRate = presentCount > 0 ? Math.round((onTimeCount / presentCount) * 100) : 0;

  const pendingLeaves = leaveRequests.filter(l => l.status === 'pending');

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6 animate-fade-in">
      {/* Top Welcome & Quick Actions Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2.5 flex-wrap">
            <span>{lang === 'ar' ? 'لوحة المتابعة المباشرة للحضور' : 'Live Attendance Overview'}</span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#0d2240] text-white text-xs font-bold border border-blue-900 shadow-sm shrink-0" dir="ltr">
              <img src="logo.png" alt="Tech Source" className="w-4 h-4 object-contain bg-white rounded-full p-0.5" onError={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }} />
              <span>TECH SOURCE GDS</span>
            </span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            {lang === 'ar' 
              ? `سجل الحضور اليومي الموحد - ${toWesternDigits(new Date().toLocaleDateString('ar-SA'))}` 
              : `Daily Attendance Summary - ${new Date().toLocaleDateString('en-US')}`}
          </p>
        </div>

        {/* Quick Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={onOpenManualPunch}
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-[#0d2240] hover:bg-[#153460] text-white font-bold text-xs shadow transition border border-blue-900"
          >
            <Plus className="w-4 h-4 text-emerald-400" />
            <span>{lang === 'ar' ? 'تسجيل يدوي (يوم)' : 'Manual Punch'}</span>
          </button>

          <button
            onClick={() => setActiveTab('attendance')}
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs shadow transition border border-emerald-800"
          >
            <Users className="w-4 h-4 text-white" />
            <span>{lang === 'ar' ? 'تسجيل حضور جماعي (إجمالي الأيام)' : 'Bulk Manual Entry'}</span>
          </button>

          <button
            onClick={onOpenAddEmployee}
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow transition"
          >
            <UserPlus className="w-4 h-4 text-emerald-400" />
            <span>{lang === 'ar' ? 'إضافة موظف' : 'Add Employee'}</span>
          </button>

          <button
            onClick={onExportCSV}
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs border border-slate-200 transition"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>{lang === 'ar' ? 'تصدير اكسل' : 'Export CSV'}</span>
          </button>
        </div>
      </div>

      {/* Metric KPI Cards Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 p-3 rounded-3xl" style={{ backgroundColor: '#5e2c74' }}>
        {/* Total Employees */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold whitespace-nowrap">{lang === 'ar' ? 'إجمالي الموظفين' : 'Total Staff'}</span>
            <Users className="w-4 h-4 text-slate-400 shrink-0" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-slate-900 font-mono">{toWesternDigits(totalEmp)}</div>
          <div className="text-[10px] text-slate-400 font-medium whitespace-nowrap">{lang === 'ar' ? 'جميع الأقسام' : 'All Departments'}</div>
        </div>

        {/* Present Today */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold text-emerald-700 whitespace-nowrap">{lang === 'ar' ? 'الحاضرين اليوم' : 'Present Today'}</span>
            <UserCheck className="w-4 h-4 text-emerald-500 shrink-0" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-emerald-600 font-mono">{toWesternDigits(presentCount)}</div>
          <div className="text-[10px] text-emerald-700 font-semibold font-mono whitespace-nowrap">
            {toWesternDigits(presentPct)}% {lang === 'ar' ? 'من الإجمالي' : 'presence'}
          </div>
        </div>

        {/* Late */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold text-amber-700 whitespace-nowrap">{lang === 'ar' ? 'المتأخرين' : 'Late Arrivals'}</span>
            <Clock className="w-4 h-4 text-amber-500 shrink-0" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-amber-600 font-mono">{toWesternDigits(lateCount)}</div>
          <div className="text-[10px] text-amber-700 font-semibold font-mono whitespace-nowrap">
            {toWesternDigits(latePctOfTotal)}% {lang === 'ar' ? 'من الإجمالي' : 'of total'}
          </div>
        </div>

        {/* Absent */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold text-rose-700 whitespace-nowrap">{lang === 'ar' ? 'الغائبين' : 'Absent'}</span>
            <UserX className="w-4 h-4 text-rose-500 shrink-0" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-rose-600 font-mono">{toWesternDigits(absentCount)}</div>
          <div className="text-[10px] text-rose-700 font-semibold font-mono whitespace-nowrap">
            {toWesternDigits(absentPct)}% {lang === 'ar' ? 'من الإجمالي' : 'absenteeism'}
          </div>
        </div>

        {/* On Leave */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold text-sky-700 whitespace-nowrap">{lang === 'ar' ? 'في إجازة' : 'On Leave'}</span>
            <Palmtree className="w-4 h-4 text-sky-500 shrink-0" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-sky-600 font-mono">{toWesternDigits(leaveCount)}</div>
          <div className="text-[10px] text-sky-700 font-semibold font-mono whitespace-nowrap">
            {toWesternDigits(leavePct)}% {lang === 'ar' ? 'من الإجمالي' : 'approved leave'}
          </div>
        </div>

        {/* Compliance Rate */}
        <div className="bg-[#0d2240] text-white p-4 rounded-2xl shadow-sm space-y-2 border border-blue-900">
          <div className="flex items-center justify-between text-slate-300">
            <span className="text-xs font-bold whitespace-nowrap">{lang === 'ar' ? 'مؤشر الالتزام' : 'Punctuality'}</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          </div>
          <div className="text-2xl sm:text-3xl font-black font-mono text-emerald-400">
            {presentCount > 0 ? `${toWesternDigits(complianceRate)}%` : '--'}
          </div>
          <div className="text-[10px] text-slate-300 font-mono whitespace-nowrap">
            {presentCount > 0 
              ? (lang === 'ar' ? `${toWesternDigits(onTimeCount)} من ${toWesternDigits(presentCount)} في الموعد` : `${onTimeCount} of ${presentCount} on time`)
              : (lang === 'ar' ? 'لا يوجد حضور اليوم حتى الآن' : 'No attendance logged today')}
          </div>
        </div>
      </div>

      {/* Main Grid: Live Feed & Department Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Today Live Punch Feed Table (8 cols) */}
        <div className="lg:col-span-8 bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 flex-wrap gap-2">
            <div>
              <h3 className="font-bold text-slate-900 text-base">
                {lang === 'ar' ? 'سجل الحضور والغياب لليوم' : 'Today Attendance Feed'}
              </h3>
              <p className="text-xs text-slate-400">
                {lang === 'ar' ? 'متابعة لحظية بصيغة 12 ساعة (AM/PM)' : '12-Hour format punch logs'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveTab('attendance')}
                className="text-xs font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
              >
                <span>{lang === 'ar' ? 'عرض السجل الكامل' : 'View Full Logs'}</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 font-semibold bg-slate-50/50 whitespace-nowrap">
                  <th className="py-3 px-3 whitespace-nowrap">{lang === 'ar' ? 'الموظف' : 'Employee'}</th>
                  <th className="py-3 px-3 whitespace-nowrap">{lang === 'ar' ? 'القسم' : 'Department'}</th>
                  <th className="py-3 px-3 whitespace-nowrap">{lang === 'ar' ? 'وقت الحضور (12H)' : 'Check-In'}</th>
                  <th className="py-3 px-3 whitespace-nowrap">{lang === 'ar' ? 'وقت الانصراف (12H)' : 'Check-Out'}</th>
                  <th className="py-3 px-3 whitespace-nowrap">{lang === 'ar' ? 'الحالة' : 'Status'}</th>
                  {onDeleteRecord && (currentUser?.role === 'leader' || currentUser?.role === 'admin' || !currentUser) && (
                    <th className="py-3 px-3 text-center whitespace-nowrap">{lang === 'ar' ? 'إجراءات' : 'Actions'}</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {[...employees].sort((a, b) => {
                  const recA = todayRecords.find(r => r.employeeId === a.id);
                  const recB = todayRecords.find(r => r.employeeId === b.id);

                  const getRank = (rec?: AttendanceRecord) => {
                    if (rec?.checkIn) return 1; // Checked in (Present / In progress / Late / Completed)
                    if (rec?.status === 'on_leave') return 2; // On leave
                    return 3; // Absent / Not checked in
                  };

                  const rankA = getRank(recA);
                  const rankB = getRank(recB);

                  if (rankA !== rankB) return rankA - rankB;

                  if (recA?.checkIn && recB?.checkIn) {
                    return recA.checkIn.localeCompare(recB.checkIn);
                  }

                  return (a.code || '').localeCompare(b.code || '');
                }).map((emp) => {
                  const rec = todayRecords.find(r => r.employeeId === emp.id);
                  const approvedLeaveToday = todayApprovedLeaves.find(l => l.employeeId === emp.id);
                  const isPermission = approvedLeaveToday?.type === 'permission';

                  let effectiveLateMins = rec?.lateMinutes || 0;
                  if (isPermission) {
                    effectiveLateMins = 0;
                  }

                  let status = rec ? rec.status : (approvedLeaveToday ? 'on_leave' : (isTodayWeekend ? 'weekend' : undefined));
                  if (isPermission && rec?.checkIn) {
                    status = rec.checkOut ? 'on_time' : 'in_progress';
                  }

                  return (
                    <tr key={emp.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2.5">
                          <UserAvatar name={emp.nameEn || emp.nameAr} code={emp.code} avatar={emp.avatar} size="sm" />
                          <div>
                            <div className="font-bold text-slate-900 whitespace-nowrap" title={lang === 'ar' ? emp.nameAr : emp.nameEn}>
                              {getFirstTwoNames(lang === 'ar' ? emp.nameAr : emp.nameEn)}
                            </div>
                            <div className="text-[10px] text-slate-500 font-mono font-bold">{emp.code}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-slate-600 font-medium">{emp.department}</td>
                      <td className="py-3 px-3 font-mono text-slate-800">
                        {rec?.checkIn ? (
                          <div>
                            <div className="font-bold">{formatTime(rec.checkIn, lang)}</div>
                            {!rec.checkOut && (
                              <WorkTimer checkIn={rec.checkIn} checkOut={rec.checkOut} breakStart={rec.breakStart} breakEnd={rec.breakEnd} className="text-[11px] text-emerald-700 font-bold block" />
                            )}
                          </div>
                        ) : '--:--'}
                        {effectiveLateMins > 0 ? (
                          <span className="text-[10px] text-amber-700 block font-mono font-bold">
                            +{toWesternDigits(effectiveLateMins)}د تأخير
                          </span>
                        ) : null}
                      </td>
                      <td className="py-3 px-3 font-mono font-bold text-slate-800">
                        {rec?.checkOut ? formatTime(rec.checkOut, lang) : '--:--'}
                      </td>
                      <td className="py-3 px-3">
                        {rec?.breakStart && !rec?.breakEnd ? (
                          <div className="flex flex-col gap-1 items-start">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                              <span>{lang === 'ar' ? 'في استراحة:' : 'On Break:'}</span>
                              <BreakTimer breakStart={rec.breakStart} />
                            </span>
                            {onForceEndBreak && (currentUser?.role === 'leader' || currentUser?.role === 'admin' || !currentUser) && (
                              <button
                                onClick={() => onForceEndBreak(emp.id)}
                                className="px-2 py-0.5 rounded-md bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-bold transition shadow-xs flex items-center gap-1 cursor-pointer mt-0.5"
                                title={lang === 'ar' ? 'إرجاع الموظف من الاستراحة الآن' : 'Force End Break Now'}
                              >
                                <span>{lang === 'ar' ? 'إرجاع من الاستراحة' : 'End Break'}</span>
                              </button>
                            )}
                          </div>
                        ) : isPermission ? (
                          rec?.checkIn ? (
                            <span className="inline-block px-2.5 py-1 rounded-full text-[10px] font-bold border bg-sky-50 text-sky-800 border-sky-200">
                              ⏱️ {rec.checkOut ? (lang === 'ar' ? 'حاضر (إذن معتمد)' : 'On Time (Permission)') : (lang === 'ar' ? 'قيد العمل (إذن معتمد)' : 'Clocked In (Permission)')}
                            </span>
                          ) : (
                            <span className="inline-block px-2.5 py-1 rounded-full text-[10px] font-bold border bg-amber-50 text-amber-800 border-amber-200">
                              ⏱️ {lang === 'ar' ? 'إذن استئذان معتمد' : 'Permission Approved'}
                            </span>
                          )
                        ) : status === 'on_leave' || approvedLeaveToday ? (
                          <span className="inline-block px-2.5 py-1 rounded-full text-[10px] font-bold border bg-teal-100 text-teal-900 border-teal-300">
                            🌴 {getLeaveTypeLabel(approvedLeaveToday?.type || rec?.leaveType, lang, rec?.notes)}
                          </span>
                        ) : isTodayWeekend && !rec?.checkIn ? (
                          <span className="inline-block px-2.5 py-1 rounded-full text-[10px] font-bold border bg-emerald-50 text-emerald-800 border-emerald-300">
                            🏖️ {lang === 'ar' ? 'عطلة أسبوعية' : 'Weekend Holiday'}
                          </span>
                        ) : (
                          <span className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-bold border ${getStatusBadgeStyle(status)}`}>
                            {getStatusText(status, lang, rec?.leaveType, rec?.notes)}
                          </span>
                        )}
                      </td>
                      {onDeleteRecord && (currentUser?.role === 'leader' || currentUser?.role === 'admin' || !currentUser) && (
                        <td className="py-3 px-3 text-center">
                          {rec ? (
                            <button
                              onClick={() => {
                                if (window.confirm(lang === 'ar' ? 'هل أنت تأكد من حذف هذا السجل؟' : 'Delete record?')) {
                                  onDeleteRecord(rec.id);
                                }
                              }}
                              className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 transition"
                              title={lang === 'ar' ? 'حذف السجل' : 'Delete record'}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <span className="text-slate-300">--</span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Side: Pending Alerts, Today's Active Leaves & Department Breakdown (4 cols) */}
        <div className="lg:col-span-4 space-y-6">
          {/* Card 1: Active Leaves Today Card */}
          <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                <Palmtree className="w-4 h-4 text-sky-600" />
                <span>{lang === 'ar' ? 'الموظفين في إجازة معتمدة اليوم' : 'Employees On Leave Today'}</span>
              </h3>
              <span className="text-xs bg-sky-100 text-sky-900 font-bold px-2 py-0.5 rounded-full font-mono">
                {toWesternDigits(todayApprovedLeaves.length)}
              </span>
            </div>

            {todayApprovedLeaves.length > 0 ? (
              <div className="space-y-2">
                {todayApprovedLeaves.map((req) => {
                  const emp = employees.find(e => e.id === req.employeeId);
                  return (
                    <div key={req.id} className="p-2.5 rounded-2xl bg-sky-50/60 border border-sky-200/80 text-xs flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <UserAvatar name={emp?.nameEn || emp?.nameAr || 'Emp'} code={emp?.code || ''} avatar={emp?.avatar} size="xs" />
                        <div>
                          <div className="font-bold text-slate-900">{emp ? (lang === 'ar' ? emp.nameAr : emp.nameEn) : 'موظف'}</div>
                          <div className="text-[10px] text-slate-500 font-mono">#{emp?.code} • {emp?.department}</div>
                        </div>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                        req.type === 'sick' ? 'bg-rose-100 text-rose-800 border-rose-300' : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                      }`}>
                        {req.type === 'sick' ? '🩺 مرضية' : req.type === 'annual' ? '🌴 سنوية' : 'إجازة'}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-slate-400 py-3 text-center">
                {lang === 'ar' ? 'لا يوجد موظفون في إجازة معتمدة اليوم' : 'No staff on leave today'}
              </p>
            )}
          </div>

          {/* Card 2: Pending Leave Approvals Card */}
          <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <span>{lang === 'ar' ? 'طلبات إجازة قيد الانتظار' : 'Pending Leave Requests'}</span>
              </h3>
              <span className="text-xs bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-full font-mono">
                {toWesternDigits(pendingLeaves.length)}
              </span>
            </div>

            {pendingLeaves.length > 0 ? (
              <div className="space-y-2.5">
                {pendingLeaves.slice(0, 4).map((req) => {
                  const emp = employees.find(e => e.id === req.employeeId);
                  return (
                    <div key={req.id} className="p-3 rounded-2xl bg-amber-50/50 border border-amber-200/70 text-xs space-y-2">
                      <div className="flex items-center justify-between font-bold text-slate-900">
                        <span className="flex items-center gap-1.5">
                          <span>{emp ? (lang === 'ar' ? emp.nameAr : emp.nameEn) : 'موظف'}</span>
                          <span className="text-[10px] text-slate-500 font-mono">({emp?.department})</span>
                        </span>
                        <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                          req.type === 'sick' ? 'bg-rose-100 text-rose-800 border border-rose-300' : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        }`}>
                          {req.type === 'annual' ? 'سنوية' : req.type === 'sick' ? 'مرضية' : 'استئذان'}
                        </span>
                      </div>
                      <p className="text-slate-600 text-[11px] line-clamp-2 bg-white/80 p-2 rounded-xl border border-amber-200/50">{req.reason}</p>
                      
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-[10px] font-mono text-slate-500">
                          {toWesternDigits(req.startDate)} إلى {toWesternDigits(req.endDate)}
                        </span>
                        
                        {onUpdateLeaveStatus ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => onUpdateLeaveStatus(req.id, 'approved', 'تم الاعتماد المباشر من الداش بورد')}
                              className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] shadow-xs"
                            >
                              {lang === 'ar' ? 'قبول 🟢' : 'Approve'}
                            </button>
                            <button
                              onClick={() => onUpdateLeaveStatus(req.id, 'rejected', 'تم الرفض من الإدارة')}
                              className="px-2 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-[10px] shadow-xs"
                            >
                              {lang === 'ar' ? 'رفض 🔴' : 'Reject'}
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setActiveTab('leaves')}
                            className="text-[11px] font-bold text-emerald-700 underline"
                          >
                            مراجعة الطلب
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-slate-400 py-4 text-center">
                {lang === 'ar' ? 'لا توجد طلبات إجازة قيد الانتظار حالياً' : 'No pending requests'}
              </p>
            )}
          </div>

          {/* Department Attendance Summary */}
          <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-4">
            <h3 className="font-bold text-slate-900 text-sm pb-2 border-b border-slate-100">
              {lang === 'ar' ? 'توزيع الحضور حسب الأقسام' : 'Department Attendance'}
            </h3>

            {['CX', 'E-Commerce', 'Quality'].map((dept) => {
              const deptEmps = employees.filter(e => e.department === dept);
              const deptPresent = todayRecords.filter(r => deptEmps.some(e => e.id === r.employeeId) && r.checkIn).length;
              const pct = deptEmps.length > 0 ? Math.round((deptPresent / deptEmps.length) * 100) : 0;

              return (
                <div key={dept} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="text-slate-800">{dept}</span>
                    <span className="text-slate-500 font-mono">
                      {toWesternDigits(deptPresent)}/{toWesternDigits(deptEmps.length)} ({toWesternDigits(pct)}%)
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all duration-500 ${
                        pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-rose-500'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

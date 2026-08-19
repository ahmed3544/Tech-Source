import React, { useState, useMemo } from 'react';
import {
  Users,
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  X,
  FileSpreadsheet,
  Check,
  RefreshCw,
  Info
} from 'lucide-react';
import {
  Employee,
  Shift,
  AttendanceRecord,
  LeaveRequest,
  Language,
  AttendanceStatus
} from '../types';
import { evaluatePunch, formatTime } from '../utils/helpers';

interface BulkAttendanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  employees: Employee[];
  shifts: Shift[];
  existingRecords: AttendanceRecord[];
  leaveRequests: LeaveRequest[];
  onConfirmBulk: (records: AttendanceRecord[]) => void;
  lang: Language;
}

export const BulkAttendanceModal: React.FC<BulkAttendanceModalProps> = ({
  isOpen,
  onClose,
  employees,
  shifts,
  existingRecords,
  leaveRequests,
  onConfirmBulk,
  lang,
}) => {
  const [selectedEmpId, setSelectedEmpId] = useState<string>('all');
  const [startDate, setStartDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [rangeType, setRangeType] = useState<'days_count' | 'end_date'>('days_count');
  const [numberOfDays, setNumberOfDays] = useState<number>(10);
  const [endDate, setEndDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 9);
    return d.toISOString().split('T')[0];
  });
  const [checkIn, setCheckIn] = useState<string>('09:00');
  const [checkOut, setCheckOut] = useState<string>('17:00');
  const [includeWeekends, setIncludeWeekends] = useState<boolean>(false);
  const [duplicateAction, setDuplicateAction] = useState<'skip' | 'overwrite'>('skip');
  const [step, setStep] = useState<'configure' | 'preview'>('configure');

  const activeEmployees = useMemo(() => {
    return employees.filter(e => e.status !== 'inactive');
  }, [employees]);

  // Generate list of dates
  const generatedDates = useMemo(() => {
    if (!startDate) return [];
    const dates: string[] = [];
    const curr = new Date(startDate);
    if (isNaN(curr.getTime())) return [];

    const defaultWorkDays = [0, 1, 2, 3, 4]; // Sun - Thu

    if (rangeType === 'days_count') {
      let count = 0;
      let maxSafety = 365;
      while (count < numberOfDays && maxSafety > 0) {
        maxSafety--;
        const dayOfWeek = curr.getDay();
        const dateStr = curr.toISOString().split('T')[0];

        let isWorkDay = defaultWorkDays.includes(dayOfWeek);
        if (selectedEmpId !== 'all') {
          const emp = employees.find(e => e.id === selectedEmpId);
          const shift = shifts.find(s => s.id === emp?.shiftId);
          if (shift && Array.isArray(shift.workDays)) {
            isWorkDay = shift.workDays.includes(dayOfWeek);
          }
        }

        if (includeWeekends || isWorkDay) {
          dates.push(dateStr);
          count++;
        }
        curr.setDate(curr.getDate() + 1);
      }
    } else {
      if (!endDate) return [];
      const end = new Date(endDate);
      let maxSafety = 365;
      while (curr <= end && maxSafety > 0) {
        maxSafety--;
        const dayOfWeek = curr.getDay();
        const dateStr = curr.toISOString().split('T')[0];

        let isWorkDay = defaultWorkDays.includes(dayOfWeek);
        if (selectedEmpId !== 'all') {
          const emp = employees.find(e => e.id === selectedEmpId);
          const shift = shifts.find(s => s.id === emp?.shiftId);
          if (shift && Array.isArray(shift.workDays)) {
            isWorkDay = shift.workDays.includes(dayOfWeek);
          }
        }

        if (includeWeekends || isWorkDay) {
          dates.push(dateStr);
        }
        curr.setDate(curr.getDate() + 1);
      }
    }
    return dates;
  }, [startDate, rangeType, numberOfDays, endDate, includeWeekends, selectedEmpId, employees, shifts]);

  // Build items for preview & confirmation
  const previewItems = useMemo(() => {
    const targetEmps = selectedEmpId === 'all'
      ? activeEmployees
      : activeEmployees.filter(e => e.id === selectedEmpId);

    const items: {
      employee: Employee;
      date: string;
      checkIn: string;
      checkOut: string;
      status: AttendanceStatus;
      lateMinutes: number;
      earlyLeaveMinutes: number;
      workHours: number;
      isDuplicate: boolean;
      existingRecord?: AttendanceRecord;
      actionWillTake: 'create' | 'update' | 'skip';
      recordToSave: AttendanceRecord;
    }[] = [];

    const existingMap = new Map<string, AttendanceRecord>();
    for (const r of existingRecords) {
      if (r.employeeId && r.date) {
        existingMap.set(`${r.employeeId}_${r.date}`, r);
      }
    }

    const formatTime24To12 = (timeStr: string) => {
      if (!timeStr) return '';
      return timeStr.length === 5 ? `${timeStr}:00` : timeStr;
    };

    const formattedIn = formatTime24To12(checkIn);
    const formattedOut = formatTime24To12(checkOut);

    for (const emp of targetEmps) {
      const shift = shifts.find(s => s.id === emp.shiftId) || shifts[0] || {
        id: 'default',
        nameAr: 'الوردية الصباحية',
        nameEn: 'Morning Shift',
        startTime: '09:00',
        endTime: '17:00',
        gracePeriodMinutes: 15,
        workDays: [0, 1, 2, 3, 4],
      };

      for (const dStr of generatedDates) {
        const key = `${emp.id}_${dStr}`;
        const existing = existingMap.get(key);
        const isDuplicate = Boolean(existing);

        const perm = leaveRequests.find(l =>
          l.employeeId === emp.id &&
          l.status === 'approved' &&
          l.type === 'permission' &&
          l.startDate === dStr
        );

        const evaluated = evaluatePunch(
          formattedIn,
          formattedOut,
          shift,
          dStr,
          perm?.permissionSlot,
          Boolean(perm)
        );

        let actionWillTake: 'create' | 'update' | 'skip' = 'create';
        if (isDuplicate) {
          actionWillTake = duplicateAction === 'skip' ? 'skip' : 'update';
        }

        const recordToSave: AttendanceRecord = {
          id: existing ? existing.id : `rec-${emp.id}-${dStr}`,
          employeeId: emp.id,
          date: dStr,
          checkIn: formattedIn,
          checkOut: formattedOut,
          lateMinutes: evaluated.lateMinutes,
          lateSeconds: evaluated.lateSeconds,
          earlyLeaveMinutes: evaluated.earlyLeaveMinutes,
          workHours: evaluated.workHours,
          overtimeHours: evaluated.overtimeHours,
          status: evaluated.status,
          notes: lang === 'ar' ? 'تسجيل حضور جماعي يدوي بواسطة الإدارة' : 'Bulk manual attendance entry',
          verifiedByFace: false,
          updatedAt: new Date().toISOString(),
        };

        items.push({
          employee: emp,
          date: dStr,
          checkIn: formattedIn,
          checkOut: formattedOut,
          status: evaluated.status,
          lateMinutes: evaluated.lateMinutes,
          earlyLeaveMinutes: evaluated.earlyLeaveMinutes,
          workHours: evaluated.workHours,
          isDuplicate,
          existingRecord: existing,
          actionWillTake,
          recordToSave,
        });
      }
    }

    return items;
  }, [selectedEmpId, activeEmployees, generatedDates, checkIn, checkOut, shifts, leaveRequests, existingRecords, duplicateAction, lang]);

  const stats = useMemo(() => {
    const total = previewItems.length;
    const createCount = previewItems.filter(i => i.actionWillTake === 'create').length;
    const updateCount = previewItems.filter(i => i.actionWillTake === 'update').length;
    const skipCount = previewItems.filter(i => i.actionWillTake === 'skip').length;
    return { total, createCount, updateCount, skipCount };
  }, [previewItems]);

  const handleApplyBulk = () => {
    const recordsToSave = previewItems
      .filter(i => i.actionWillTake !== 'skip')
      .map(i => i.recordToSave);

    if (recordsToSave.length === 0) {
      alert(lang === 'ar' ? 'لا توجد سجلات جديدة أو مؤكدة للحفظ!' : 'No new or updated records to save!');
      return;
    }

    onConfirmBulk(recordsToSave);
    onClose();
    setStep('configure');
  };

  const renderStatusBadge = (status: AttendanceStatus) => {
    switch (status) {
      case 'on_time':
        return <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-[11px] font-bold border border-emerald-200">{lang === 'ar' ? 'حاضر (في الموعد)' : 'On Time'}</span>;
      case 'late':
        return <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 text-[11px] font-bold border border-amber-200">{lang === 'ar' ? 'متأخر' : 'Late'}</span>;
      case 'early_leave':
        return <span className="px-2 py-0.5 rounded-md bg-orange-50 text-orange-700 text-[11px] font-bold border border-orange-200">{lang === 'ar' ? 'انصراف مبكر' : 'Early Leave'}</span>;
      default:
        return <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[11px] font-bold border border-slate-200">{status}</span>;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-3xl w-full overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-[#0d2240] text-white p-5 flex items-center justify-between border-b border-blue-900 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-500/20 rounded-2xl border border-blue-400/30">
              <Users className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-lg font-black tracking-tight">
                {lang === 'ar' ? 'تسجيل حضور جماعي (إجمالي الأيام)' : 'Bulk Manual Attendance Registration'}
              </h3>
              <p className="text-xs text-slate-300">
                {lang === 'ar' ? 'إدخال الحضور والانصراف لمجموع الأيام دفعة واحدة' : 'Register bulk attendance records for date ranges'}
              </p>
            </div>
          </div>
          <button
            onClick={() => { onClose(); setStep('configure'); }}
            className="p-2 text-slate-300 hover:text-white hover:bg-white/10 rounded-xl transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {step === 'configure' ? (
            <div className="space-y-5">
              {/* Employee selection */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-slate-500" />
                  <span>{lang === 'ar' ? 'اختر الموظف / الموظفين' : 'Select Employee(s)'}</span>
                </label>
                <select
                  value={selectedEmpId}
                  onChange={e => setSelectedEmpId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 text-sm font-semibold text-slate-800"
                >
                  <option value="all">{lang === 'ar' ? '👥 جميع الموظفين النشطين (الكل)' : '👥 All Active Employees'}</option>
                  {activeEmployees.map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {emp.nameAr} - ({emp.code}) - {emp.department}
                    </option>
                  ))}
                </select>
              </div>

              {/* Start Date & Mode Selection */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-slate-500" />
                    <span>{lang === 'ar' ? 'تاريخ البداية' : 'Start Date'}</span>
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 text-sm font-semibold text-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    {lang === 'ar' ? 'طريقة تحديد الأيام' : 'Range Specification Method'}
                  </label>
                  <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl border border-slate-200">
                    <button
                      type="button"
                      onClick={() => setRangeType('days_count')}
                      className={`py-1.5 px-3 rounded-lg text-xs font-bold transition ${
                        rangeType === 'days_count'
                          ? 'bg-[#0d2240] text-white shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {lang === 'ar' ? 'عدد الأيام' : 'Number of Days'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setRangeType('end_date')}
                      className={`py-1.5 px-3 rounded-lg text-xs font-bold transition ${
                        rangeType === 'end_date'
                          ? 'bg-[#0d2240] text-white shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {lang === 'ar' ? 'تاريخ الانتهاء' : 'End Date'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Days Count or End Date Input */}
              {rangeType === 'days_count' ? (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    {lang === 'ar' ? 'إجمالي عدد الأيام المطلوب تسجيلها' : 'Total Number of Days to Register'}
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min={1}
                      max={90}
                      value={numberOfDays}
                      onChange={e => setNumberOfDays(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-32 px-3.5 py-2.5 rounded-xl border border-slate-300 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 text-sm font-bold text-slate-800 text-center"
                    />
                    <span className="text-xs text-slate-500">
                      {lang === 'ar'
                        ? `(سيتم اختيار ${numberOfDays} أيام عمل بدءاً من ${startDate})`
                        : `(${numberOfDays} workdays starting from ${startDate})`}
                    </span>
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    {lang === 'ar' ? 'تاريخ الانتهاء' : 'End Date'}
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={e => setEndDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 text-sm font-semibold text-slate-800"
                  />
                </div>
              )}

              {/* Check-In and Check-Out Times */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-emerald-600" />
                    <span>{lang === 'ar' ? 'ميعاد الحضور' : 'Check-in Time'}</span>
                  </label>
                  <input
                    type="time"
                    value={checkIn}
                    onChange={e => setCheckIn(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 text-sm font-bold text-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-rose-600" />
                    <span>{lang === 'ar' ? 'ميعاد الانصراف' : 'Check-out Time'}</span>
                  </label>
                  <input
                    type="time"
                    value={checkOut}
                    onChange={e => setCheckOut(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 text-sm font-bold text-slate-800"
                  />
                </div>
              </div>

              {/* Options */}
              <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeWeekends}
                    onChange={e => setIncludeWeekends(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 border-slate-300"
                  />
                  <span className="text-xs font-bold text-slate-800">
                    {lang === 'ar' ? 'تضمين أيام العطلات الأسبوعية (الجمعة والسبت)' : 'Include weekly weekends (Fri/Sat)'}
                  </span>
                </label>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {lang === 'ar' ? 'التعامل مع السجلات الموجودة مسبقاً:' : 'Handling Duplicate Existing Records:'}
                  </label>
                  <div className="flex items-center gap-4 text-xs font-semibold">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="dup_action"
                        value="skip"
                        checked={duplicateAction === 'skip'}
                        onChange={() => setDuplicateAction('skip')}
                        className="text-blue-600"
                      />
                      <span>{lang === 'ar' ? 'تخطي السجلات الموجودة (تجنب الاستبدال)' : 'Skip existing (Keep old record)'}</span>
                    </label>

                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="dup_action"
                        value="overwrite"
                        checked={duplicateAction === 'overwrite'}
                        onChange={() => setDuplicateAction('overwrite')}
                        className="text-blue-600"
                      />
                      <span>{lang === 'ar' ? 'تحديث/استبدال السجلات الموجودة' : 'Overwrite / update existing'}</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* PREVIEW STEP */
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-blue-50 rounded-2xl border border-blue-200 text-center">
                  <p className="text-[11px] text-blue-700 font-bold">{lang === 'ar' ? 'إجمالي السجلات' : 'Total Records'}</p>
                  <p className="text-xl font-black text-blue-900">{stats.total}</p>
                </div>
                <div className="p-3 bg-emerald-50 rounded-2xl border border-emerald-200 text-center">
                  <p className="text-[11px] text-emerald-700 font-bold">{lang === 'ar' ? 'سجلات جديدة' : 'New Records'}</p>
                  <p className="text-xl font-black text-emerald-900">{stats.createCount}</p>
                </div>
                <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200 text-center">
                  <p className="text-[11px] text-amber-700 font-bold">{lang === 'ar' ? 'سيتم تحديثها' : 'To Update'}</p>
                  <p className="text-xl font-black text-amber-900">{stats.updateCount}</p>
                </div>
                <div className="p-3 bg-slate-100 rounded-2xl border border-slate-200 text-center">
                  <p className="text-[11px] text-slate-600 font-bold">{lang === 'ar' ? 'سيتم تخطيها' : 'To Skip'}</p>
                  <p className="text-xl font-black text-slate-800">{stats.skipCount}</p>
                </div>
              </div>

              {/* Table Preview */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden max-h-72 overflow-y-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0 border-b border-slate-200">
                    <tr>
                      <th className="p-2.5">{lang === 'ar' ? 'الموظف' : 'Employee'}</th>
                      <th className="p-2.5">{lang === 'ar' ? 'التاريخ' : 'Date'}</th>
                      <th className="p-2.5">{lang === 'ar' ? 'الحضور' : 'In'}</th>
                      <th className="p-2.5">{lang === 'ar' ? 'الانصراف' : 'Out'}</th>
                      <th className="p-2.5">{lang === 'ar' ? 'الحالة' : 'Status'}</th>
                      <th className="p-2.5">{lang === 'ar' ? 'الإجراء' : 'Action'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                    {previewItems.slice(0, 100).map((item, idx) => (
                      <tr key={idx} className={item.actionWillTake === 'skip' ? 'bg-slate-50/60 opacity-60' : 'hover:bg-slate-50'}>
                        <td className="p-2.5 font-bold">
                          {item.employee.nameAr}
                          <span className="text-[10px] text-slate-400 block font-normal">{item.employee.code}</span>
                        </td>
                        <td className="p-2.5 font-mono dir-ltr text-right">{item.date}</td>
                        <td className="p-2.5 font-mono">{formatTime(item.checkIn, lang)}</td>
                        <td className="p-2.5 font-mono">{formatTime(item.checkOut, lang)}</td>
                        <td className="p-2.5">{renderStatusBadge(item.status)}</td>
                        <td className="p-2.5">
                          {item.actionWillTake === 'create' && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                              <Check className="w-3 h-3" />
                              {lang === 'ar' ? 'جديد' : 'New'}
                            </span>
                          )}
                          {item.actionWillTake === 'update' && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                              <RefreshCw className="w-3 h-3" />
                              {lang === 'ar' ? 'تحديث' : 'Update'}
                            </span>
                          )}
                          {item.actionWillTake === 'skip' && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                              <Info className="w-3 h-3" />
                              {lang === 'ar' ? 'موجود (تخطي)' : 'Skipped'}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="bg-slate-50 p-4 border-t border-slate-200 flex items-center justify-between shrink-0">
          {step === 'configure' ? (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl border border-slate-300 hover:bg-slate-200 text-slate-700 font-bold text-xs transition"
              >
                {lang === 'ar' ? 'إلغاء' : 'Cancel'}
              </button>

              <button
                type="button"
                onClick={() => setStep('preview')}
                disabled={previewItems.length === 0}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#0d2240] hover:bg-[#153460] text-white font-bold text-xs shadow-md transition disabled:opacity-50"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                <span>{lang === 'ar' ? `معاينة السجلات (${previewItems.length})` : `Preview Records (${previewItems.length})`}</span>
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setStep('configure')}
                className="px-4 py-2.5 rounded-xl border border-slate-300 hover:bg-slate-200 text-slate-700 font-bold text-xs transition"
              >
                {lang === 'ar' ? 'تعديل الإعدادات' : 'Back to Settings'}
              </button>

              <button
                type="button"
                onClick={handleApplyBulk}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md transition"
              >
                <CheckCircle2 className="w-4 h-4 text-white" />
                <span>
                  {lang === 'ar'
                    ? `تأكيد وحفظ (${stats.createCount + stats.updateCount}) سجل`
                    : `Confirm & Save (${stats.createCount + stats.updateCount}) Records`}
                </span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

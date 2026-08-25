import React, { useState } from 'react';
import {  
  Search, 
  FileSpreadsheet, 
  Plus, 
  Edit3, 
  Calendar, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  X,
  ShieldAlert,
  ShieldCheck,
  Coffee,
  RotateCcw,
  Trash2,
  Users
 } from 'lucide-react';
import { generateCSVString } from '../utils/helpers';
import { AttendanceRecord, Employee, Shift, AttendanceStatus, Language, LeaveRequest } from '../types';
import { UserAvatar } from './UserAvatar';
import { BreakTimer } from './BreakTimer';
import { BulkAttendanceModal } from './BulkAttendanceModal';
import { formatHoursToHHMM,  getStatusBadgeStyle, getStatusText, getLeaveTypeLabel, evaluatePunch, formatTime, formatDate, toWesternDigits, getFirstTwoNames, getTodayString, isWeekend  } from '../utils/helpers';

interface AttendanceLogTableProps {
  records: AttendanceRecord[];
  employees: Employee[];
  shifts: Shift[];
  leaveRequests?: LeaveRequest[];
  onAddRecord: (record: AttendanceRecord) => void;
  onBatchAddRecords?: (records: AttendanceRecord[]) => void;
  onUpdateRecord: (record: AttendanceRecord) => void;
  onDeleteRecord?: (id: string) => void;
  onClearTodayRecords?: (date: string) => void;
  onDeleteFutureRecords?: () => void;
  onExportCSV: () => void;
  lang: Language;
  onForceEndBreak?: (empId: string) => void;
  currentUser?: Employee | null;
  globalSearchTerm?: string;
}

export const AttendanceLogTable: React.FC<AttendanceLogTableProps> = ({
  records,
  employees,
  shifts,
  leaveRequests = [],
  onAddRecord,
  onBatchAddRecords,
  onUpdateRecord,
  onDeleteRecord,
  onClearTodayRecords,
  onDeleteFutureRecords,
  onExportCSV,
  lang,
  onForceEndBreak,
  currentUser,
  globalSearchTerm,
}) => {
  const isLeader = !currentUser || currentUser.role === 'leader' || currentUser.code === 'leader' || (currentUser as any)?.role === 'admin';

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDept, setSelectedDept] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [selectedDate, setSelectedDate] = useState<string>('');
  
  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingRecord, setEditingRecord] = useState<AttendanceRecord | null>(null);

  // Excuse Penalty Custom Modal State
  const [showExcuseModal, setShowExcuseModal] = useState(false);
  const [selectedRecordToExcuse, setSelectedRecordToExcuse] = useState<AttendanceRecord | null>(null);
  const [excuseReason, setExcuseReason] = useState('');
  const [isRestoring, setIsRestoring] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);

  const handleOpenExcuseModal = (rec: AttendanceRecord) => {
    setSelectedRecordToExcuse(rec);
    setIsRestoring(Boolean(rec.isExcused));
    setExcuseReason(rec.excusedReason || (lang === 'ar' ? 'إعفاء إداري بموافقة التيم ليدر' : 'Administrative excuse by Team Leader'));
    setShowExcuseModal(true);
  };

  const handleConfirmExcuse = () => {
    if (!selectedRecordToExcuse) return;
    if (isRestoring) {
      onUpdateRecord({ ...selectedRecordToExcuse, isExcused: false, excusedBy: undefined, excusedReason: undefined });
    } else {
      const defaultReason = lang === 'ar' ? 'إعفاء إداري بموافقة التيم ليدر' : 'Administrative excuse by Team Leader';
      onUpdateRecord({
        ...selectedRecordToExcuse,
        isExcused: true,
        excusedBy: currentUser?.nameAr || (lang === 'ar' ? 'تيم ليدر' : 'Team Leader'),
        excusedReason: excuseReason.trim() || defaultReason,
      });
    }
    setShowExcuseModal(false);
    setSelectedRecordToExcuse(null);
  };

  // Form State
  const [formEmpId, setFormEmpId] = useState(employees[0]?.id || '');
  const [formDate, setFormDate] = useState(getTodayString());
  const [formRecordType, setFormRecordType] = useState<'attendance' | 'weekend' | 'on_leave' | 'absent'>('attendance');
  const [formCheckIn, setFormCheckIn] = useState('09:00');
  const [formCheckOut, setFormCheckOut] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formIsExcused, setFormIsExcused] = useState(false);
  const [formExcusedReason, setFormExcusedReason] = useState('');

  const openCreateModal = () => {
    setEditingRecord(null);
    setFormEmpId(employees[0]?.id || '');
    setFormDate(getTodayString());
    setFormRecordType('attendance');
    setFormCheckIn('09:00');
    setFormCheckOut('');
    setFormNotes('');
    setFormIsExcused(false);
    setFormExcusedReason('');
    setShowModal(true);
  };

  const openCreateWeekendModal = (empId?: string, dateStr?: string) => {
    setEditingRecord(null);
    setFormEmpId(typeof empId === 'string' && empId ? empId : (employees[0]?.id || ''));
    setFormDate(typeof dateStr === 'string' && dateStr ? dateStr : getTodayString());
    setFormRecordType('weekend');
    setFormCheckIn('');
    setFormCheckOut('');
    setFormNotes(lang === 'ar' ? 'عطلة أسبوعية يدوية (مانيوال) معتمدة بواسطة التيم ليدر 🏖️' : 'Manual weekly weekend holiday');
    setFormIsExcused(false);
    setFormExcusedReason('');
    setShowModal(true);
  };

  const openEditModal = (rec: AttendanceRecord) => {
    setEditingRecord(rec);
    setFormEmpId(rec.employeeId);
    setFormDate(rec.date);
    setFormRecordType(
      rec.status === 'weekend' 
        ? 'weekend' 
        : (rec.status === 'on_leave' 
          ? 'on_leave' 
          : (rec.status === 'absent' ? 'absent' : 'attendance'))
    );
    setFormCheckIn(rec.checkIn ? rec.checkIn.substring(0, 5) : '09:00');
    setFormCheckOut(rec.checkOut ? rec.checkOut.substring(0, 5) : '');
    setFormNotes(rec.notes || '');
    setFormIsExcused(Boolean(rec.isExcused));
    setFormExcusedReason(rec.excusedReason || '');
    setShowModal(true);
  };

  const handleSaveForm = (e: React.FormEvent) => {
    e.preventDefault();
    const emp = employees.find(e => e.id === formEmpId);
    if (!emp) return;

    if (formRecordType === 'weekend') {
      const recordData: AttendanceRecord = {
        id: editingRecord ? editingRecord.id : `rec-${formEmpId}-${formDate}`,
        employeeId: formEmpId,
        date: formDate,
        notes: formNotes || (lang === 'ar' ? 'عطلة أسبوعية يدوية (مانيوال) معتمدة بواسطة التيم ليدر 🏖️' : 'Manual weekly weekend holiday'),
        workHours: 0,
        lateMinutes: 0,
        lateSeconds: 0,
        earlyLeaveMinutes: 0,
        overtimeHours: 0,
        status: 'weekend',
        verifiedByFace: true,
        updatedAt: new Date().toISOString(),
      };
      if (editingRecord) {
        onUpdateRecord(recordData);
      } else {
        onAddRecord(recordData);
      }
      setShowModal(false);
      return;
    }

    if (formRecordType === 'on_leave') {
      const recordData: AttendanceRecord = {
        id: editingRecord ? editingRecord.id : `rec-${formEmpId}-${formDate}`,
        employeeId: formEmpId,
        date: formDate,
        notes: formNotes || (lang === 'ar' ? 'تم تسجيل اليوم كإجازة اعتيادية من قِبل التيم ليدر 🌴' : 'Marked as on leave by Team Leader'),
        workHours: 0,
        lateMinutes: 0,
        lateSeconds: 0,
        earlyLeaveMinutes: 0,
        overtimeHours: 0,
        status: 'on_leave',
        leaveType: 'annual',
        verifiedByFace: true,
        updatedAt: new Date().toISOString(),
      };
      if (editingRecord) {
        onUpdateRecord(recordData);
      } else {
        onAddRecord(recordData);
      }
      setShowModal(false);
      return;
    }

    if (formRecordType === 'absent') {
      const recordData: AttendanceRecord = {
        id: editingRecord ? editingRecord.id : `rec-${formEmpId}-${formDate}`,
        employeeId: formEmpId,
        date: formDate,
        notes: formNotes || (lang === 'ar' ? `تسجيل غياب عن يوم ${formDate} بواسطة التيم ليدر ❌` : 'Marked as absent by Team Leader'),
        workHours: 0,
        lateMinutes: 0,
        lateSeconds: 0,
        earlyLeaveMinutes: 0,
        overtimeHours: 0,
        status: 'absent',
        verifiedByFace: true,
        updatedAt: new Date().toISOString(),
      };
      if (editingRecord) {
        onUpdateRecord(recordData);
      } else {
        onAddRecord(recordData);
      }
      setShowModal(false);
      return;
    }

    const shift = shifts.find(s => s.id === emp.shiftId) || shifts[0];
    const evaluated = evaluatePunch(formCheckIn + ':00', formCheckOut ? formCheckOut + ':00' : undefined, shift);

    const isExplicitClear = Boolean(editingRecord && editingRecord.checkOut && !formCheckOut);

    const recordData: AttendanceRecord = {
      id: editingRecord ? editingRecord.id : `rec-${Date.now()}`,
      employeeId: formEmpId,
      date: formDate,
      checkIn: formCheckIn ? `${formCheckIn}:00` : (editingRecord ? editingRecord.checkIn : undefined),
      checkOut: formCheckOut ? `${formCheckOut}:00` : undefined,
      _isExplicitCancelCheckOut: isExplicitClear,
      location: '',
      notes: formNotes,
      lateMinutes: evaluated.lateMinutes,
      lateSeconds: evaluated.lateSeconds,
      earlyLeaveMinutes: evaluated.earlyLeaveMinutes,
      workHours: evaluated.workHours,
      overtimeHours: evaluated.overtimeHours,
      status: evaluated.status,
      verifiedByFace: true,
      isExcused: formIsExcused,
      excusedBy: formIsExcused ? (currentUser?.nameAr || 'تيم ليدر') : undefined,
      excusedReason: formIsExcused ? (formExcusedReason || 'إعفاء إداري من التيم ليدر') : undefined,
      updatedAt: new Date().toISOString(),
    };

    if (editingRecord) {
      onUpdateRecord(recordData);
    } else {
      onAddRecord(recordData);
    }

    setShowModal(false);
  };

  // Quick Action for Leader: Cancel Accidental Check-Out
  const handleCancelCheckOut = (rec: AttendanceRecord) => {
    if (!isLeader) return;
    const emp = employees.find(e => e.id === rec.employeeId);
    const shift = shifts.find(s => s.id === emp?.shiftId) || shifts[0];

    const evaluated = evaluatePunch(rec.checkIn || '09:00:00', undefined, shift);

    const updatedRecord: AttendanceRecord = {
      ...rec,
      checkOut: null,
      _isExplicitCancelCheckOut: true,
      workHours: 0,
      earlyLeaveMinutes: 0,
      status: evaluated.status, // Restores status to 'in_progress', 'late', or 'on_time'
      updatedAt: new Date().toISOString(),
      notes: rec.notes 
        ? `${rec.notes} | إلغاء الانصراف الخاطئ بواسطة التيم ليدر` 
        : 'إلغاء الانصراف الخاطئ بواسطة التيم ليدر',
    };

    onUpdateRecord(updatedRecord);
  };

  const activeSearch = globalSearchTerm !== undefined && globalSearchTerm !== '' ? globalSearchTerm : searchTerm;

  // Filtering & Sorting Logic
  const filteredRecords = records.filter((rec) => {
    const emp = employees.find(e => e.id === rec.employeeId);
    if (!emp) return false;

    // Team Leader / Employee / Admin scope filtering
    if (currentUser?.role === 'employee') {
      if (rec.employeeId !== currentUser.id) return false;
    } else if (currentUser?.role === 'leader') {
      // If a specific department filter is chosen (e.g. 'E-Commerce'), honor the department selection
      if (selectedDept === 'all' && !activeSearch) {
        const hasExplicitTeam = employees.some(e => e.teamLeaderId === currentUser.id);
        if (hasExplicitTeam) {
          const assignedEmpIds = new Set(
            employees
              .filter(e => e.teamLeaderId === currentUser.id || (currentUser.teamId && e.teamId === currentUser.teamId))
              .map(e => e.id)
          );
          if (assignedEmpIds.size > 0 && !assignedEmpIds.has(rec.employeeId) && rec.employeeId !== currentUser.id) {
            return false;
          }
        }
      }
    }

    const q = activeSearch.trim().toLowerCase();
    const matchesSearch = !q ||
      (emp.nameAr && emp.nameAr.toLowerCase().includes(q)) || 
      (emp.nameEn && emp.nameEn.toLowerCase().includes(q)) || 
      (emp.code && emp.code.toLowerCase().includes(q)) ||
      (emp.department && emp.department.toLowerCase().includes(q));

    const matchesDept = selectedDept === 'all' || emp.department === selectedDept;
    const matchesStatus = selectedStatus === 'all' || rec.status === selectedStatus;
    const matchesMonth = selectedMonth === 'all' || rec.date.startsWith(selectedMonth);
    const matchesDate = !selectedDate || rec.date === selectedDate;

    return matchesSearch && matchesDept && matchesStatus && matchesMonth && matchesDate;
  }).sort((a, b) => {
    // Sort by date descending
    if (a.date !== b.date) {
      return b.date.localeCompare(a.date);
    }

    const getRank = (rec: AttendanceRecord) => {
      if (rec.checkIn) return 1;
      if (rec.status === 'on_leave') return 2;
      return 3;
    };

    const rankA = getRank(a);
    const rankB = getRank(b);

    if (rankA !== rankB) return rankA - rankB;

    if (a.checkIn && b.checkIn) {
      return a.checkIn.localeCompare(b.checkIn);
    }

    return 0;
  });

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6 animate-fade-in">
      {/* Header & Control Bar */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2.5 flex-wrap">
            <span>{lang === 'ar' ? 'سجل الحضور اليومي والورديات' : 'Attendance & Shift Log'}</span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#0d2240] text-white text-xs font-bold border border-blue-900 shadow-sm shrink-0" dir="ltr">
              <img src="logo.png" alt="Tech Source" className="w-4 h-4 object-contain bg-white rounded-full p-0.5" onError={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }} />
              <span>TECH SOURCE GDS</span>
            </span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            {lang === 'ar' ? 'عرض السجلات اليومية، احتساب التوقيتات بصيغة 12 ساعة، والتسجيل اليدوي لليدر' : 'Manage attendance logs, 12H formats & leader manual entry'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {isLeader && onDeleteFutureRecords && (
            <button
              onClick={onDeleteFutureRecords}
              className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold text-xs transition border border-amber-200 shadow-xs"
              title={lang === 'ar' ? 'حذف أي سجلات حضور ذات تواريخ مستقبلية بعد اليوم' : 'Delete future attendance records'}
            >
              <Trash2 className="w-4 h-4 text-amber-600" />
              <span>{lang === 'ar' ? 'حذف سجلات الحضور المستقبلية' : 'Delete Future Attendance Records'}</span>
            </button>
          )}

          {isLeader && onClearTodayRecords && (
            <button
              onClick={() => {
                const targetDate = selectedDate || new Date().toISOString().split('T')[0];
                if (window.confirm(lang === 'ar' ? `هل أنت تأكد من مسح جميع سجلات الحضور لتاريخ (${targetDate})؟` : `Clear all attendance records for (${targetDate})?`)) {
                  onClearTodayRecords(targetDate);
                }
              }}
              className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs transition border border-rose-200"
              title={lang === 'ar' ? 'مسح كل سجلات الحضور لتاريخ اليوم' : 'Clear attendance records for date'}
            >
              <Trash2 className="w-4 h-4 text-rose-600" />
              <span>{lang === 'ar' ? 'مسح سجل اليوم' : 'Clear Today Log'}</span>
            </button>
          )}

          {isLeader && (
            <>
              <button
                type="button"
                onClick={() => openCreateWeekendModal()}
                className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 active:scale-95 text-white font-bold text-xs shadow transition border border-amber-700 cursor-pointer select-none"
                title={lang === 'ar' ? 'إضافة عطلة أسبوعية يدوية (مانيوال) لموظف محدد' : 'Add manual weekend for employee'}
              >
                <span className="text-sm">🏖️</span>
                <span>{lang === 'ar' ? 'إضافة عطلة أسبوعية (مانيوال)' : 'Add Weekend (Manual)'}</span>
              </button>

              <button
                type="button"
                onClick={openCreateModal}
                className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-[#0d2240] hover:bg-[#153460] active:scale-95 text-white font-bold text-xs shadow transition border border-blue-900 cursor-pointer select-none"
              >
                <Plus className="w-4 h-4 text-emerald-400" />
                <span>{lang === 'ar' ? 'تسجيل يدوي (يوم)' : 'Single Record'}</span>
              </button>

              <button
                type="button"
                onClick={() => setShowBulkModal(true)}
                className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 active:scale-95 text-white font-bold text-xs shadow transition border border-emerald-800 cursor-pointer select-none"
              >
                <Users className="w-4 h-4 text-white" />
                <span>{lang === 'ar' ? 'تسجيل حضور جماعي (إجمالي الأيام)' : 'Bulk Manual Entry'}</span>
              </button>
            </>
          )}

          <button
            onClick={onExportCSV}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow transition"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            <span>{lang === 'ar' ? 'تصدير تقرير (CSV)' : 'Export CSV Report'}</span>
          </button>
        </div>
      </div>
      {/* Filters Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {/* Search */}
        <div className="relative">
          <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={lang === 'ar' ? 'بحث باسم الموظف أو الكود (EMP001)...' : 'Search employee...'}
            className="w-full text-xs pr-9 pl-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 font-sans"
          />
        </div>

        {/* Department Filter */}
        <div>
          <select
            value={selectedDept}
            onChange={(e) => setSelectedDept(e.target.value)}
            className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium font-sans"
          >
            <option value="all">{lang === 'ar' ? 'جميع الأقسام' : 'All Departments'}</option>
            <option value="CX">CX</option>
            <option value="E-Commerce">E-Commerce</option>
            <option value="Quality">Quality</option>
          </select>
        </div>

        {/* Status Filter */}
        <div>
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium font-sans"
          >
            <option value="all">{lang === 'ar' ? 'جميع الحالات' : 'All Statuses'}</option>
            <option value="on_time">حاضر (في الوقت)</option>
            <option value="late">متأخر (بعد 09:00 AM)</option>
            <option value="early_leave">انصراف مبكر</option>
            <option value="overtime">ساعات إضافية</option>
            <option value="weekend">عطلة أسبوعية 🏖️</option>
            <option value="absent">غائب</option>
            <option value="on_leave">في إجازة</option>
          </select>
        </div>

        {/* Month Filter */}
        <div>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium font-sans"
          >
            <option value="all">{lang === 'ar' ? 'جميع الشهور 📅' : 'All Months'}</option>
            <option value="2026-08">أغسطس 2026 (الشهر الحالي)</option>
            <option value="2026-07">يوليو 2026</option>
            <option value="2026-06">يونيو 2026</option>
            <option value="2026-05">مايو 2026</option>
            <option value="2026-04">أبريل 2026</option>
            <option value="2026-03">مارس 2026</option>
            <option value="2026-02">فبراير 2026</option>
            <option value="2026-01">يناير 2026</option>
          </select>
        </div>

        {/* Date Filter */}
        <div className="relative">
          <Calendar className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-full text-xs pr-9 pl-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
          />
        </div>
      </div>

      {/* Main Records Table Card */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead>
              <tr className="bg-[#0d2240] text-white font-bold border-b border-blue-900 whitespace-nowrap">
                <th className="py-4 px-4 whitespace-nowrap">{lang === 'ar' ? 'التاريخ' : 'Date'}</th>
                <th className="py-4 px-4 whitespace-nowrap">{lang === 'ar' ? 'الموظف' : 'Employee'}</th>
                <th className="py-4 px-4 whitespace-nowrap">{lang === 'ar' ? 'القسم' : 'Department'}</th>
                <th className="py-4 px-4 whitespace-nowrap">{lang === 'ar' ? 'وقت الحضور (12H)' : 'Check-In'}</th>
                <th className="py-4 px-4 whitespace-nowrap">{lang === 'ar' ? 'وقت الانصراف (12H)' : 'Check-Out'}</th>
                <th className="py-4 px-4 whitespace-nowrap">{lang === 'ar' ? 'ساعات العمل' : 'Worked Hrs'}</th>
                <th className="py-4 px-4 whitespace-nowrap">{lang === 'ar' ? 'التأخير (بعد 9AM)' : 'Late Time'}</th>
                <th className="py-4 px-4 whitespace-nowrap">{lang === 'ar' ? 'الحالة' : 'Status'}</th>
                {isLeader && <th className="py-4 px-4 text-center whitespace-nowrap">{lang === 'ar' ? 'إجراءات الليدر' : 'Actions'}</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRecords.length > 0 ? (
                filteredRecords.map((rec) => {
                  const emp = employees.find(e => e.id === rec.employeeId);
                  if (!emp) return null;
                  const isBreakActive = Boolean(rec.breakStart && !rec.breakEnd);

                  return (
                    <tr key={rec.id} className={`hover:bg-slate-50/80 transition-colors ${isBreakActive ? 'bg-amber-50/40' : ''}`}>
                      <td className="py-3.5 px-4 font-mono font-semibold text-slate-700">{toWesternDigits(rec.date)}</td>
                      <td className="py-3.5 px-4">
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
                      {(() => {
                        const matchingApprovedPerm = leaveRequests.find(
                          l => l.employeeId === rec.employeeId && l.status === 'approved' && l.type === 'permission' && rec.date >= l.startDate && rec.date <= l.endDate
                        );

                        const effectiveLateMins = matchingApprovedPerm ? 0 : rec.lateMinutes;
                        const effectiveLateSecs = matchingApprovedPerm ? 0 : rec.lateSeconds;

                        let effectiveStatus = rec.status;
                        if (rec.checkIn && (effectiveStatus === 'absent' || !effectiveStatus)) {
                          if (rec.checkOut) {
                            effectiveStatus = (effectiveLateMins > 0) ? 'late' : 'on_time';
                          } else {
                            effectiveStatus = (effectiveLateMins > 0) ? 'late' : 'in_progress';
                          }
                        }
                        if (matchingApprovedPerm) {
                          if (rec.checkIn) {
                            effectiveStatus = rec.checkOut ? 'on_time' : 'in_progress';
                          } else {
                            effectiveStatus = 'on_leave';
                          }
                        }

                        return (
                          <>
                            <td className="py-3.5 px-4 text-slate-600 font-medium">{emp.department}</td>
                            <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                              {rec.checkIn ? formatTime(rec.checkIn, lang) : '--:--'}
                            </td>
                            <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                              {rec.checkOut ? formatTime(rec.checkOut, lang) : '--:--'}
                            </td>
                            <td className="py-3.5 px-4 font-mono font-bold text-emerald-700">
                              {rec.checkOut ? formatHoursToHHMM(rec.workHours) : '--'}
                            </td>
                            <td className="py-3.5 px-4 text-[11px]">
                              {effectiveLateMins > 0 ? (
                                <span className="text-amber-800 bg-amber-100 px-2 py-0.5 rounded font-bold font-mono inline-block">
                                  +{toWesternDigits(effectiveLateMins)}د {effectiveLateSecs ? `${toWesternDigits(effectiveLateSecs)}ث` : ''}
                                </span>
                              ) : (
                                <span className="text-slate-400 font-mono">-</span>
                              )}
                            </td>
                            <td className="py-3.5 px-4">
                              <div className="flex flex-col gap-1">
                                {(() => {
                                  if (matchingApprovedPerm) {
                                    if (rec.checkIn) {
                                      return (
                                        <span className="inline-block px-2.5 py-1 rounded-full text-[10px] font-bold border bg-sky-50 text-sky-800 border-sky-200">
                                          {rec.checkOut 
                                            ? (lang === 'ar' ? 'حاضر (إذن معتمد ⏱️)' : 'On Time (Permission)')
                                            : (lang === 'ar' ? 'قيد العمل (إذن معتمد ⏱️)' : 'Clocked In (Permission)')
                                          }
                                        </span>
                                      );
                                    } else {
                                      return (
                                        <span className="inline-block px-2.5 py-1 rounded-full text-[10px] font-bold border bg-amber-50 text-amber-800 border-amber-200">
                                          {lang === 'ar' ? 'إذن استئذان ⏱️' : 'Permission Approved ⏱️'}
                                        </span>
                                      );
                                    }
                                  }

                                  let leaveTypeLabel = '';
                                  if (effectiveStatus === 'on_leave') {
                                    const matchingLeave = leaveRequests.find(
                                      l => l.employeeId === rec.employeeId && (l.status === 'approved' || l.status === 'pending') && rec.date >= l.startDate && rec.date <= l.endDate
                                    );
                                    const lType = rec.leaveType || matchingLeave?.type;
                                    leaveTypeLabel = getLeaveTypeLabel(lType, lang, rec.notes);
                                  }

                                  if (isWeekend(rec.date) && !rec.checkIn && effectiveStatus !== 'on_leave') {
                                    return (
                                      <span className="inline-block px-2.5 py-1 rounded-full text-[10px] font-bold border bg-emerald-50 text-emerald-800 border-emerald-300">
                                        🏖️ {lang === 'ar' ? 'عطلة أسبوعية' : 'Weekend Holiday'}
                                      </span>
                                    );
                                  }

                                  return (
                                    <span className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-bold border ${getStatusBadgeStyle(effectiveStatus)}`}>
                                      {effectiveStatus === 'on_leave'
                                        ? `${leaveTypeLabel} 🌴`
                                        : getStatusText(effectiveStatus, lang, rec.leaveType, rec.notes)}
                                    </span>
                                  );
                                })()}
                                {isBreakActive && (
                                  <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-amber-900 bg-amber-200/80 px-2.5 py-1 rounded-full border border-amber-300">
                                    <span>في استراحة:</span>
                                    <BreakTimer breakStart={rec.breakStart} />
                                  </span>
                                )}
                              </div>
                            </td>
                          </>
                        );
                      })()}
                      {isLeader && (
                        <td className="py-3.5 px-4 text-center">
                          <div className="flex items-center justify-center gap-1.5 flex-wrap">
                            {rec.isExcused ? (
                              <button
                                onClick={() => handleOpenExcuseModal(rec)}
                                className="px-2 py-1 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-800 text-[10px] font-bold border border-emerald-300 transition flex items-center gap-1 shrink-0 cursor-pointer"
                                title={rec.excusedReason ? `سبب الإعفاء: ${rec.excusedReason}` : 'معفى من الخصم'}
                              >
                                <ShieldCheck className="w-3 h-3 text-emerald-600" />
                                <span>{lang === 'ar' ? 'معفى من الخصم 🛡️' : 'Excused'}</span>
                              </button>
                            ) : (rec.lateMinutes > 0 || rec.status === 'absent') ? (
                              <button
                                onClick={() => handleOpenExcuseModal(rec)}
                                className="px-2 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-bold shadow transition flex items-center gap-1 shrink-0 cursor-pointer"
                                title={lang === 'ar' ? 'إلغاء الخصم والجزاء المالي عن الموظف لهذا اليوم' : 'Excuse Penalty'}
                              >
                                <ShieldAlert className="w-3 h-3" />
                                <span>{lang === 'ar' ? 'إلغاء الخصم 🛡️' : 'Excuse Penalty'}</span>
                              </button>
                            ) : null}
                            {rec.checkOut && (
                              <button
                                onClick={() => handleCancelCheckOut(rec)}
                                className="px-2 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-bold shadow transition flex items-center gap-1 shrink-0"
                                title={lang === 'ar' ? 'إلغاء الانصراف الخاطئ وإعادة الموظف كـ (قيد العمل)' : 'Undo Accidental Check-Out'}
                              >
                                <RotateCcw className="w-3 h-3" />
                                <span>{lang === 'ar' ? 'إلغاء انصراف خاطئ' : 'Undo Check-Out'}</span>
                              </button>
                            )}
                            {isBreakActive && onForceEndBreak && (
                              <button
                                onClick={() => onForceEndBreak(emp.id)}
                                className="px-2 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-bold shadow transition flex items-center gap-1"
                                title="إرجاع الموظف من الاستراحة"
                              >
                                <ShieldAlert className="w-3 h-3" />
                                <span>{lang === 'ar' ? 'إرجاع من الاستراحة' : 'Force End Break'}</span>
                              </button>
                            )}
                            <button
                              onClick={() => openEditModal(rec)}
                              className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                              title="تعديل السجل"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            {onDeleteRecord && (
                              <button
                                onClick={() => {
                                  if (window.confirm(lang === 'ar' ? 'هل أنت تأكد من حذف هذا السجل؟ (سيتم إلغاء الإجازة واسترجاع رصيد الموظف تلقائياً)' : 'Delete record?')) {
                                    onDeleteRecord(rec.id);
                                  }
                                }}
                                className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 transition-colors"
                                title="حذف السجل"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={isLeader ? 9 : 8} className="py-12 text-center text-slate-400">
                    <AlertCircle className="w-10 h-10 mx-auto mb-2 opacity-40" />
                    <p className="font-semibold">{lang === 'ar' ? 'لا توجد سجلات تطابق البحث المحدد' : 'No attendance records found'}</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Manual Punch Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-3xl p-6 shadow-2xl border border-slate-200 space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-lg">
                {editingRecord 
                  ? (lang === 'ar' ? 'تعديل سجل حضور الموظف' : 'Edit Attendance Record') 
                  : (lang === 'ar' ? 'تسجيل حضور يدوي بواسطة التيم ليدر' : 'Leader Manual Punch Record')}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveForm} className="space-y-4 text-xs font-sans">
              {/* Record Type Selector */}
              <div>
                <label className="block font-bold text-slate-700 mb-1.5">{lang === 'ar' ? 'نوع السجل / حالة اليوم' : 'Record Type / Day Status'}</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormRecordType('attendance')}
                    className={`px-3 py-2 rounded-xl font-bold text-xs border flex items-center justify-center gap-1.5 transition ${formRecordType === 'attendance' ? 'bg-[#0d2240] text-white border-blue-900 shadow-xs' : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border-slate-200'}`}
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>{lang === 'ar' ? 'حضور وانصراف' : 'Attendance'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFormRecordType('weekend');
                      if (!formNotes) setFormNotes(lang === 'ar' ? 'عطلة أسبوعية يدوية (مانيوال) معتمدة بواسطة التيم ليدر 🏖️' : 'Manual weekly weekend holiday');
                    }}
                    className={`px-3 py-2 rounded-xl font-bold text-xs border flex items-center justify-center gap-1.5 transition ${formRecordType === 'weekend' ? 'bg-amber-600 text-white border-amber-700 shadow-xs' : 'bg-amber-50 text-amber-900 hover:bg-amber-100 border-amber-200'}`}
                  >
                    <span>🏖️</span>
                    <span>{lang === 'ar' ? 'عطلة أسبوعية' : 'Weekend'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFormRecordType('on_leave');
                      if (!formNotes) setFormNotes(lang === 'ar' ? 'إجازة اعتيادية معتمدة 🌴' : 'Annual leave');
                    }}
                    className={`px-3 py-2 rounded-xl font-bold text-xs border flex items-center justify-center gap-1.5 transition ${formRecordType === 'on_leave' ? 'bg-sky-600 text-white border-sky-700 shadow-xs' : 'bg-sky-50 text-sky-900 hover:bg-sky-100 border-sky-200'}`}
                  >
                    <Coffee className="w-3.5 h-3.5" />
                    <span>{lang === 'ar' ? 'إجازة اعتيادية' : 'Leave'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFormRecordType('absent');
                      if (!formNotes) setFormNotes(lang === 'ar' ? 'غياب بدون إذن ❌' : 'Absent');
                    }}
                    className={`px-3 py-2 rounded-xl font-bold text-xs border flex items-center justify-center gap-1.5 transition ${formRecordType === 'absent' ? 'bg-rose-600 text-white border-rose-700 shadow-xs' : 'bg-rose-50 text-rose-900 hover:bg-rose-100 border-rose-200'}`}
                  >
                    <ShieldAlert className="w-3.5 h-3.5" />
                    <span>{lang === 'ar' ? 'غياب' : 'Absent'}</span>
                  </button>
                </div>
              </div>

              {/* Select Employee */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">{lang === 'ar' ? 'اختيار الموظف' : 'Select Employee'}</label>
                <select
                  value={formEmpId}
                  onChange={(e) => setFormEmpId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 font-medium"
                  required
                >
                  {employees.map(e => (
                    <option key={e.id} value={e.id}>
                      {e.nameAr} ({e.code}) - {e.department}
                    </option>
                  ))}
                </select>
              </div>

              {/* Date */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">{lang === 'ar' ? 'التاريخ' : 'Date'}</label>
                <input
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 font-mono"
                  required
                />
              </div>

              {/* Weekend Mode Notice */}
              {formRecordType === 'weekend' && (
                <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-300 text-amber-950 flex items-start gap-2.5 shadow-xs">
                  <span className="text-xl shrink-0">🏖️</span>
                  <div className="text-xs">
                    <span className="font-extrabold block text-amber-900">{lang === 'ar' ? 'إضافة عطلة أسبوعية يدوية (Weekend)' : 'Manual Weekend Holiday'}</span>
                    <span className="text-amber-800 leading-relaxed block mt-0.5">
                      {lang === 'ar' 
                        ? 'سيتم تسجيل هذا اليوم كعطلة أسبوعية معتمدة للموظف، ولن يتم احتساب أي غياب أو تأخير أو خصومات مالية عنه في التقرير.' 
                        : 'This date will be marked as an approved weekly weekend off-day without any late deductions or absence.'}
                    </span>
                  </div>
                </div>
              )}

              {/* On Leave Mode Notice */}
              {formRecordType === 'on_leave' && (
                <div className="p-3.5 rounded-2xl bg-sky-50 border border-sky-300 text-sky-950 flex items-start gap-2.5 shadow-xs">
                  <span className="text-xl shrink-0">🌴</span>
                  <div className="text-xs">
                    <span className="font-extrabold block text-sky-900">{lang === 'ar' ? 'تسجيل إجازة اعتيادية للموظف' : 'Leave Day'}</span>
                    <span className="text-sky-800 leading-relaxed block mt-0.5">
                      {lang === 'ar' ? 'سيتم احتساب هذا اليوم كإجازة مصرحة ومقبولة للموظف.' : 'This date will be recorded as an approved leave day.'}
                    </span>
                  </div>
                </div>
              )}

              {/* Absent Mode Notice */}
              {formRecordType === 'absent' && (
                <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-300 text-rose-950 flex items-start gap-2.5 shadow-xs">
                  <span className="text-xl shrink-0">❌</span>
                  <div className="text-xs">
                    <span className="font-extrabold block text-rose-900">{lang === 'ar' ? 'تسجيل غياب بدون إذن' : 'Absent Day'}</span>
                    <span className="text-rose-800 leading-relaxed block mt-0.5">
                      {lang === 'ar' ? 'سيتم احتساب هذا اليوم كغياب للموظف وتطبيق لائحة الجزاءات والخصم.' : 'This date will be marked as absent with penalty.'}
                    </span>
                  </div>
                </div>
              )}

              {/* Check In / Out - only if attendance type */}
              {formRecordType === 'attendance' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">{lang === 'ar' ? 'وقت الدخول (Check-In)' : 'Check-In'}</label>
                      <input
                        type="time"
                        value={formCheckIn}
                        onChange={(e) => setFormCheckIn(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 font-mono"
                      />
                      <span className="text-[10px] text-slate-400 mt-0.5 block">
                        {lang === 'ar' ? 'التسجيل بعد 09:00 AM يحسب متأخراً تلقائياً' : 'After 09:00 AM marks late'}
                      </span>
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">{lang === 'ar' ? 'وقت الخروج (Check-Out)' : 'Check-Out'}</label>
                      <input
                        type="time"
                        value={formCheckOut}
                        onChange={(e) => setFormCheckOut(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 font-mono"
                      />
                      {formCheckOut && (
                        <button
                          type="button"
                          onClick={() => {
                            setFormCheckOut('');
                            setFormNotes(prev => prev ? `${prev} | إلغاء انصراف خاطئ` : 'إلغاء الانصراف الخاطئ بواسطة التيم ليدر');
                          }}
                          className="mt-1.5 text-[11px] font-bold text-amber-700 hover:text-amber-800 flex items-center gap-1 bg-amber-50 px-2 py-1 rounded-lg border border-amber-200 transition"
                        >
                          <RotateCcw className="w-3 h-3 text-amber-600" />
                          <span>{lang === 'ar' ? 'مسح وقت الانصراف (إلغاء انصراف خاطئ)' : 'Clear Check-Out (Undo)'}</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Excuse Penalty Section */}
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 space-y-2">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={formIsExcused}
                        onChange={(e) => setFormIsExcused(e.target.checked)}
                        className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500"
                      />
                      <span className="font-bold text-xs text-emerald-950 flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>{lang === 'ar' ? 'إعفاء الموظف من الخصم والجزاء المالي لهذا اليوم (بواسطة التيم ليدر 🛡️)' : 'Excuse employee from penalty/deduction'}</span>
                      </span>
                    </label>

                    {formIsExcused && (
                      <div>
                        <input
                          type="text"
                          value={formExcusedReason}
                          onChange={(e) => setFormExcusedReason(e.target.value)}
                          placeholder={lang === 'ar' ? 'سبب الإعفاء (مثال: ظرف طارئ مقبول / موافقة الليدر)' : 'Excuse Reason'}
                          className="w-full bg-white border border-emerald-300 rounded-lg px-3 py-1.5 text-xs text-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Notes */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">{lang === 'ar' ? 'ملاحظة إدارية' : 'Admin Note'}</label>
                <textarea
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder={lang === 'ar' ? 'ملاحظة إدارية أو سبب التسجيل...' : 'Admin note...'}
                  rows={2}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-4 border-t border-slate-100">
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      const emp = employees.find(e => e.id === formEmpId);
                      if (!emp) return;
                      const recordData: AttendanceRecord = {
                        id: editingRecord ? editingRecord.id : `rec-${formEmpId}-${formDate}`,
                        employeeId: formEmpId,
                        date: formDate,
                        notes: formNotes || (lang === 'ar' ? 'عطلة أسبوعية يدوية (مانيوال) معتمدة بواسطة التيم ليدر 🏖️' : 'Manual weekly weekend holiday'),
                        workHours: 0,
                        lateMinutes: 0,
                        lateSeconds: 0,
                        earlyLeaveMinutes: 0,
                        overtimeHours: 0,
                        status: 'weekend',
                        verifiedByFace: true,
                        updatedAt: new Date().toISOString(),
                      };
                      if (editingRecord) {
                        onUpdateRecord(recordData);
                      } else {
                        onAddRecord(recordData);
                      }
                      setShowModal(false);
                    }}
                    className="px-2.5 py-2 rounded-xl bg-amber-50 text-amber-900 hover:bg-amber-100 font-bold border border-amber-300 text-xs flex items-center gap-1 shadow-xs transition"
                  >
                    <span>🏖️</span>
                    <span>{lang === 'ar' ? 'تسجيل كعطلة أسبوعية' : 'Mark Weekend'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const emp = employees.find(e => e.id === formEmpId);
                      if (!emp) return;
                      const recordData: AttendanceRecord = {
                        id: editingRecord ? editingRecord.id : `rec-${Date.now()}`,
                        employeeId: formEmpId,
                        date: formDate,
                        notes: formNotes || `تم تسجيل اليوم كإجازة اعتيادية من قِبل التيم ليدر 🌴`,
                        workHours: 0,
                        lateMinutes: 0,
                        earlyLeaveMinutes: 0,
                        overtimeHours: 0,
                        status: 'on_leave',
                        leaveType: 'annual',
                        verifiedByFace: true,
                        updatedAt: new Date().toISOString(),
                      };
                      if (editingRecord) {
                        onUpdateRecord(recordData);
                      } else {
                        onAddRecord(recordData);
                      }
                      setShowModal(false);
                    }}
                    className="px-2.5 py-2 rounded-xl bg-sky-50 text-sky-800 hover:bg-sky-100 font-bold border border-sky-200 text-xs flex items-center gap-1"
                  >
                    <Coffee className="w-3.5 h-3.5 text-sky-600" />
                    <span>{lang === 'ar' ? 'تسجيل كإجازة' : 'Mark Leave'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const emp = employees.find(e => e.id === formEmpId);
                      if (!emp) return;
                      const recordData: AttendanceRecord = {
                        id: editingRecord ? editingRecord.id : `rec-${Date.now()}`,
                        employeeId: formEmpId,
                        date: formDate,
                        notes: formNotes || `تسجيل غياب عن يوم ${formDate} بواسطة التيم ليدر ❌`,
                        workHours: 0,
                        lateMinutes: 0,
                        earlyLeaveMinutes: 0,
                        overtimeHours: 0,
                        status: 'absent',
                        verifiedByFace: true,
                        updatedAt: new Date().toISOString(),
                      };
                      if (editingRecord) {
                        onUpdateRecord(recordData);
                      } else {
                        onAddRecord(recordData);
                      }
                      setShowModal(false);
                    }}
                    className="px-2.5 py-2 rounded-xl bg-rose-50 text-rose-800 hover:bg-rose-100 font-bold border border-rose-200 text-xs flex items-center gap-1"
                  >
                    <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
                    <span>{lang === 'ar' ? 'تسجيل كغياب' : 'Mark Absent'}</span>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-semibold text-xs"
                  >
                    {lang === 'ar' ? 'إلغاء' : 'Cancel'}
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2 rounded-xl bg-[#0d2240] hover:bg-[#153460] text-white font-bold shadow text-xs"
                  >
                    {lang === 'ar' ? 'حفظ السجل' : 'Save Record'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EXCUSE PENALTY MODAL */}
      {showExcuseModal && selectedRecordToExcuse && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white max-w-md w-full rounded-3xl p-6 shadow-2xl border border-slate-100 space-y-5 dir-rtl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5">
                <div className={`p-2.5 rounded-2xl ${isRestoring ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                  {isRestoring ? <ShieldAlert className="w-5 h-5" /> : <ShieldCheck className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">
                    {isRestoring
                      ? (lang === 'ar' ? 'إعادة احتساب الخصم والجزاء المالي' : 'Restore Penalty Deduction')
                      : (lang === 'ar' ? 'إلغاء الخصم والجزاء المالي (إعفاء)' : 'Waive Penalty Deduction')}
                  </h3>
                  <p className="text-xs text-slate-500 font-bold">
                    ليوم {selectedRecordToExcuse.date}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowExcuseModal(false)}
                className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {!isRestoring ? (
              <div className="space-y-2">
                <label className="block font-bold text-xs text-slate-700">
                  {lang === 'ar' ? 'سبب إلغاء الخصم (الإعفاء الإداري):' : 'Excuse Reason:'}
                </label>
                <textarea
                  rows={3}
                  value={excuseReason}
                  onChange={(e) => setExcuseReason(e.target.value)}
                  placeholder={lang === 'ar' ? 'أدخل سبب إلغاء الخصم...' : 'Enter reason...'}
                  className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 rounded-2xl p-3 text-xs font-bold text-slate-800 transition"
                />
              </div>
            ) : (
              <div className="bg-rose-50 border border-rose-200 p-4 rounded-2xl text-xs text-rose-800 font-bold">
                ⚠️ هل أنت تأكد من إلغاء الإعفاء وإعادة تطبيق الخصم والجزاء المالي على هذا الموظف؟
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowExcuseModal(false)}
                className="px-4 py-2.5 rounded-xl text-slate-600 hover:bg-slate-100 font-bold text-xs transition"
              >
                {lang === 'ar' ? 'تراجع (إلغاء)' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={handleConfirmExcuse}
                className={`px-5 py-2.5 rounded-xl text-white font-extrabold text-xs shadow-md transition flex items-center gap-1.5 cursor-pointer ${
                  isRestoring ? 'bg-rose-600 hover:bg-rose-700' : 'bg-amber-500 hover:bg-amber-600'
                }`}
              >
                {isRestoring ? (
                  <>
                    <RotateCcw className="w-4 h-4" />
                    <span>{lang === 'ar' ? 'تأكيد إعادة الخصم' : 'Confirm Restore'}</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>{lang === 'ar' ? 'تأكيد إلغاء الخصم 🛡️' : 'Confirm Excuse'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <BulkAttendanceModal
        isOpen={showBulkModal}
        onClose={() => setShowBulkModal(false)}
        employees={employees}
        shifts={shifts}
        existingRecords={records}
        leaveRequests={leaveRequests}
        onConfirmBulk={(batch) => {
          if (onBatchAddRecords) {
            onBatchAddRecords(batch);
          } else {
            batch.forEach(r => onAddRecord(r));
          }
        }}
        lang={lang}
      />
    </div>
  );
};

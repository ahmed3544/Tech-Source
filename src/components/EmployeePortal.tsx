import React, { useState, useRef } from 'react';
import { 
  User, 
  Clock, 
  LogIn, 
  LogOut, 
  CheckCircle2, 
  Palmtree, 
  Calendar, 
  FilePlus, 
  Coffee,
  Sparkles,
  RotateCcw,
  Camera,
  Upload,
  Image as ImageIcon,
  Trash2,
  X,
  Check,
  Search,
  Filter,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Info,
  Clock3,
  CheckSquare,
  Stethoscope,
  Eye,
  Flag,
  Sun,
  Moon,
  XCircle
} from 'lucide-react';
import { Employee, AttendanceRecord, LeaveRequest, Language, Shift, LeaveType, PermissionSlot } from '../types';
import { UserAvatar } from './UserAvatar';
import { WorkTimer } from './WorkTimer';
import { getStatusBadgeStyle, getStatusText, getFirstTwoNames, formatTime, formatDate, calculateRecordWorkHours, calculateLateDetails, formatSecondsToHMS, getLeaveTypeLabel, getTodayString, isWeekend, ensureSanitizedRecord, calculateWorkDaysInPeriod } from '../utils/helpers';
import { calculateMonthlyEmployeeSummary } from '../utils/penalties';
import { AvatarModal } from './AvatarModal';
import { BreakTimer } from './BreakTimer';

interface EmployeePortalProps {
  employees: Employee[];
  attendanceRecords: AttendanceRecord[];
  leaveRequests: LeaveRequest[];
  shifts: Shift[];
  onPunch: (
    employeeId: string, 
    action: 'check_in' | 'check_out' | 'break_start' | 'break_end',
    location: string,
    notes?: string
  ) => void;
  onAddLeave: (req: LeaveRequest) => void;
  onUpdateEmployee?: (emp: Employee) => void;
  onAddRecord?: (record: AttendanceRecord) => void;
  onUpdateRecord?: (record: AttendanceRecord) => void;
  onUpdateLeaveStatus?: (id: string, status: any, reviewNotes?: string) => void;
  
  lang: Language;
  currentUser?: Employee | null;
}

const PRESET_AVATARS = [
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=250&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=250&q=80',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=250&q=80',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=250&q=80',
  'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=250&q=80',
  'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=250&q=80',
];

export const EmployeePortal: React.FC<EmployeePortalProps> = ({
  employees,
  attendanceRecords,
  leaveRequests,
  shifts,
  onPunch,
  onAddLeave,
  onUpdateEmployee,
  onAddRecord,
  onUpdateRecord,
  onUpdateLeaveStatus,
  lang,
  currentUser,
}) => {
  const [currentEmpId, setCurrentEmpId] = useState<string>(() => {
    if (currentUser?.id && employees.some(e => e.id === currentUser.id)) {
      return currentUser.id;
    }
    return employees[0]?.id || '';
  });

  // Searchable Employee Switcher for Leader
  const [empSearchTerm, setEmpSearchTerm] = useState('');
  const [showEmpDropdown, setShowEmpDropdown] = useState(false);

  // Past Date Attendance / Absence Modal State for Team Leaders
  const [showPastDateModal, setShowPastDateModal] = useState(false);
  const [pastEmpId, setPastEmpId] = useState<string>('');
  const [pastDate, setPastDate] = useState<string>('2026-02-02');
  const [pastStatus, setPastStatus] = useState<'absent' | 'on_time' | 'late' | 'on_leave'>('absent');
  const [pastCheckIn, setPastCheckIn] = useState('09:00');
  const [pastCheckOut, setPastCheckOut] = useState('17:00');
  const [pastNote, setPastNote] = useState('');

  // Current active month (YYYY-MM)
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    return getTodayString().slice(0, 7); // "2026-08"
  });

  // Filter Scope: 'month' | 'week' | 'day'
  const [filterScope, setFilterScope] = useState<'month' | 'week' | 'day'>('month');
  const [selectedWeek, setSelectedWeek] = useState<'all' | 'w1' | 'w2' | 'w3' | 'w4' | 'current'>('all');
  const [selectedDay, setSelectedDay] = useState<string>('');

  // Search by Keyword / Status
  const [searchDayQuery, setSearchDayQuery] = useState('');

  // Active view tab inside dashboard
  const [activeDashboardTab, setActiveDashboardTab] = useState<'attendance' | 'penalties' | 'permissions'>('attendance');

  // Avatar Modal State
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const [customUrl, setCustomUrl] = useState('');
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Leave Modal State
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [leaveType, setLeaveType] = useState<LeaveType>('annual');
  const [leaveStartDate, setLeaveStartDate] = useState(getTodayString());
  const [leaveEndDate, setLeaveEndDate] = useState(getTodayString());
  const [leaveReason, setLeaveReason] = useState('');
  const [leaveAttachmentUrl, setLeaveAttachmentUrl] = useState<string>('');
  const [leaveAttachmentName, setLeaveAttachmentName] = useState<string>('');
  const [previewAttachment, setPreviewAttachment] = useState<{ url: string; title: string } | null>(null);

  const handleLeaveFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setLeaveAttachmentName(file.name);
      const reader = new FileReader();
      reader.onloadend = () => {
        setLeaveAttachmentUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const setDemoMedicalReport = () => {
    setLeaveAttachmentUrl('https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?auto=format&fit=crop&w=800&q=80');
    setLeaveAttachmentName('تقرير_طبي_معتمد_مستشفى_السلام.png');
  };

  // Permission Request Modal State (Max 2 permissions / month, max 2h each)
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [permissionDate, setPermissionDate] = useState(getTodayString());
  const [permissionHours, setPermissionHours] = useState<number>(2); // Default 2 hours max
  const [permissionSlot, setPermissionSlot] = useState<PermissionSlot>('first_half');
  const [permissionReason, setPermissionReason] = useState('');

  // Excuse Penalty Custom Modal State
  const [showExcuseModal, setShowExcuseModal] = useState(false);
  const [selectedPenalty, setSelectedPenalty] = useState<any | null>(null);
  const [excuseReason, setExcuseReason] = useState('');
  const [isRestoringPenalty, setIsRestoringPenalty] = useState(false);

  const isOrdinaryEmployee = currentUser?.role === 'employee';
  const targetEmpId = isOrdinaryEmployee && currentUser?.id ? currentUser.id : currentEmpId;

  const emp = employees.find(e => e.id === targetEmpId) || employees[0];
  const todayStr = getTodayString();
  const todayRecord = attendanceRecords.find(r => r.employeeId === emp?.id && r.date === todayStr);

  const isBreakActive = Boolean(todayRecord?.breakStart && !todayRecord?.breakEnd);

  // Live break counter effect (HH:MM:SS)
  const [liveBreakSeconds, setLiveBreakSeconds] = useState<number>(0);

  React.useEffect(() => {
    if (!todayRecord?.breakStart || todayRecord?.breakEnd) {
      setLiveBreakSeconds(0);
      return;
    }

    const calcElapsed = () => {
      try {
        const now = new Date();
        let str = (todayRecord.breakStart || '').trim();
        const isPM = str.toUpperCase().includes('PM');
        const isAM = str.toUpperCase().includes('AM');
        str = str.replace(/AM|PM/gi, '').trim();

        const parts = str.split(':').map(Number);
        if (parts.length >= 2) {
          let hours = parts[0] || 0;
          const minutes = parts[1] || 0;
          const seconds = parts[2] || 0;

          if (isPM && hours < 12) hours += 12;
          if (isAM && hours === 12) hours = 0;

          const startDate = new Date();
          startDate.setHours(hours, minutes, seconds, 0);

          const diffMs = now.getTime() - startDate.getTime();
          setLiveBreakSeconds(Math.max(0, Math.floor(diffMs / 1000)));
        }
      } catch {
        setLiveBreakSeconds(0);
      }
    };

    calcElapsed();
    const interval = setInterval(calcElapsed, 1000);
    return () => clearInterval(interval);
  }, [todayRecord?.breakStart, todayRecord?.breakEnd]);

  const empLeaveToday = leaveRequests.find(
    l => l.employeeId === emp?.id && l.status === 'approved' && l.type !== 'permission' && todayStr >= l.startDate && todayStr <= l.endDate
  );

  const isWeekendToday = isWeekend(todayStr);
  const isOnLeaveToday = Boolean(empLeaveToday || todayRecord?.status === 'on_leave' || isWeekendToday);

  const empPermissionToday = leaveRequests.find(
    l => l.employeeId === emp?.id && l.status === 'approved' && l.type === 'permission' && todayStr >= l.startDate && todayStr <= l.endDate
  );

  // Calculate monthly metrics & company penalties using calculation engine
  const monthlySummary = calculateMonthlyEmployeeSummary(
    emp,
    selectedMonth,
    attendanceRecords,
    leaveRequests
  );

  const handleOpenExcuseModal = (pen: any) => {
    if (!emp) return;
    const existingRecord = attendanceRecords.find(
      r => r.employeeId === emp.id && r.date === pen.date
    );

    const isCurrentlyExcused = Boolean(pen.isExcusedByLeader || existingRecord?.isExcused);

    setSelectedPenalty(pen);
    setIsRestoringPenalty(isCurrentlyExcused);
    setExcuseReason(
      existingRecord?.excusedReason ||
      pen.excusedReason ||
      (lang === 'ar' ? 'إعفاء إداري بموافقة التيم ليدر' : 'Administrative excuse by Team Leader')
    );
    setShowExcuseModal(true);
  };

  const handleConfirmExcusePenalty = () => {
    if (!emp || !selectedPenalty) return;

    const existingRecord = attendanceRecords.find(
      r => r.employeeId === emp.id && r.date === selectedPenalty.date
    );

    const defaultReason = lang === 'ar' ? 'إعفاء إداري بموافقة التيم ليدر' : 'Administrative excuse by Team Leader';
    const finalReason = excuseReason.trim() || defaultReason;
    const actorName = currentUser?.nameAr || (lang === 'ar' ? 'تيم ليدر' : 'Team Leader');

    if (isRestoringPenalty) {
      if (existingRecord) {
        onUpdateRecord?.({
          ...existingRecord,
          isExcused: false,
          excusedBy: undefined,
          excusedReason: undefined,
        });
      }
      setSuccessToast(lang === 'ar' ? 'تمت إعادة احتساب الجزاء والخصم بنجاح ↩️' : 'Penalty restored successfully');
    } else {
      if (existingRecord) {
        onUpdateRecord?.({
          ...existingRecord,
          isExcused: true,
          excusedBy: actorName,
          excusedReason: finalReason,
        });
      } else {
        onAddRecord?.({
          id: `rec-exc-${emp.id}-${selectedPenalty.date}`,
          employeeId: emp.id,
          date: selectedPenalty.date,
          status: selectedPenalty.lateMinutes > 0 ? 'late' : 'absent',
          lateMinutes: selectedPenalty.lateMinutes || 0,
          earlyLeaveMinutes: 0,
          workHours: 0,
          overtimeHours: 0,
          isExcused: true,
          excusedBy: actorName,
          excusedReason: finalReason,
        });
      }
      setSuccessToast(lang === 'ar' ? 'تم إلغاء الخصم والجزاء بنجاح 🛡️' : 'Penalty waived successfully');
    }

    setShowExcuseModal(false);
    setSelectedPenalty(null);
    setTimeout(() => setSuccessToast(null), 4000);
  };

  // Available months selector list (Current month + past months with data)
  const availableMonths = React.useMemo(() => {
    const monthsSet = new Set<string>();
    const now = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      monthsSet.add(d.toISOString().slice(0, 7));
    }
    // Include months from attendance records
    attendanceRecords.forEach(r => {
      if (r.employeeId === emp?.id && r.date && r.date.length >= 7) {
        monthsSet.add(r.date.slice(0, 7));
      }
    });
    // Include months from leave requests
    leaveRequests.forEach(l => {
      if (l.employeeId === emp?.id && l.startDate && l.startDate.length >= 7) {
        monthsSet.add(l.startDate.slice(0, 7));
      }
    });
    return Array.from(monthsSet).sort((a, b) => b.localeCompare(a));
  }, [attendanceRecords, leaveRequests, emp?.id]);

  // Filtered records for selected scope (month / week / day) & search query
  const filteredMonthRecords = React.useMemo(() => {
    if (!emp) return [];

    const todayStr = getTodayString();
    const existingMap = new Map<string, AttendanceRecord>();
    attendanceRecords
      .filter(r => r.employeeId === emp.id)
      .forEach(r => {
        existingMap.set(r.date, ensureSanitizedRecord(r));
      });

    // Populate all dates in the selected month up to today (or end of month) so weekly holidays are always mentioned
    const scopeRecords: AttendanceRecord[] = [];
    if (selectedMonth && selectedMonth.includes('-')) {
      const [year, month] = selectedMonth.split('-').map(Number);
      const daysInMonth = new Date(year, month, 0).getDate();
      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        if (dateStr > todayStr) continue; // skip future dates

        const existing = existingMap.get(dateStr);
        if (existing) {
          scopeRecords.push(existing);
        } else if (isWeekend(dateStr)) {
          scopeRecords.push({
            id: `rec-wknd-${emp.id}-${dateStr}`,
            employeeId: emp.id,
            date: dateStr,
            status: 'weekend',
            workHours: 0,
            overtimeHours: 0,
            lateMinutes: 0,
            lateSeconds: 0,
            earlyLeaveMinutes: 0,
            notes: 'عطلة أسبوعية رسمية (الجمعة والسبت)',
            updatedAt: new Date().toISOString()
          });
        }
      }
    } else {
      scopeRecords.push(...Array.from(existingMap.values()));
    }

    return scopeRecords
      .filter(r => {
        // Exclude future dates beyond today
        if (r.date > todayStr) return false;

        // 1. Scope: Month & Week Scope
        if (filterScope === 'month' || filterScope === 'week') {
          if (!r.date.startsWith(selectedMonth)) return false;
        }

        // 2. Scope: Week Specific Filter
        if (filterScope === 'week') {
          if (selectedWeek !== 'all') {
            const dayNum = parseInt(r.date.split('-')[2], 10);
            if (selectedWeek === 'w1' && !(dayNum >= 1 && dayNum <= 7)) return false;
            if (selectedWeek === 'w2' && !(dayNum >= 8 && dayNum <= 14)) return false;
            if (selectedWeek === 'w3' && !(dayNum >= 15 && dayNum <= 21)) return false;
            if (selectedWeek === 'w4' && !(dayNum >= 22 && dayNum <= 31)) return false;
            if (selectedWeek === 'current') {
              const now = new Date();
              const rDate = new Date(r.date);
              const startOfWeek = new Date(now);
              const dayOfWeek = now.getDay();
              startOfWeek.setDate(now.getDate() - dayOfWeek);
              startOfWeek.setHours(0, 0, 0, 0);
              const endOfWeek = new Date(startOfWeek);
              endOfWeek.setDate(startOfWeek.getDate() + 6);
              endOfWeek.setHours(23, 59, 59, 999);
              if (rDate < startOfWeek || rDate > endOfWeek) return false;
            }
          }
        }

        // 3. Scope: Day Specific Filter
        if (filterScope === 'day') {
          if (selectedDay) {
            if (r.date !== selectedDay) return false;
          } else if (selectedMonth) {
            if (!r.date.startsWith(selectedMonth)) return false;
          }
        }

        // 4. Keyword & Status Search Filter
        if (searchDayQuery.trim()) {
          const q = searchDayQuery.trim().toLowerCase();
          const statusText = getStatusText(r.status, lang).toLowerCase();
          const dateMatch = r.date.includes(q);
          const checkInMatch = r.checkIn && r.checkIn.toLowerCase().includes(q);
          const checkOutMatch = r.checkOut && r.checkOut.toLowerCase().includes(q);
          const weekendMatch = isWeekend(r.date) && (q.includes('عطلة') || q.includes('جمعة') || q.includes('سبت') || q.includes('week'));
          return dateMatch || Boolean(checkInMatch) || Boolean(checkOutMatch) || statusText.includes(q) || Boolean(weekendMatch);
        }

        return true;
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [attendanceRecords, emp?.id, filterScope, selectedMonth, selectedWeek, selectedDay, searchDayQuery, lang]);

  // Total work hours for the filtered view
  const filteredTotalHours = React.useMemo(() => {
    return filteredMonthRecords.reduce((sum, r) => {
      const hrs = (r.workHours && r.workHours > 0) ? r.workHours : calculateRecordWorkHours(r);
      return sum + hrs;
    }, 0);
  }, [filteredMonthRecords]);

  const handleSelfPunch = (action: 'check_in' | 'check_out' | 'break_start' | 'break_end') => {
    if (!emp) return;

    if (isWeekendToday) {
      alert(
        lang === 'ar'
          ? 'إشعار النظام 🏖️: اليوم الجمعة/السبت عطلة أسبوعية رسمية! لا يمكن تسجيل الحضور والانصراف في العطلات الأسبوعية.'
          : 'System Notice 🏖️: Today is a weekly weekend holiday (Friday/Saturday). Check-in and check-out are disabled.'
      );
      return;
    }

    if (isOnLeaveToday) {
      alert(
        lang === 'ar'
          ? 'إشعار النظام 🌴: الموظف في إجازة معتمدة اليوم، لا يمكن إجراء أي حركة (حضور / انصراف / استراحة) أثناء الإجازة.'
          : 'System Notice 🌴: You are on an approved leave today. All actions are disabled.'
      );
      return;
    }

    if (action === 'check_in' && todayRecord?.checkIn) {
      alert(
        lang === 'ar'
          ? `إشعار النظام: تم تسجيل الحضور مسبقاً لهذا اليوم الساعة (${todayRecord.checkIn}).`
          : `Check-in already registered today at (${todayRecord.checkIn}).`
      );
      return;
    }

    if (action === 'check_out' && isBreakActive) {
      alert(
        lang === 'ar'
          ? 'تنبيه هام ⚠️: يجب إنهاء الاستراحة والعودة للعمل أولاً قبل تسجيل الانصراف.'
          : 'Important Warning ⚠️: You must end your break first before checking out.'
      );
      return;
    }

    if (action === 'check_out' && todayRecord?.checkOut) {
      alert(
        lang === 'ar'
          ? `إشعار النظام: تم تسجيل الانصراف مسبقاً لهذا اليوم الساعة (${todayRecord.checkOut}).`
          : `Check-out already registered today at (${todayRecord.checkOut}).`
      );
      return;
    }

    if (action === 'check_out' && !todayRecord?.checkIn) {
      alert(
        lang === 'ar'
          ? 'إشعار النظام: يلزم تسجيل الحضور أولاً قبل إمكانية تسجيل الانصراف.'
          : 'Please check in first before checking out.'
      );
      return;
    }

    if (action === 'break_start') {
      if (!todayRecord?.checkIn) {
        alert(
          lang === 'ar'
            ? 'إشعار النظام: يلزم تسجيل الحضور أولاً قبل إمكانية بدء استراحة.'
            : 'Please check in first before starting a break.'
        );
        return;
      }
      if (todayRecord?.checkOut) {
        alert(
          lang === 'ar'
            ? 'إشعار النظام: تم تسجيل الانصراف لهذا اليوم بالفعل.'
            : 'You have already checked out today.'
        );
        return;
      }
      if (isBreakActive) {
        alert(
          lang === 'ar'
            ? 'إشعار النظام: أنت بالفعل في استراحة نشطة حالياً.'
            : 'You are already on an active break.'
        );
        return;
      }
    }

    if (action === 'break_end') {
      if (!isBreakActive) {
        alert(
          lang === 'ar'
            ? 'إشعار النظام: لا توجد استراحة نشطة حالياً لإنهائها.'
            : 'There is no active break to end.'
        );
        return;
      }
    }

    onPunch(emp.id, action, '');
  };

  const handleLeaveSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!emp || !leaveReason) return;
    onAddLeave({
      id: `leave-${Date.now()}`,
      employeeId: emp.id,
      type: leaveType,
      startDate: leaveStartDate,
      endDate: leaveEndDate,
      reason: leaveReason,
      status: 'pending',
      createdAt: todayStr,
      attachmentUrl: leaveAttachmentUrl || undefined,
      attachmentName: leaveAttachmentName || undefined,
    });
    setShowLeaveModal(false);
    setLeaveReason('');
    setLeaveAttachmentUrl('');
    setLeaveAttachmentName('');
    setSuccessToast(lang === 'ar' ? 'تم إرسال طلب الإجازة بنجاح!' : 'Leave request submitted!');
    setTimeout(() => setSuccessToast(null), 3500);
  };

  // Submit Permission Request (Capped at 2 per month, max 2h each)
  const handlePermissionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!emp || !permissionReason) return;

    if (monthlySummary.usedPermissionsCount >= 2) {
      alert(
        lang === 'ar'
          ? 'تنبيه: لقد استنفدت الحد الأقصى للأذونات هذا الشهر (إذنين فقط شهرياً كحد أقصى).'
          : 'Warning: You have reached the maximum monthly permission limit (2 permissions per month).'
      );
      return;
    }

    const cappedHours = Math.min(2, Math.max(0.5, permissionHours));

    onAddLeave({
      id: `perm-${Date.now()}`,
      employeeId: emp.id,
      type: 'permission',
      startDate: permissionDate,
      endDate: permissionDate,
      reason: permissionReason,
      status: 'pending',
      createdAt: todayStr,
      hours: cappedHours,
      permissionSlot,
    });

    setShowPermissionModal(false);
    setPermissionReason('');
    setSuccessToast(
      lang === 'ar'
        ? `تم إرسال طلب ${permissionSlot === 'first_half' ? 'إذن نصف اليوم الأول (حضور 11:00 ص)' : permissionSlot === 'second_half' ? 'إذن نصف اليوم الثاني (انصراف 03:00 م)' : 'الإذن المخصص'} بنجاح!`
        : `Permission request submitted!`
    );
    setTimeout(() => setSuccessToast(null), 3500);
  };

  // Save Past Date Record (Team Leaders can log attendance / absence / leave for past dates / past months like 2026-02-02)
  const handleSavePastRecord = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pastDate) return;

    const targetEmpId = pastEmpId || emp?.id;
    if (!targetEmpId) return;

    const targetEmp = employees.find(e => e.id === targetEmpId) || emp;
    const shift = (shifts && shifts.find(s => s.id === targetEmp?.shiftId)) || {
      id: 'shift-1',
      nameAr: 'الوردية الرسمية',
      nameEn: 'Standard Shift',
      startTime: '09:00:00',
      endTime: '17:00:00',
      gracePeriodMinutes: 0,
      workDays: [0, 1, 2, 3, 4],
    };

    let evaluatedStatus = pastStatus;
    let lateMins = 0;
    let lateSecs = 0;
    let workHrs = 0;
    let checkInStr: string | undefined = undefined;
    let checkOutStr: string | undefined = undefined;

    if (pastStatus === 'on_time' || pastStatus === 'late') {
      checkInStr = pastCheckIn ? `${pastCheckIn}:00` : '09:00:00';
      checkOutStr = pastCheckOut ? `${pastCheckOut}:00` : '17:00:00';
      const lateInfo = calculateLateDetails(checkInStr, shift.startTime || '09:00:00');
      if (lateInfo.isAbsent) {
        evaluatedStatus = 'absent';
      } else if (lateInfo.isLate) {
        evaluatedStatus = 'late';
        lateMins = lateInfo.lateMinutes;
        lateSecs = lateInfo.lateSeconds;
      } else {
        evaluatedStatus = 'on_time';
      }
      workHrs = calculateRecordWorkHours({ checkIn: checkInStr, checkOut: checkOutStr }, shift.endTime || '17:00:00');
    }

    const recordData: AttendanceRecord = {
      id: `rec-past-${targetEmpId}-${pastDate}`,
      employeeId: targetEmpId,
      date: pastDate,
      checkIn: checkInStr,
      checkOut: checkOutStr,
      status: evaluatedStatus,
      lateMinutes: lateMins,
      lateSeconds: lateSecs,
      earlyLeaveMinutes: 0,
      overtimeHours: 0,
      workHours: workHrs,
      notes: pastNote || `رصد يدوي لشهور سابقة (${pastDate}) بواسطة التيم ليدر`,
      verifiedByFace: true,
    };

    onUpdateRecord(recordData);
    setShowPastDateModal(false);

    // Switch view to selected past month
    const recordMonth = pastDate.slice(0, 7);
    setSelectedMonth(recordMonth);

    setSuccessToast(
      lang === 'ar'
        ? `تم رصد وحفظ بيانات ${pastDate} للموظف (${targetEmp?.nameAr}) بنجاح!`
        : `Historical record saved for ${pastDate}!`
    );
    setTimeout(() => setSuccessToast(null), 3500);
  };

  // Helper to update employee avatar
  const updateAvatar = (newAvatarUrl: string) => {
    if (!emp || !onUpdateEmployee) return;
    const isRemoved = newAvatarUrl === '';
    const updatedEmp: Employee = {
      ...emp,
      avatar: newAvatarUrl,
      _isPhotoRemoved: isRemoved,
    };
    onUpdateEmployee(updatedEmp);
    setShowAvatarModal(false);
    setSuccessToast(
      isRemoved
        ? (lang === 'ar' ? 'تم حذف الصورة الشخصية' : 'Profile photo removed')
        : (lang === 'ar' ? 'تم تحديث الصورة الشخصية بنجاح!' : 'Profile photo updated successfully!')
    );
    setTimeout(() => setSuccessToast(null), 3500);
  };

  // File Upload Handler with Canvas Compression
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_SIZE = 250;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_SIZE) {
            height = Math.round((height * MAX_SIZE) / width);
            width = MAX_SIZE;
          }
        } else {
          if (height > MAX_SIZE) {
            width = Math.round((width * MAX_SIZE) / height);
            height = MAX_SIZE;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          updateAvatar(dataUrl);
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  if (!emp) return null;

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6 animate-fadeIn">
      {/* Toast Notification */}
      {successToast && (
        <div className="bg-emerald-600 text-white p-4 rounded-2xl shadow-lg flex items-center justify-between gap-3 animate-fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-white" />
            <span className="font-bold text-sm">{successToast}</span>
          </div>
          <button onClick={() => setSuccessToast(null)} className="text-white hover:opacity-80">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Profile Header & Employee Switcher */}
      <div className="bg-[#0d2240] text-white p-6 rounded-3xl shadow-xl flex flex-col md:flex-row items-center justify-between gap-6 border border-slate-800">
        <div className="flex items-center gap-4">
          {/* Interactive Avatar */}
          <div className="relative group cursor-pointer" onClick={() => setShowAvatarModal(true)}>
            <UserAvatar name={emp.nameEn || emp.nameAr} code={emp.code} avatar={emp.avatar} size="xl" />
            <div className="absolute inset-0 rounded-full bg-slate-950/60 backdrop-blur-xs flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white text-[10px] font-bold">
              <Camera className="w-5 h-5 text-emerald-400 mb-0.5" />
              <span>{lang === 'ar' ? 'تغيير' : 'Edit'}</span>
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs bg-emerald-500/20 text-emerald-400 font-bold px-2.5 py-0.5 rounded-lg border border-emerald-500/30 font-mono">
                #{emp.code}
              </span>
              <h2 className="text-xl font-black tracking-wide" title={lang === 'ar' ? emp.nameAr : emp.nameEn}>
                {lang === 'ar' ? emp.nameAr : emp.nameEn}
              </h2>
            </div>
            <p className="text-xs text-slate-300 mt-1">{emp.jobTitleAr} • قسم {emp.department}</p>
            <button
              onClick={() => setShowAvatarModal(true)}
              className="mt-1.5 text-[11px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-bold underline decoration-dotted"
            >
              <Camera className="w-3.5 h-3.5 text-emerald-400" />
              <span>{lang === 'ar' ? 'تغيير الصورة الشخصية' : 'Change Profile Photo'}</span>
            </button>
          </div>
        </div>

        {/* Employee Switcher & Past Date Record Controls (for leader or admin users) */}
        {(currentUser?.role === 'admin' || currentUser?.role === 'leader') && employees.length > 1 ? (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0 w-full md:w-auto">
            {/* Searchable Employee Dropdown */}
            <div className="bg-slate-800/90 p-3 rounded-2xl border border-slate-700/80 space-y-1 relative w-full sm:w-72">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                {lang === 'ar' ? 'استعراض ورصد حساب موظف:' : 'Inspect & Manage Employee:'}
              </label>
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={empSearchTerm}
                  onChange={(e) => {
                    setEmpSearchTerm(e.target.value);
                    setShowEmpDropdown(true);
                  }}
                  onFocus={() => setShowEmpDropdown(true)}
                  placeholder={lang === 'ar' ? 'بحث بالاسم أو الكود (EMP001)...' : 'Search by name or code...'}
                  className="bg-slate-900 border border-slate-700 rounded-xl pr-8 pl-3 py-1.5 text-xs font-bold text-white w-full focus:outline-none focus:border-emerald-500 font-sans"
                />
              </div>

              {/* Autocomplete Dropdown List */}
              {showEmpDropdown && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 max-h-64 overflow-y-auto divide-y divide-slate-800">
                  {employees
                    .filter(e => {
                      if (!empSearchTerm.trim()) return true;
                      const term = empSearchTerm.trim().toLowerCase();
                      return (
                        e.nameAr.toLowerCase().includes(term) ||
                        e.nameEn.toLowerCase().includes(term) ||
                        e.code.toLowerCase().includes(term) ||
                        e.department.toLowerCase().includes(term)
                      );
                    })
                    .map(e => (
                      <button
                        key={e.id}
                        type="button"
                        onClick={() => {
                          setCurrentEmpId(e.id);
                          setEmpSearchTerm(`${e.code} - ${e.nameAr}`);
                          setShowEmpDropdown(false);
                        }}
                        className={`w-full text-right px-3 py-2 text-xs flex items-center justify-between hover:bg-slate-800 transition ${
                          e.id === currentEmpId ? 'bg-emerald-950/80 text-emerald-400 font-bold' : 'text-slate-200'
                        }`}
                      >
                        <div>
                          <span className="font-bold block text-right">{e.nameAr}</span>
                          <span className="text-[10px] text-slate-400 font-mono block text-right">#{e.code} • قسم {e.department}</span>
                        </div>
                        {e.id === currentEmpId && <Check className="w-4 h-4 text-emerald-400 shrink-0" />}
                      </button>
                    ))}
                </div>
              )}
            </div>

            {/* Quick Button for Leaders: Add Past Date Attendance / Absence (e.g. 02/02) */}
            <button
              onClick={() => {
                setPastEmpId(emp.id);
                setPastDate('2026-02-02');
                setShowPastDateModal(true);
              }}
              className="px-4 py-3 rounded-2xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs flex items-center justify-center gap-2 shadow-md transition shrink-0 cursor-pointer"
            >
              <Calendar className="w-4 h-4 text-slate-950" />
              <span>{lang === 'ar' ? 'رصيد غياب / دوام تاريخ سابق 📅' : 'Log Past Date Record 📅'}</span>
            </button>
          </div>
        ) : (
          /* Privacy badge for logged in employee */
          <div className="bg-slate-800/80 border border-slate-700/70 p-3.5 rounded-2xl flex items-center gap-2.5 shrink-0">
            <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
            <div className="text-right">
              <span className="text-xs font-bold text-white block">
                {lang === 'ar' ? 'حساب الموظف المحمي 🔒' : 'Protected Employee Account 🔒'}
              </span>
              <span className="text-[10px] text-slate-400">
                {lang === 'ar' ? 'سجلات الدوام محمية ومخصصة للموظف' : 'Protected private account records'}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Main Punch Pad Card */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div>
            <h3 className="font-bold text-slate-900 text-lg">
              {lang === 'ar' ? 'تسجيل الحضور والانصراف المباشر' : 'Self Attendance Punch'}
            </h3>
            <p className="text-xs text-slate-500">
              {lang === 'ar' ? 'التسجيل الإلكتروني المعتمد لبيانات الدوام اليومية' : 'Authorized digital daily attendance records'}
            </p>
          </div>

          <div className="text-right">
            <span className="text-[10px] text-slate-400 uppercase font-bold">{lang === 'ar' ? 'حالة الدوام اليومي' : 'Today Status'}</span>
            <div className="text-xs font-bold mt-0.5">
              {empLeaveToday ? (
                <span className="text-teal-800 bg-teal-100 px-3 py-1 rounded-full border border-teal-300 font-bold flex items-center gap-1.5 inline-flex">
                  <Palmtree className="w-3.5 h-3.5 text-teal-600" />
                  <span>{getLeaveTypeLabel(empLeaveToday.type, lang)} (معتمدة 🌴)</span>
                </span>
              ) : empPermissionToday && !todayRecord?.checkIn ? (
                <span className="text-sky-800 bg-sky-100 px-3 py-1 rounded-full border border-sky-300 font-bold flex items-center gap-1.5 inline-flex">
                  <Clock className="w-3.5 h-3.5 text-sky-600" />
                  <span>{lang === 'ar' ? 'إذن استئذان (معتمد ⏱️ - الحضور متاح)' : 'Permission Active (Check-in Allowed)'}</span>
                </span>
              ) : isBreakActive ? (
                <span className="text-amber-800 bg-amber-100 px-3 py-1 rounded-full border border-amber-300 font-extrabold flex items-center gap-1.5 inline-flex">
                  <Coffee className="w-3.5 h-3.5 text-amber-600 animate-spin" />
                  <span>{lang === 'ar' ? `في استراحة (${formatTime(todayRecord?.breakStart, lang)})` : `On Break (${formatTime(todayRecord?.breakStart, lang)})`}</span>
                </span>
              ) : todayRecord?.checkIn && !todayRecord?.checkOut ? (
                <span className="text-emerald-800 bg-emerald-100 px-3 py-1 rounded-full border border-emerald-300 font-bold inline-flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                  <span>حاضر ({formatTime(todayRecord.checkIn, lang)})</span>
                  <WorkTimer checkIn={todayRecord.checkIn} checkOut={todayRecord.checkOut} breakStart={todayRecord.breakStart} breakEnd={todayRecord.breakEnd} showIcon={false} className="text-emerald-900 font-mono text-xs border-r border-emerald-300 pr-1.5 mr-1" />
                </span>
              ) : todayRecord?.checkOut ? (
                <span className="text-slate-700 bg-slate-100 px-3 py-1 rounded-full border border-slate-200">تم الانصراف ({formatTime(todayRecord.checkOut, lang)})</span>
              ) : (
                <span className="text-amber-700 bg-amber-100 px-3 py-1 rounded-full border border-amber-200">لم يتم التسجيل</span>
              )}
            </div>
          </div>
        </div>

        {/* Live Work Timer Widget when present */}
        {todayRecord?.checkIn && !todayRecord?.checkOut && (
          <div className="p-4 rounded-2xl bg-emerald-500/10 border-2 border-emerald-500/30 space-y-2 animate-pulse">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-emerald-950 font-bold text-xs">
                <Clock className="w-4 h-4 text-emerald-600 animate-spin" />
                <span>{lang === 'ar' ? 'عداد وقت الحضور المباشر (تتبع مباشر HH:MM:SS)' : 'Live Attendance Work Timer'}</span>
              </div>
              <span className="text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-900 px-2 py-0.5 rounded border border-emerald-500/30">
                LIVE WORKING ⏱️
              </span>
            </div>

            <div className="flex items-center justify-between bg-white/90 p-3 rounded-xl border border-emerald-200">
              <div>
                <span className="text-[10px] text-slate-500 block font-semibold">
                  {lang === 'ar' ? 'وقت تسجيل الحضور:' : 'Check-In Time:'}
                </span>
                <span className="font-mono text-xs font-bold text-slate-900">
                  {formatTime(todayRecord.checkIn, lang)}
                </span>
              </div>

              <div className="text-right">
                <span className="text-[10px] text-emerald-800 block font-bold">
                  {lang === 'ar' ? 'مدة التواجد بالحضور:' : 'Live Elapsed Duration:'}
                </span>
                <WorkTimer variant="box" shift={shifts.find(s => s.id === (emp?.shiftId || 'default'))} checkIn={todayRecord.checkIn} checkOut={todayRecord.checkOut} breakStart={todayRecord.breakStart} breakEnd={todayRecord.breakEnd} />
              </div>
            </div>
          </div>
        )}

        {/* Live Break Monitor Widget (HH:MM:SS) */}
        {isBreakActive && (
          <div className="p-4 rounded-2xl bg-amber-500/10 border-2 border-amber-500/30 space-y-2 animate-pulse">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-amber-900 font-bold text-xs">
                <Coffee className="w-4 h-4 text-amber-600 animate-spin" />
                <span>{lang === 'ar' ? 'استراحة نشطة حالياً (عداد لايف مباشر HH:MM:SS)' : 'Active Break Live Counter'}</span>
              </div>
              <span className="text-[10px] font-mono font-bold bg-amber-500/20 text-amber-900 px-2 py-0.5 rounded border border-amber-500/30">
                LIVE TICKING
              </span>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between bg-white/90 p-3 rounded-xl border border-amber-200 gap-3">
              <div>
                <span className="text-[10px] text-slate-500 block font-semibold">
                  {lang === 'ar' ? 'وقت بدء الاستراحة:' : 'Break Start Time:'}
                </span>
                <span className="font-mono text-xs font-bold text-slate-900">
                  {formatTime(todayRecord?.breakStart, lang)}
                </span>
              </div>

              <div className="text-center">
                <span className="text-[10px] text-amber-800 block font-bold">
                  {lang === 'ar' ? 'المدة المنقضية (س:د:ث)' : 'Elapsed Duration (HH:MM:SS)'}
                </span>
                <span className="font-mono text-2xl font-black text-amber-900 tracking-wider">
                  {formatSecondsToHMS(liveBreakSeconds)}
                </span>
              </div>

              <button
                type="button"
                onClick={() => handleSelfPunch('break_end')}
                className="w-full sm:w-auto px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-md transition flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Coffee className="w-4 h-4 text-emerald-100" />
                <span>{lang === 'ar' ? 'إنهاء الاستراحة والعودة للعمل ✨' : 'End Break Now ✨'}</span>
              </button>
            </div>
          </div>
        )}

        {/* Leave Notice Banner if employee is on approved leave today */}
        {empLeaveToday && (
          <div className="p-4 rounded-2xl bg-teal-500/10 border border-teal-500/30 text-teal-950 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Palmtree className="w-5 h-5 text-teal-600 shrink-0" />
              <div>
                <span className="font-bold text-slate-900 block text-sm">
                  {lang === 'ar' ? `إجازة معتمدة سارية: ${getLeaveTypeLabel(empLeaveToday.type, 'ar')}` : `Active Approved Leave: ${getLeaveTypeLabel(empLeaveToday.type, 'en')}`}
                </span>
                <span className="text-slate-600">
                  {lang === 'ar'
                    ? `الفترة: من ${empLeaveToday.startDate} إلى ${empLeaveToday.endDate}.`
                    : `Period: ${empLeaveToday.startDate} to ${empLeaveToday.endDate}.`}
                </span>
              </div>
            </div>

            {(currentUser?.role === 'leader' || currentUser?.role === 'admin') && (
              <button
                onClick={() => {
                  if (window.confirm(lang === 'ar' ? 'هل أنت متأكد من إلغاء هذه الإجازة المعتمدة واسترجاع رصيد الموظف؟' : 'Revoke approved leave?')) {
                    onUpdateLeaveStatus && onUpdateLeaveStatus(empLeaveToday.id, 'rejected', 'تم إلغاء الإجازة وتحديث الرصيد');
                  }
                }}
                className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-xs shadow transition flex items-center gap-1 shrink-0 self-end sm:self-center"
                title={lang === 'ar' ? 'إلغاء الإجازة وتحديث الرصيد' : 'Revoke approved leave'}
              >
                <XCircle className="w-3.5 h-3.5" />
                <span>{lang === 'ar' ? 'إلغاء الإجازة ↩️' : 'Revoke Leave'}</span>
              </button>
            )}
          </div>
        )}

        {/* Permission Notice Banner */}
        {empPermissionToday && !todayRecord?.checkIn && (
          <div className="p-4 rounded-2xl bg-sky-500/10 border border-sky-500/30 text-sky-950 text-xs flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-sky-600 shrink-0" />
              <div>
                <span className="font-bold text-slate-900 block text-sm">
                  {lang === 'ar' ? 'إذن استئذان معتمد اليوم ⏱️' : 'Active Approved Permission ⏱️'}
                </span>
                <span className="text-slate-600">
                  {lang === 'ar' 
                    ? 'تسجيل الحضور متاح لك في أي وقت خلال اليوم دون الحاجة لانتظار انقضاء ساعات الإذن.' 
                    : 'Check-in is available for you at any time during the day.'}
                </span>
              </div>
            </div>
            <span className="px-3 py-1 bg-sky-100 text-sky-800 font-bold rounded-xl border border-sky-200 shrink-0">
              {lang === 'ar' ? 'الحضور متاح 🟢' : 'Check-in Allowed'}
            </span>
          </div>
        )}

        {/* Quick Punch Buttons */}
        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={() => handleSelfPunch('check_in')}
            disabled={Boolean(isOnLeaveToday) || Boolean(todayRecord?.checkIn) || isBreakActive}
            className={`py-4 text-white rounded-2xl font-bold text-sm sm:text-base shadow-md transition-all flex flex-col items-center justify-center gap-1.5 ${
              isOnLeaveToday || todayRecord?.checkIn || isBreakActive
                ? 'bg-slate-200 text-slate-500 border border-slate-300 cursor-not-allowed shadow-none' 
                : 'bg-emerald-600 hover:bg-emerald-700'
            }`}
          >
            {todayRecord?.checkIn ? (
              <>
                <CheckCircle2 className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-600" />
                <span className="text-emerald-700 font-extrabold text-xs sm:text-sm">
                  {lang === 'ar' ? `تم تسجيل الحضور (${todayRecord.checkIn}) ✓` : `Checked In (${todayRecord.checkIn}) ✓`}
                </span>
                <span className="text-[10px] text-slate-500 font-normal">
                  {lang === 'ar' ? 'تم اعتماد الحضور اليومي' : 'Once per day only'}
                </span>
              </>
            ) : isOnLeaveToday ? (
              <>
                <LogIn className="w-5 h-5 sm:w-6 sm:h-6" />
                <span>{lang === 'ar' ? 'غير متاح (إجازة رسمية معتمدة)' : 'Disabled (Approved Leave)'}</span>
              </>
            ) : empPermissionToday ? (
              <>
                <LogIn className="w-5 h-5 sm:w-6 sm:h-6" />
                <span>{lang === 'ar' ? 'تسجيل حضور الآن (إذن معتمد ⏱️)' : 'Check In Now (Permission Active)'}</span>
              </>
            ) : (
              <>
                <LogIn className="w-5 h-5 sm:w-6 sm:h-6" />
                <span>{lang === 'ar' ? 'تسجيل حضور الآن' : 'Check In Now'}</span>
              </>
            )}
          </button>

          <button
            onClick={() => handleSelfPunch('check_out')}
            disabled={Boolean(isOnLeaveToday) || Boolean(todayRecord?.checkOut) || !todayRecord?.checkIn || isBreakActive}
            className={`py-4 text-white rounded-2xl font-bold text-sm sm:text-base shadow-md transition-all flex flex-col items-center justify-center gap-1.5 ${
              isOnLeaveToday || todayRecord?.checkOut || !todayRecord?.checkIn || isBreakActive
                ? 'bg-slate-200 text-slate-500 border border-slate-300 cursor-not-allowed shadow-none' 
                : 'bg-rose-600 hover:bg-rose-700'
            }`}
          >
            {todayRecord?.checkOut ? (
              <>
                <CheckCircle2 className="w-5 h-5 sm:w-6 sm:h-6 text-slate-600" />
                <span className="text-slate-700 font-extrabold text-xs sm:text-sm">
                  {lang === 'ar' ? `تم تسجيل الانصراف (${todayRecord.checkOut}) ✓` : `Checked Out (${todayRecord.checkOut}) ✓`}
                </span>
                <span className="text-[10px] text-slate-500 font-normal">
                  {lang === 'ar' ? 'تم اعتماد الانصراف اليومي' : 'Once per day only'}
                </span>
              </>
            ) : isOnLeaveToday ? (
              <>
                <LogOut className="w-5 h-5 sm:w-6 sm:h-6 opacity-40" />
                <span className="text-slate-500 text-xs sm:text-sm">
                  {lang === 'ar' ? 'غير متاح (في إجازة)' : 'Disabled (On Leave)'}
                </span>
              </>
            ) : isBreakActive ? (
              <>
                <Coffee className="w-5 h-5 sm:w-6 sm:h-6 text-amber-600 animate-bounce" />
                <span className="text-amber-800 font-extrabold text-xs sm:text-sm">
                  {lang === 'ar' ? 'أنهِ الاستراحة أولاً ⚠️' : 'End Break First ⚠️'}
                </span>
              </>
            ) : !todayRecord?.checkIn ? (
              <>
                <LogOut className="w-5 h-5 sm:w-6 sm:h-6 opacity-40" />
                <span className="text-slate-500 text-xs sm:text-sm">
                  {lang === 'ar' ? 'يلزم تسجيل الحضور أولاً' : 'Check In First'}
                </span>
              </>
            ) : (
              <>
                <LogOut className="w-5 h-5 sm:w-6 sm:h-6" />
                <span>{lang === 'ar' ? 'تسجيل انصراف الآن' : 'Check Out Now'}</span>
              </>
            )}
          </button>
        </div>

        {/* Break Controls Section */}
        <div className="flex items-center gap-3 pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={() => handleSelfPunch('break_start')}
            disabled={Boolean(isOnLeaveToday) || !todayRecord?.checkIn || Boolean(todayRecord?.checkOut) || isBreakActive}
            className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-2xl font-bold text-xs sm:text-sm transition-all ${
              isOnLeaveToday || !todayRecord?.checkIn || Boolean(todayRecord?.checkOut) || isBreakActive
                ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed opacity-60'
                : 'bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 shadow-xs'
            }`}
          >
            <Coffee className="w-4 h-4 text-amber-600" />
            <span>
              {isOnLeaveToday
                ? (lang === 'ar' ? 'الاستراحة معطلة (إجازة 🌴)' : 'Break Disabled (Leave)')
                : (lang === 'ar' ? 'بدء استراحة ☕' : 'Start Break ☕')}
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleSelfPunch('break_end')}
            disabled={Boolean(isOnLeaveToday) || !isBreakActive}
            className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-2xl font-bold text-xs sm:text-sm transition-all ${
              isOnLeaveToday || !isBreakActive
                ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed opacity-60'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-md border border-emerald-500 animate-pulse'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>{lang === 'ar' ? 'العودة من الاستراحة ✨' : 'End Break ✨'}</span>
          </button>
        </div>
      </div>

      {/* SCOPE & SEARCH FILTER CONTROL BAR (Day, Week, Month) */}
      <div className="bg-slate-900 text-white p-4 sm:p-5 rounded-3xl shadow-md space-y-4">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-emerald-400" />
            <h3 className="font-extrabold text-sm sm:text-base text-white">
              {lang === 'ar' ? 'سجل الأداء والدوام الإلكتروني للموظف' : 'Employee Attendance & Performance Dashboard'}
            </h3>
          </div>

          {/* Scope Selection Tabs (Month, Week, Day) */}
          <div className="flex items-center gap-1.5 bg-slate-800/80 p-1 rounded-2xl border border-slate-700/80 shrink-0">
            <button
              onClick={() => {
                setFilterScope('month');
                setSelectedDay('');
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                filterScope === 'month'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {lang === 'ar' ? 'شهري' : 'Monthly'}
            </button>
            <button
              onClick={() => {
                setFilterScope('week');
                setSelectedDay('');
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                filterScope === 'week'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {lang === 'ar' ? 'أسبوعي' : 'Weekly'}
            </button>
            <button
              onClick={() => {
                setFilterScope('day');
                if (!selectedDay) setSelectedDay(todayStr);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                filterScope === 'day'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {lang === 'ar' ? 'يومي' : 'Daily'}
            </button>
          </div>
        </div>

        {/* Dynamic Controls based on selected scope */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-center">
          {/* Month Selector */}
          {(filterScope === 'month' || filterScope === 'week') && (
            <div className="flex flex-col space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                {lang === 'ar' ? 'اختر الشهر:' : 'Select Month:'}
              </label>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="bg-slate-800 border border-slate-700 text-emerald-400 font-bold rounded-xl px-3 py-2 text-xs font-mono focus:outline-none focus:border-emerald-500"
              >
                {availableMonths.map(m => (
                  <option key={m} value={m}>
                    {m} ({lang === 'ar' ? 'شهر' : 'Month'})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Week Selector */}
          {filterScope === 'week' && (
            <div className="flex flex-col space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                {lang === 'ar' ? 'اختر الأسبوع:' : 'Select Week:'}
              </label>
              <select
                value={selectedWeek}
                onChange={(e) => setSelectedWeek(e.target.value as any)}
                className="bg-slate-800 border border-slate-700 text-sky-400 font-bold rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-sky-500"
              >
                <option value="all">{lang === 'ar' ? 'جميع أسابيع الشهر' : 'All Weeks'}</option>
                <option value="current">{lang === 'ar' ? 'الأسبوع الحالي (هذا الأسبوع)' : 'Current Week'}</option>
                <option value="w1">{lang === 'ar' ? 'الأسبوع الأول (الأيام 1 - 7)' : 'Week 1 (Days 1-7)'}</option>
                <option value="w2">{lang === 'ar' ? 'الأسبوع الثاني (الأيام 8 - 14)' : 'Week 2 (Days 8-14)'}</option>
                <option value="w3">{lang === 'ar' ? 'الأسبوع الثالث (الأيام 15 - 21)' : 'Week 3 (Days 15-21)'}</option>
                <option value="w4">{lang === 'ar' ? 'الأسبوع الرابع (الأيام 22 - 31)' : 'Week 4 (Days 22-31)'}</option>
              </select>
            </div>
          )}

          {/* Day Selector */}
          {filterScope === 'day' && (
            <div className="flex flex-col space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                {lang === 'ar' ? 'حدد اليوم:' : 'Select Specific Day:'}
              </label>
              <input
                type="date"
                value={selectedDay || todayStr}
                onChange={(e) => setSelectedDay(e.target.value)}
                className="bg-slate-800 border border-slate-700 text-emerald-400 font-bold rounded-xl px-3 py-1.5 text-xs font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>
          )}

          {/* Search by Status / Keyword */}
          <div className="flex flex-col space-y-1 lg:col-span-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              {lang === 'ar' ? 'البحث والاستعلام بالحالة أو التواريخ:' : 'Search by Status or Date:'}
            </label>
            <div className="relative w-full">
              <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-2.5" />
              <input
                type="text"
                placeholder={lang === 'ar' ? 'استعلام عن يوم أو حالة (مثال: حاضر، متأخر، 2026-08)...' : 'Filter by date or status (e.g. Present, Late)...'}
                value={searchDayQuery}
                onChange={(e) => setSearchDayQuery(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl pr-10 pl-4 py-2 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500 font-mono"
              />
            </div>
          </div>
        </div>

        {/* Action Buttons & Clear Filter */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800">
          <div className="flex items-center gap-2">
            {(searchDayQuery || filterScope !== 'month' || selectedWeek !== 'all' || selectedDay) && (
              <button
                onClick={() => {
                  setSearchDayQuery('');
                  setFilterScope('month');
                  setSelectedWeek('all');
                  setSelectedDay('');
                }}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-rose-300 font-bold text-xs shrink-0 flex items-center gap-1"
              >
                <X className="w-3.5 h-3.5" />
                <span>{lang === 'ar' ? 'إعادة ضبط التصفية' : 'Reset Filters'}</span>
              </button>
            )}
            <span className="text-[11px] text-slate-400 font-mono">
              {lang === 'ar' 
                ? `النتائج المعروضة: ${filteredMonthRecords.length} سجل` 
                : `Showing: ${filteredMonthRecords.length} records`}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setShowPermissionModal(true)}
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition"
            >
              <Clock3 className="w-4 h-4" />
              <span>{lang === 'ar' ? 'طلب إذن خروج (ساعتان)' : 'Request Permission'}</span>
            </button>

            <button
              onClick={() => setShowLeaveModal(true)}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-slate-700 font-bold text-xs flex items-center gap-1.5 transition"
            >
              <Palmtree className="w-4 h-4" />
              <span>{lang === 'ar' ? 'طلب إجازة رسمية' : 'Request Leave'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* KPI DASHBOARD CARDS GRID */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* CARD 1: ANNUAL LEAVE DAYS */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between space-y-3 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <div className="w-7 h-7 rounded-xl bg-emerald-50 border border-emerald-200/80 flex items-center justify-center shrink-0">
                <Palmtree className="w-4 h-4 text-emerald-600" />
              </div>
              <span>{lang === 'ar' ? 'رصيد الإجازات السنوية' : 'Annual Leave Balance'}</span>
            </span>
            <span className="text-[10px] font-mono bg-emerald-50 text-emerald-700 font-bold px-2.5 py-0.5 rounded-full border border-emerald-200">
              {monthlySummary.totalAnnualBalance} {lang === 'ar' ? 'يوم' : 'Days'}
            </span>
          </div>

          <div className="flex items-baseline justify-between pt-1">
            <div>
              <div className="text-2xl font-black text-emerald-700 font-mono tracking-tight">
                {monthlySummary.remainingAnnualDays} <span className="text-xs font-sans text-slate-500 font-normal">/ {monthlySummary.totalAnnualBalance} {lang === 'ar' ? 'متبقي' : 'Left'}</span>
              </div>
              <span className="text-[11px] text-slate-500 font-bold">{lang === 'ar' ? 'إجمالي المتبقي بالرصيد' : 'Total Remaining'}</span>
            </div>
            <div className="text-right">
              <div className="text-xs font-extrabold text-slate-700 font-mono">
                {monthlySummary.usedAnnualDaysAllTime} {lang === 'ar' ? 'يوم' : 'd'}
              </div>
              <span className="text-[10px] text-slate-400 font-medium">{lang === 'ar' ? 'مستهلك' : 'Used'}</span>
            </div>
          </div>

          {/* Breakdown: Casual 7 + Regular 8 + Sick 30 */}
          <div className="pt-2 border-t border-slate-100 grid grid-cols-3 gap-1 text-[10px]">
            <div className="bg-amber-50/90 px-1.5 py-1 rounded-xl border border-amber-200/60 text-center">
              <span className="font-bold text-amber-900 block">{lang === 'ar' ? 'عارضة' : 'Casual'}</span>
              <span className="font-mono font-bold text-amber-800 text-xs">{monthlySummary.remainingCasualDays}/{monthlySummary.casualLeaveBalance}</span>
            </div>

            <div className="bg-emerald-50/90 px-1.5 py-1 rounded-xl border border-emerald-200/60 text-center">
              <span className="font-bold text-emerald-900 block">{lang === 'ar' ? 'اعتيادي' : 'Regular'}</span>
              <span className="font-mono font-bold text-emerald-800 text-xs">{monthlySummary.remainingRegularDays}/{monthlySummary.regularLeaveBalance}</span>
            </div>

            <div className="bg-rose-50/90 px-1.5 py-1 rounded-xl border border-rose-200/60 text-center">
              <span className="font-bold text-rose-900 block">{lang === 'ar' ? 'مرضية' : 'Sick'}</span>
              <span className="font-mono font-bold text-rose-800 text-xs">{monthlySummary.remainingSickDays}/{monthlySummary.sickLeaveBalance}</span>
            </div>
          </div>
        </div>

        {/* CARD 2: MONTHLY PERMISSIONS QUOTA */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <div className="w-7 h-7 rounded-xl bg-sky-50 border border-sky-200/80 flex items-center justify-center shrink-0">
                <Clock3 className="w-4 h-4 text-sky-600" />
              </div>
              <span>{lang === 'ar' ? 'الأذونات الشهرية' : 'Monthly Permissions'}</span>
            </span>
            <span className="text-[10px] font-bold bg-sky-50 text-sky-700 px-2.5 py-0.5 rounded-full border border-sky-200">
              {lang === 'ar' ? '2 إذن / شهر' : '2 Perms/Mo'}
            </span>
          </div>

          <div className="flex items-baseline justify-between pt-1">
            <div>
              <div className="text-2xl font-black text-sky-700 font-mono tracking-tight">
                {monthlySummary.remainingPermissionsCount} <span className="text-xs font-sans text-slate-500 font-normal">/ {monthlySummary.maxPermissionsPerMonth} {lang === 'ar' ? 'متبقي' : 'Left'}</span>
              </div>
              <span className="text-[11px] text-slate-500 font-bold">{lang === 'ar' ? 'رصيد هذا الشهر' : 'Quota This Month'}</span>
            </div>
            <div className="text-right">
              <span className="text-xs font-bold text-slate-700 font-mono block">
                {monthlySummary.usedPermissionsCount} {lang === 'ar' ? 'إذن' : 'used'}
              </span>
              <span className="text-[10px] text-slate-400 font-medium">
                {monthlySummary.usedPermissionsCount >= 2 
                  ? (lang === 'ar' ? 'تم استيفاء الرصيد' : 'Quota Full')
                  : (lang === 'ar' ? 'متاح للطلب' : 'Available')}
              </span>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100">
            <button
              onClick={() => setShowPermissionModal(true)}
              disabled={monthlySummary.usedPermissionsCount >= 2}
              className={`w-full py-1.5 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                monthlySummary.usedPermissionsCount >= 2
                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                  : 'bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200'
              }`}
            >
              <Clock3 className="w-3.5 h-3.5 text-sky-600 shrink-0" />
              <span>
                {monthlySummary.usedPermissionsCount >= 2
                  ? (lang === 'ar' ? 'تم استيفاء الرصيد هذا الشهر' : 'Quota Exceeded')
                  : (lang === 'ar' ? '+ طلب إذن خروج (ساعتان)' : '+ Request 2h Permission')}
              </span>
            </button>
          </div>
        </div>

        {/* CARD 3: TOTAL WORK HOURS & STATS */}
        {(() => {
          const targetHours = filterScope === 'day' 
            ? 8 
            : filterScope === 'week' 
            ? 40 
            : (monthlySummary.expectedWorkDays > 0 ? monthlySummary.expectedWorkDays * 8 : 168);
          const completionPct = Math.min(100, Math.round((filteredTotalHours / Math.max(1, targetHours)) * 100));

          return (
            <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between space-y-3 relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <div className="w-7 h-7 rounded-xl bg-amber-50 border border-amber-200/80 flex items-center justify-center shrink-0">
                    <Clock className="w-4 h-4 text-amber-600" />
                  </div>
                  <span>
                    {filterScope === 'day' 
                      ? (lang === 'ar' ? 'ساعات العمل اليومية' : 'Daily Work Hours')
                      : filterScope === 'week'
                      ? (lang === 'ar' ? 'ساعات العمل الأسبوعية' : 'Weekly Work Hours')
                      : (lang === 'ar' ? `ساعات العمل الشهرية` : `Monthly Work Hours`)}
                  </span>
                </span>
                <span className="text-[10px] font-mono font-bold bg-amber-50 text-amber-800 px-2.5 py-0.5 rounded-full border border-amber-200">
                  {filterScope === 'day'
                    ? (lang === 'ar' ? 'المعيار: 8س' : 'Target: 8h')
                    : filterScope === 'week'
                    ? (lang === 'ar' ? 'المعيار: 40س' : 'Target: 40h')
                    : (lang === 'ar' ? `المعيار: ${targetHours}س (${monthlySummary.expectedWorkDays} يوم عمل)` : `Target: ${targetHours}h (${monthlySummary.expectedWorkDays} work days)`)}
                </span>
              </div>

              <div className="flex items-baseline justify-between pt-1">
                <div>
                  <div className="text-2xl font-black text-slate-900 font-mono tracking-tight flex items-baseline gap-1">
                    <span>{filteredTotalHours.toFixed(1)}</span>
                    <span className="text-xs font-sans text-amber-600 font-bold">{lang === 'ar' ? 'ساعة' : 'Hours'}</span>
                  </div>
                  <span className="text-[11px] text-slate-500 font-bold block mt-0.5">
                    {filterScope === 'day'
                      ? (lang === 'ar' ? 'اليوم المالي المحدد' : 'Selected Day')
                      : filterScope === 'week'
                      ? (lang === 'ar' ? 'الأسبوع المحدد' : 'Selected Week')
                      : (lang === 'ar' ? 'إجمالي الساعات التراكمية' : 'Total Work Hours')}
                  </span>
                </div>
                <div className="text-right text-[11px]">
                  <div className="font-bold text-amber-700 font-mono">
                    {filteredMonthRecords.length > 0
                      ? `${(filteredTotalHours / Math.max(1, filteredMonthRecords.filter(r => r.status !== 'absent' && r.status !== 'weekend' && r.checkIn).length)).toFixed(1)} ${lang === 'ar' ? 'س/يوم' : 'h/day'}`
                      : '0 س/يوم'}
                  </div>
                  <div className="text-slate-500 font-medium">
                    {filteredMonthRecords.filter(r => r.status !== 'absent' && r.status !== 'weekend' && r.checkIn).length} {lang === 'ar' ? 'أيام حضور' : 'Days Present'}
                  </div>
                </div>
              </div>

              {/* Work Hours Target Progress Bar */}
              <div className="pt-2 border-t border-slate-100 space-y-1">
                <div className="flex justify-between items-center text-[10px] text-slate-500 font-bold">
                  <span>{lang === 'ar' ? 'نسبة الإنجاز:' : 'Completion:'}</span>
                  <span className="font-mono text-amber-700 font-extrabold">
                    {completionPct}%
                  </span>
                </div>
                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden border border-slate-200/60">
                  <div
                    className="bg-amber-500 h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${completionPct}%`
                    }}
                  />
                </div>
              </div>
            </div>
          );
        })()}

        {/* CARD 4: COMPANY BYLAWS PENALTIES & DEDUCTIONS */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <div className="w-7 h-7 rounded-xl bg-rose-50 border border-rose-200/80 flex items-center justify-center shrink-0">
                <ShieldAlert className="w-4 h-4 text-rose-600" />
              </div>
              <span>{lang === 'ar' ? 'خصومات لائحة الشركة' : 'Company Penalties'}</span>
            </span>
            <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
              monthlySummary.penalties.length > 0
                ? 'bg-rose-50 text-rose-800 border-rose-200'
                : 'bg-emerald-50 text-emerald-800 border-emerald-200'
            }`}>
              {monthlySummary.penalties.length} {lang === 'ar' ? 'مخالفات' : 'Violations'}
            </span>
          </div>

          <div className="flex items-baseline justify-between pt-1">
            <div>
              <div className="text-2xl font-black text-rose-700 font-mono tracking-tight">
                {monthlySummary.totalDeductionDays} <span className="text-xs font-sans text-slate-500 font-normal">{lang === 'ar' ? 'أيام خصم' : 'Days Deducted'}</span>
              </div>
              <span className="text-[11px] text-slate-500 font-bold">{lang === 'ar' ? 'إجمالي أيام الخصم' : 'Total Days Deducted'}</span>
            </div>
            <div className="text-right">
              <button
                onClick={() => setActiveDashboardTab('penalties')}
                className="text-[11px] font-bold text-rose-700 hover:text-rose-800 hover:underline underline-offset-2 flex items-center gap-1"
              >
                <span>{lang === 'ar' ? 'تفاصيل الجزاءات' : 'Details'}</span>
                <span>←</span>
              </button>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] font-bold">
            <span className="text-slate-400">{lang === 'ar' ? 'حالة السجل:' : 'Log Status:'}</span>
            <span className={monthlySummary.penalties.length > 0 ? 'text-rose-600' : 'text-emerald-600'}>
              {monthlySummary.penalties.length > 0 
                ? (lang === 'ar' ? 'توجد خصومات مسجلة' : 'Penalties Recorded')
                : (lang === 'ar' ? 'السجل نظيف ✓' : 'Clean Record ✓')}
            </span>
          </div>
        </div>
      </div>

      {/* OFFICIAL PUBLIC HOLIDAYS BANNER (Calculated separately for current month) */}
      <div className="bg-gradient-to-r from-emerald-950 via-slate-900 to-teal-950 p-5 rounded-3xl text-white shadow-md flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border border-emerald-800/60">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center shrink-0 shadow-inner">
            <Flag className="w-6 h-6 text-amber-400" />
          </div>
          <div className="space-y-1">
            <h4 className="font-bold text-sm sm:text-base text-white flex items-center gap-2">
              <span>{lang === 'ar' ? 'الإجازات والعطلات الرسمية للدولة هذا الشهر' : 'Official Public Holidays This Month'}</span>
              <span className="bg-amber-400 text-slate-950 text-[11px] font-black px-2.5 py-0.5 rounded-full font-mono shadow-sm">
                {selectedMonth}
              </span>
            </h4>
            <p className="text-xs text-slate-300">
              {monthlySummary.officialHolidaysInMonthCount > 0
                ? (lang === 'ar' 
                    ? `يتضمن هذا الشهر (${monthlySummary.officialHolidaysInMonthCount}) أيام عطلات رسمية معتمدة من الدولة (مثل الأعياد الدينية والوطنية) محسوبة منفصلة وغير مخصومة من رصيدك السنوي.` 
                    : `${monthlySummary.officialHolidaysInMonthCount} official public holidays recorded this month, calculated separately.`)
                : (lang === 'ar' ? 'لا توجد عطلات رسمية من الدولة صادفة هذا الشهر المحدد.' : 'No official holidays in selected month.')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 bg-slate-800/80 px-4 py-2.5 rounded-2xl border border-slate-700/80 shrink-0 self-end md:self-auto">
          <span className="text-2xl font-black font-mono text-amber-400">
            {monthlySummary.officialHolidaysInMonthCount}
          </span>
          <span className="text-xs text-emerald-200 font-bold">
            {lang === 'ar' ? 'أيام عطلات رسمية' : 'Official Holidays'}
          </span>
        </div>
      </div>

      {/* DETAILED LOGS & TABS */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Navigation Tabs */}
        <div className="bg-slate-50 border-b border-slate-200 p-3 flex items-center gap-2 overflow-x-auto scrollbar-none">
          <button
            onClick={() => setActiveDashboardTab('attendance')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              activeDashboardTab === 'attendance'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Clock className="w-4 h-4 text-emerald-400" />
            <span>
              {lang === 'ar' 
                ? `1. سجل الحضور والدوام (${filteredMonthRecords.length})` 
                : `1. Attendance Logs (${filteredMonthRecords.length})`}
            </span>
          </button>

          <button
            onClick={() => setActiveDashboardTab('penalties')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              activeDashboardTab === 'penalties'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-200'
            }`}
          >
            <ShieldAlert className="w-4 h-4 text-rose-400" />
            <span>
              {lang === 'ar'
                ? `2. سجل الجزاءات والخصومات الإدارية (${monthlySummary.penalties.length})`
                : `2. Administrative Penalties (${monthlySummary.penalties.length})`}
            </span>
          </button>

          <button
            onClick={() => setActiveDashboardTab('permissions')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              activeDashboardTab === 'permissions'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Clock3 className="w-4 h-4 text-sky-400" />
            <span>
              {lang === 'ar'
                ? `3. سجل الأذونات والإجازات الإدارية (${leaveRequests.filter(l => l.employeeId === emp.id).length})`
                : `3. Permissions & Requests (${leaveRequests.filter(l => l.employeeId === emp.id).length})`}
            </span>
          </button>
        </div>

        {/* TAB 1: ATTENDANCE & LATENESS LOGS TABLE */}
        {activeDashboardTab === 'attendance' && (
          <div className="p-4 sm:p-6 space-y-4">
            <div className="flex items-center justify-between text-xs text-slate-500 font-bold">
              <span>
                {lang === 'ar'
                  ? `عرض سجلات الحضور ${searchDayQuery ? `- فلترة: "${searchDayQuery}"` : ''}`
                  : `Showing attendance records`}
              </span>
              <span className="font-mono text-slate-700 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
                {lang === 'ar' ? `المجموع: ${filteredMonthRecords.length} سجل` : `Total: ${filteredMonthRecords.length} records`}
              </span>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-2xl">
              <table className="w-full text-xs text-right border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-white font-bold">
                    <th className="py-3 px-4">التاريخ (Day)</th>
                    <th className="py-3 px-4 text-center">وقت الحضور (12H)</th>
                    <th className="py-3 px-4 text-center">الاستراحة (Break)</th>
                    <th className="py-3 px-4 text-center">وقت الانصراف (12H)</th>
                    <th className="py-3 px-4 text-center">ساعات العمل</th>
                    <th className="py-3 px-4 text-center">دقائق التأخير</th>
                    <th className="py-3 px-4 text-center">حالة اليوم</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredMonthRecords.length > 0 ? (
                    filteredMonthRecords.map((r) => (
                      <tr key={r.id} className={`hover:bg-slate-50 transition ${r.breakStart && !r.breakEnd ? 'bg-amber-50/40' : ''}`}>
                        <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                          {r.date}
                        </td>
                        <td className="py-3.5 px-4 text-center font-mono font-bold text-emerald-700 bg-emerald-50/40">
                          {r.checkIn ? formatTime(r.checkIn, lang) : '--:--'}
                        </td>
                        <td className="py-3.5 px-4 text-center font-mono">
                          {r.breakStart ? (
                            <div className="flex flex-col items-center justify-center gap-1">
                              <span className="text-[11px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                                {formatTime(r.breakStart, lang)} - {r.breakEnd ? formatTime(r.breakEnd, lang) : 'نشطة ⏳'}
                              </span>
                              {!r.breakEnd && (
                                <>
                                  <BreakTimer breakStart={r.breakStart} className="text-[10px] text-amber-600" />
                                  <button
                                    onClick={() => onPunch(emp.id, 'break_end', '')}
                                    className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold rounded-md shadow-xs transition flex items-center gap-1 cursor-pointer mt-0.5"
                                    title={lang === 'ar' ? 'إنهاء الاستراحة والعودة للعمل' : 'End Break'}
                                  >
                                    <Coffee className="w-3 h-3" />
                                    <span>{lang === 'ar' ? 'العودة من الاستراحة' : 'End Break'}</span>
                                  </button>
                                </>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-300">--</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-center font-mono font-bold text-rose-700 bg-rose-50/40">
                          {r.checkOut ? formatTime(r.checkOut, lang) : '--:--'}
                        </td>
                        <td className="py-3.5 px-4 text-center font-mono font-bold text-slate-800">
                          {r.workHours ? `${r.workHours.toFixed(1)} س` : '0 س'}
                        </td>
                        {(() => {
                          const matchingApprovedPerm = leaveRequests.find(
                            l => l.employeeId === r.employeeId && l.status === 'approved' && l.type === 'permission' && r.date >= l.startDate && r.date <= l.endDate
                          );
                          const effectiveLateMins = matchingApprovedPerm ? 0 : r.lateMinutes;
                          let effectiveStatus = r.status;
                          if (matchingApprovedPerm) {
                            if (r.checkIn) {
                              effectiveStatus = r.checkOut ? 'on_time' : 'in_progress';
                            } else {
                              effectiveStatus = 'on_leave';
                            }
                          }
                          return (
                            <>
                              <td className="py-3.5 px-4 text-center font-mono font-bold">
                                {effectiveLateMins > 0 ? (
                                  <span className="text-amber-700 bg-amber-100 px-2.5 py-1 rounded-full border border-amber-200">
                                    +{effectiveLateMins} دقيقة
                                  </span>
                                ) : (
                                  <span className="text-slate-400">0 دقيقة</span>
                                )}
                              </td>
                              <td className="py-3.5 px-4 text-center">
                                {matchingApprovedPerm ? (
                                  r.checkIn ? (
                                    <span className="px-3 py-1 rounded-full text-[10px] font-bold border bg-sky-50 text-sky-800 border-sky-200 inline-block">
                                      {r.checkOut ? (lang === 'ar' ? 'حاضر (إذن معتمد ⏱️)' : 'On Time (Permission)') : (lang === 'ar' ? 'قيد العمل (إذن معتمد ⏱️)' : 'Clocked In (Permission)')}
                                    </span>
                                  ) : (
                                    <span className="px-3 py-1 rounded-full text-[10px] font-bold border bg-amber-50 text-amber-800 border-amber-200 inline-block">
                                      {lang === 'ar' ? 'إذن استئذان ⏱️' : 'Permission Approved ⏱️'}
                                    </span>
                                  )
                                ) : (
                                  <span className={`px-3 py-1 rounded-full text-[10px] font-bold border ${getStatusBadgeStyle(effectiveStatus)} inline-block`}>
                                    {getStatusText(effectiveStatus, lang, r.leaveType, r.notes)}
                                  </span>
                                )}
                              </td>
                            </>
                          );
                        })()}
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-slate-400">
                        {lang === 'ar' ? 'لا توجد سجلات حضور مطابقة للتاريخ المحدد' : 'No attendance logs match your filter'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 2: COMPANY BYLAWS PENALTIES & DEDUCTIONS LEDGER */}
        {activeDashboardTab === 'penalties' && (
          <div className="p-4 sm:p-6 space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3 text-amber-950 text-xs">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="font-bold block text-sm">
                  {lang === 'ar' ? 'لائحة تنظيم العمل والجزاءات الإدارية المعتمدة:' : 'Company Regulations & Penalties:'}
                </span>
                <p className="text-amber-900 leading-relaxed">
                  تطبق الخصومات والجزاءات الإدارية آلياً وفقاً للائحـة العمل المعتمدة بحسب تكرار المخالفات والتأخيرات خلال الشهر. الأذونات الرسمية المعتمدة ترفع خصم التأخير حتى ساعتين.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-2xl">
              <table className="w-full text-xs text-right border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-white font-bold">
                    <th className="py-3 px-4">تاريخ المخالفة</th>
                    <th className="py-3 px-4">نوع التأخير / المخالفة</th>
                    <th className="py-3 px-4 text-center">دقائق التأخير</th>
                    <th className="py-3 px-4 text-center">تكرار المرة بالشهر</th>
                    <th className="py-3 px-4 text-center">الجزاء المستحق (لائحة الشركة)</th>
                    <th className="py-3 px-4 text-center">خصم أيام</th>
                    <th className="py-3 px-4 text-center">{lang === 'ar' ? 'إجراء التيم ليدر (إلغاء الخصم)' : 'Leader Actions'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {monthlySummary.penalties.length > 0 ? (
                    monthlySummary.penalties.map((pen) => (
                      <tr key={pen.id} className="hover:bg-slate-50 transition">
                        <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                          {pen.date}
                        </td>
                        <td className="py-3.5 px-4 font-bold text-slate-800">
                          {pen.titleAr}
                          {pen.hasApprovedPermission && (
                            <span className="mr-2 text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded border border-emerald-300">
                              إذن معتمد 🟢
                            </span>
                          )}
                          {pen.isExcusedByLeader && (
                            <span className="mr-2 text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded border border-emerald-300">
                              إعفاء ليدر 🛡️
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-center font-mono font-bold text-amber-700">
                          {pen.lateMinutes > 0 ? `${pen.lateMinutes} د` : '--'}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          {pen.occurrenceCount > 0 ? (
                            <span className="bg-slate-100 text-slate-800 font-bold px-2.5 py-0.5 rounded-full border border-slate-200 text-[11px]">
                              المرة {pen.occurrenceCount}
                            </span>
                          ) : '--'}
                        </td>
                        <td className="py-3.5 px-4 text-center font-bold text-slate-800">
                          {pen.penaltyDescriptionAr}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          {pen.penaltyDays > 0 ? (
                            <span className="bg-rose-100 text-rose-800 font-black px-3 py-1 rounded-full border border-rose-200 text-xs font-mono">
                              -{pen.penaltyDays} يوم
                            </span>
                          ) : (
                            <span className="bg-emerald-100 text-emerald-800 font-bold px-2.5 py-1 rounded-full border border-emerald-200 text-[10px]">
                              0 (بدون خصم)
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          {pen.isExcusedByLeader ? (
                            <div className="flex flex-col items-center gap-1">
                              <span className="bg-emerald-100 text-emerald-800 font-bold px-2.5 py-1 rounded-lg border border-emerald-300 text-[11px] flex items-center gap-1">
                                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                <span>تم إلغاء الخصم 🛡️</span>
                              </span>
                              {(currentUser?.role === 'leader' || currentUser?.role === 'admin' || !currentUser) && (
                                <button
                                  onClick={() => handleOpenExcuseModal(pen)}
                                  className="text-[10px] text-rose-600 hover:underline font-bold cursor-pointer"
                                >
                                  إرجاع الخصم ↩️
                                </button>
                              )}
                            </div>
                          ) : pen.hasApprovedPermission ? (
                            <span className="text-slate-400 font-bold text-[11px]">معفى بإذن رسمي 🟢</span>
                          ) : (
                            <button
                              onClick={() => handleOpenExcuseModal(pen)}
                              className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs shadow-sm transition flex items-center gap-1.5 mx-auto shrink-0 cursor-pointer"
                              title="إلغاء الخصم والجزاء المالي بواسطة التيم ليدر"
                            >
                              <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                              <span>إلغاء الخصم (إعفاء)</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-emerald-700 font-bold bg-emerald-50/30">
                        🎉 ممتاز! لا توجد جزاءات أو مخالفات مسجلة للموظف خلال هذا الشهر ({selectedMonth}).
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3: PERMISSIONS & LEAVES REQUESTS LOG */}
        {activeDashboardTab === 'permissions' && (
          <div className="p-4 sm:p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Clock3 className="w-4 h-4 text-sky-600" />
                <span>{lang === 'ar' ? 'سجل الطلبات والأذونات الشهرية' : 'Permission & Leave Requests Log'}</span>
              </h4>
              <button
                onClick={() => setShowPermissionModal(true)}
                disabled={monthlySummary.usedPermissionsCount >= 2}
                className="px-3.5 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:bg-slate-300 text-white font-bold text-xs transition"
              >
                {lang === 'ar' ? '+ طلب إذن جديد (ساعتين)' : '+ New Permission'}
              </button>
            </div>

            <div className="space-y-3">
              {leaveRequests.filter(l => l.employeeId === emp.id).length > 0 ? (
                leaveRequests.filter(l => l.employeeId === emp.id).map(req => {
                  return (
                    <div key={req.id} className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`px-2.5 py-0.5 rounded font-bold text-[11px] ${
                            req.type === 'permission' ? 'bg-sky-100 text-sky-800 border border-sky-300' :
                            req.type === 'annual' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' :
                            'bg-amber-100 text-amber-800 border border-amber-300'
                          }`}>
                            {req.type === 'permission' ? (
                              lang === 'ar' 
                                ? `إذن ${req.permissionSlot === 'first_half' ? 'نصف اليوم الأول 🌅 (حضور حتى 11:00 ص)' : req.permissionSlot === 'second_half' ? 'نصف اليوم الثاني 🌆 (انصراف 03:00 م)' : 'مخصص'}`
                                : `Permission (${req.permissionSlot || 'standard'})`
                            ) :
                             req.type === 'annual' ? (lang === 'ar' ? 'إجازة سنوية اعتيادية' : 'Annual Leave') :
                             req.type === 'sick' ? (lang === 'ar' ? 'إجازة مرضية' : 'Sick Leave') : (lang === 'ar' ? 'إجازة طارئة' : 'Emergency Leave')}
                          </span>
                          <span className="font-mono text-slate-500 font-bold">{req.startDate}</span>
                        </div>

                        <span className={`px-3 py-1 rounded-full text-[10px] font-bold border ${
                          req.status === 'approved' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                          req.status === 'rejected' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                          'bg-amber-50 text-amber-700 border-amber-200'
                        }`}>
                          {req.status === 'approved' ? (lang === 'ar' ? 'معتمد ومقبول 🟢' : 'Approved') :
                           req.status === 'rejected' ? (lang === 'ar' ? 'مرفوض 🔴' : 'Rejected') :
                           (lang === 'ar' ? 'قيد انتظار الاعتماد 🟡' : 'Pending')}
                        </span>
                      </div>

                      <p className="text-slate-600 bg-white p-2.5 rounded-xl border border-slate-100">
                        <strong className="text-slate-800">{lang === 'ar' ? 'السبب: ' : 'Reason: '}</strong>
                        {req.reason}
                      </p>

                      {req.attachmentUrl && (
                        <div className="bg-rose-50 border border-rose-200 rounded-xl p-2.5 flex items-center justify-between mt-2">
                          <div className="flex items-center gap-2 text-rose-950 font-bold">
                            <Stethoscope className="w-4 h-4 text-rose-600 shrink-0" />
                            <span className="text-[11px] truncate max-w-[200px]">
                              التقرير الطبي: {req.attachmentName || 'مستند_مرفق.png'}
                            </span>
                          </div>
                          <button
                            onClick={() => setPreviewAttachment({
                              url: req.attachmentUrl!,
                              title: `التقرير الطبي - ${req.startDate}`
                            })}
                            className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white font-bold text-[11px] rounded-lg transition shadow-sm flex items-center gap-1"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>معاينة المستند 👁️</span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-8 text-slate-400">
                  {lang === 'ar' ? 'لم تقم بتقديم طلبات أذونات أو إجازات بعد' : 'No permission or leave requests submitted'}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* MODAL 1: PERMISSION REQUEST MODAL (Max 2 per month, Max 2h each) */}
      {showPermissionModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl border border-slate-200 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Clock3 className="w-5 h-5 text-sky-600" />
                <h3 className="font-bold text-slate-900 text-base">
                  {lang === 'ar' ? 'طلب إذن شخصي / رسمي (ساعتين)' : 'Request Personal Permission'}
                </h3>
              </div>
              <button
                onClick={() => setShowPermissionModal(false)}
                className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quota Banner */}
            <div className="bg-sky-50 border border-sky-200 rounded-2xl p-3 text-xs text-sky-950 space-y-1">
              <div className="flex items-center justify-between font-bold">
                <span>{lang === 'ar' ? 'كوتة الأذونات الشهرية:' : 'Monthly Quota:'}</span>
                <span className="font-mono text-sky-800 bg-white px-2 py-0.5 rounded border border-sky-200">
                  {monthlySummary.usedPermissionsCount} / 2 {lang === 'ar' ? 'إذنين مستخدمين' : 'Used'}
                </span>
              </div>
              <p className="text-[11px] text-sky-800 leading-relaxed">
                {lang === 'ar'
                  ? 'لائحة الشركة تمنح كل موظف إذنين شهرياً كحد أقصى، ولا تتجاوز مدة الإذن الواحد ساعتين فقط.'
                  : 'Company rules allow 2 permissions per month, max 2 hours per permission.'}
              </p>
            </div>

            {monthlySummary.usedPermissionsCount >= 2 && (
              <div className="bg-rose-50 border border-rose-200 text-rose-800 p-3 rounded-2xl text-xs font-bold">
                ⚠️ لقد استنفدت الحد الأقصى للأذونات هذا الشهر (2/2 إذنين).
              </div>
            )}

            <form onSubmit={handlePermissionSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {lang === 'ar' ? 'تاريخ الإذن المطلوب' : 'Permission Date'}
                </label>
                <input
                  type="date"
                  required
                  value={permissionDate}
                  onChange={(e) => setPermissionDate(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 font-mono text-slate-900"
                />
              </div>

              {/* PERMISSION TIMING SLOT SELECTION (FIRST HALF vs SECOND HALF) */}
              <div>
                <label className="block font-bold text-slate-700 mb-1.5">
                  {lang === 'ar' ? 'اختيار تقسيم فترة الإذن (نصف اليوم الأول / الثاني):' : 'Permission Timing Slot:'}
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => { setPermissionSlot('first_half'); setPermissionHours(2); }}
                    className={`p-3 rounded-2xl border text-right transition flex flex-col justify-between ${
                      permissionSlot === 'first_half'
                        ? 'bg-sky-50 border-sky-500 ring-2 ring-sky-500/20 text-sky-950 font-bold'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex items-center justify-between font-bold text-xs mb-1">
                      <span className="flex items-center gap-1.5 text-amber-700">
                        <Sun className="w-4 h-4 text-amber-500 shrink-0" />
                        <span>نصف اليوم الأول 🌅</span>
                      </span>
                      {permissionSlot === 'first_half' && <CheckCircle2 className="w-4 h-4 text-sky-600 shrink-0" />}
                    </div>
                    <p className="text-[11px] text-slate-600 leading-relaxed font-normal">
                      حضور حتى الساعة 11:00 ص (ساعتان تأخير مسموح بها) 🟢 لا يُحسب تأخير ولا يُخصم من الراتب.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => { setPermissionSlot('second_half'); setPermissionHours(2); }}
                    className={`p-3 rounded-2xl border text-right transition flex flex-col justify-between ${
                      permissionSlot === 'second_half'
                        ? 'bg-sky-50 border-sky-500 ring-2 ring-sky-500/20 text-sky-950 font-bold'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex items-center justify-between font-bold text-xs mb-1">
                      <span className="flex items-center gap-1.5 text-indigo-700">
                        <Moon className="w-4 h-4 text-indigo-500 shrink-0" />
                        <span>نصف اليوم الثاني 🌆</span>
                      </span>
                      {permissionSlot === 'second_half' && <CheckCircle2 className="w-4 h-4 text-sky-600 shrink-0" />}
                    </div>
                    <p className="text-[11px] text-slate-600 leading-relaxed font-normal">
                      انصراف الساعة 03:00 م (ساعتان مبكراً مسموح بها) 🟢 يُحسب انصراف في الميعاد وبدون أي خصم.
                    </p>
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {lang === 'ar' ? 'مدة الإذن المطلوبة (أقصى حد ساعتين):' : 'Duration (Max 2h):'}
                </label>
                <select
                  value={permissionHours}
                  onChange={(e) => setPermissionHours(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 font-bold text-slate-900"
                >
                  <option value={0.5}>0.5 ساعة (30 دقيقة)</option>
                  <option value={1}>1.0 ساعة (ساعة واحدة)</option>
                  <option value={1.5}>1.5 ساعة (ساعة ونصف)</option>
                  <option value={2}>2.0 ساعة (ساعتان - أقصى حد مسموح)</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {lang === 'ar' ? 'مبررات وسبب الإذن:' : 'Reason for Permission:'}
                </label>
                <textarea
                  required
                  rows={3}
                  value={permissionReason}
                  onChange={(e) => setPermissionReason(e.target.value)}
                  placeholder={lang === 'ar' ? 'اكتب سبب طلب الإذن...' : 'State reason...'}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-900"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowPermissionModal(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-bold"
                >
                  {lang === 'ar' ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={monthlySummary.usedPermissionsCount >= 2}
                  className="px-5 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:bg-slate-300 text-white font-bold transition shadow-sm"
                >
                  {lang === 'ar' ? 'تأكيد وإرسال طلب الإذن' : 'Submit Permission'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: LEAVE REQUEST MODAL */}
      {showLeaveModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white w-full max-w-lg rounded-3xl p-6 shadow-2xl border border-slate-200 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-lg">
                {lang === 'ar' ? 'تقديم طلب إجازة رسمية' : 'Submit Leave Request'}
              </h3>
              <span className="text-xs bg-emerald-50 text-emerald-800 font-bold px-3 py-1 rounded-full border border-emerald-200 font-mono">
                {lang === 'ar' ? `الرصيد المتبقي: ${monthlySummary.remainingAnnualDays} يوم` : `Balance: ${monthlySummary.remainingAnnualDays} Days`}
              </span>
            </div>

            <form onSubmit={handleLeaveSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {lang === 'ar' ? 'نوع الإجازة' : 'Leave Type'}
                </label>
                <select
                  value={leaveType}
                  onChange={(e) => setLeaveType(e.target.value as any)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 font-bold text-slate-900"
                >
                  <option value="annual">{lang === 'ar' ? 'إجازة سنوية اعتيادية (تخصم من الرصيد)' : 'Annual Leave'}</option>
                  <option value="casual">{lang === 'ar' ? 'إجازة عارضة' : 'Casual Leave'}</option>
                  <option value="sick">{lang === 'ar' ? 'إجازة مرضية' : 'Sick Leave'}</option>
                  <option value="emergency">{lang === 'ar' ? 'إجازة طارئة' : 'Emergency Leave'}</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {lang === 'ar' ? 'تاريخ البداية' : 'Start Date'}
                  </label>
                  <input
                    type="date"
                    required
                    value={leaveStartDate}
                    onChange={(e) => setLeaveStartDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 font-mono text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {lang === 'ar' ? 'تاريخ النهاية' : 'End Date'}
                  </label>
                  <input
                    type="date"
                    required
                    value={leaveEndDate}
                    onChange={(e) => setLeaveEndDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 font-mono text-slate-900"
                  />
                </div>
              </div>

              {/* Medical Report / File Upload Area for Sick Leave */}
              {(leaveType === 'sick' || true) && (
                <div className="bg-rose-50/70 border border-rose-200 rounded-2xl p-3 space-y-2">
                  <label className="block font-bold text-rose-950 flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5">
                      <Stethoscope className="w-4 h-4 text-rose-600" />
                      <span>ارفاق صورة التقرير الطبي (اختياري للتحقق):</span>
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
                      <span>{leaveAttachmentName ? leaveAttachmentName : 'اختر صورة التقرير الطبي من جهازك'}</span>
                      <input type="file" accept="image/*,.pdf" onChange={handleLeaveFileUpload} className="hidden" />
                    </label>
                  </div>

                  {leaveAttachmentUrl && (
                    <div className="relative rounded-xl overflow-hidden border border-rose-200 max-h-32 bg-slate-900 flex items-center justify-center">
                      <img src={leaveAttachmentUrl} alt="Report Preview" className="max-h-32 object-contain" />
                      <button
                        type="button"
                        onClick={() => { setLeaveAttachmentUrl(''); setLeaveAttachmentName(''); }}
                        className="absolute top-1 right-1 bg-slate-900/80 text-white p-1 rounded-full text-[10px]"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {lang === 'ar' ? 'سبب الإجازة' : 'Reason'}
                </label>
                <textarea
                  required
                  rows={3}
                  value={leaveReason}
                  onChange={(e) => setLeaveReason(e.target.value)}
                  placeholder={lang === 'ar' ? 'اكتب مبررات الطلب...' : 'Enter reason for leave...'}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-900"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowLeaveModal(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-semibold"
                >
                  {lang === 'ar' ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition shadow-sm"
                >
                  {lang === 'ar' ? 'تأكيد وإرسال' : 'Submit Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: TEAM LEADER BACKDATED ATTENDANCE ENTRY MODAL */}
      {showPastDateModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white w-full max-w-lg rounded-3xl p-6 shadow-2xl border border-slate-200 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-emerald-600" />
                <h3 className="font-bold text-slate-900 text-base">
                  {lang === 'ar' ? 'رصد داتا/حضور تاريخ سابق لشهور عدت' : 'Log Historical Attendance Data'}
                </h3>
              </div>
              <button
                onClick={() => setShowPastDateModal(false)}
                className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-2xl p-3 text-xs leading-relaxed space-y-1">
              <span className="font-bold block">
                {lang === 'ar' ? 'صلاحيات التيم ليدر والإدارة:' : 'Leader Permissions:'}
              </span>
              <p>
                {lang === 'ar'
                  ? 'يمكن للتيم ليدر تسجيل الحضور، التأخير، الغياب، أو الإجازة لأي موظف ولأي تاريخ سابق (مثال: يوم 2 شهر 2) وسوف يظهر فوراً في سجلات الموظف وتقارير الخصومات.'
                  : 'Allows logging past attendance/absences for any employee and past month (e.g. Feb 2nd).'}
              </p>
            </div>

            <form onSubmit={handleSavePastRecord} className="space-y-4 text-xs">
              {/* Select Employee */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {lang === 'ar' ? 'اختيار الموظف' : 'Select Employee'}
                </label>
                <select
                  value={pastEmpId || emp.id}
                  onChange={(e) => setPastEmpId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 font-bold text-slate-900"
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
                <label className="block font-bold text-slate-700 mb-1">
                  {lang === 'ar' ? 'التاريخ المطلوب (أو شهر سابق مثل 2026-02-02):' : 'Select Past Date:'}
                </label>
                <input
                  type="date"
                  required
                  value={pastDate}
                  onChange={(e) => {
                    setPastDate(e.target.value);
                    if (e.target.value) {
                      const m = e.target.value.slice(0, 7);
                      setSelectedMonth(m);
                    }
                  }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 font-mono text-slate-900 font-bold"
                />
              </div>

              {/* Status */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {lang === 'ar' ? 'حالة الحضور/الغياب:' : 'Attendance Status:'}
                </label>
                <select
                  value={pastStatus}
                  onChange={(e) => setPastStatus(e.target.value as any)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 font-bold text-slate-900"
                >
                  <option value="absent">❌ غياب (Mark as Absent)</option>
                  <option value="on_time">🟢 حاضر بالموعد (Present / On Time)</option>
                  <option value="late">🟡 متأخر (Late Arrival)</option>
                  <option value="on_leave">🌴 إجازة رسمية (On Leave)</option>
                </select>
              </div>

              {/* Times if present/late */}
              {(pastStatus === 'on_time' || pastStatus === 'late') && (
                <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-200">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">وقت الحضور (Check-In)</label>
                    <input
                      type="time"
                      value={pastCheckIn}
                      onChange={(e) => setPastCheckIn(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">وقت الانصراف (Check-Out)</label>
                    <input
                      type="time"
                      value={pastCheckOut}
                      onChange={(e) => setPastCheckOut(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 font-mono"
                    />
                  </div>
                </div>
              )}

              {/* Administrative Note */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {lang === 'ar' ? 'ملاحظات إدارية:' : 'Administrative Notes:'}
                </label>
                <textarea
                  rows={2}
                  value={pastNote}
                  onChange={(e) => setPastNote(e.target.value)}
                  placeholder={lang === 'ar' ? 'مثال: تم تسجيل غياب الموظف ليوم 2 شهر 2 بقرار التيم ليدر' : 'Reason for entry...'}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowPastDateModal(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-bold"
                >
                  {lang === 'ar' ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition shadow-sm"
                >
                  {lang === 'ar' ? 'حفظ واعتماد السجل التاريخي' : 'Save Record'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: AVATAR CHANGE MODAL */}
      <AvatarModal
        isOpen={showAvatarModal}
        onClose={() => setShowAvatarModal(false)}
        employee={emp}
        onSaveAvatar={(newUrl) => updateAvatar(newUrl)}
        lang={lang}
      />

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
              <span className="text-xs text-slate-500 font-bold">📄 تقرير طبي معتمد لمراجعة التيم ليدر والإدارة</span>
              <button onClick={() => setPreviewAttachment(null)} className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs">
                إغلاق المعاينة
              </button>
            </div>
          </div>
        </div>
      )}
      {/* MODAL 4: EXCUSE PENALTY MODAL */}
      {showExcuseModal && selectedPenalty && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white max-w-md w-full rounded-3xl p-6 shadow-2xl border border-slate-100 space-y-5 dir-rtl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5">
                <div className={`p-2.5 rounded-2xl ${isRestoringPenalty ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                  {isRestoringPenalty ? <ShieldAlert className="w-5 h-5" /> : <ShieldCheck className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">
                    {isRestoringPenalty
                      ? (lang === 'ar' ? 'إعادة احتساب الخصم والجزاء المالي' : 'Restore Penalty Deduction')
                      : (lang === 'ar' ? 'إلغاء الخصم والجزاء المالي (إعفاء)' : 'Waive Penalty Deduction')}
                  </h3>
                  <p className="text-xs text-slate-500 font-bold">
                    {emp.nameAr} - ليوم {selectedPenalty.date}
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

            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500 font-bold">{lang === 'ar' ? 'نوع المخالفة:' : 'Type:'}</span>
                <span className="font-extrabold text-slate-800">{selectedPenalty.titleAr}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-bold">{lang === 'ar' ? 'الجزاء المستحق:' : 'Penalty:'}</span>
                <span className="font-extrabold text-rose-600">{selectedPenalty.penaltyDescriptionAr}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-bold">{lang === 'ar' ? 'خصم أيام:' : 'Days:'}</span>
                <span className="font-mono font-black text-rose-700">{selectedPenalty.penaltyDays} يوم</span>
              </div>
            </div>

            {!isRestoringPenalty ? (
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
                onClick={handleConfirmExcusePenalty}
                className={`px-5 py-2.5 rounded-xl text-white font-extrabold text-xs shadow-md transition flex items-center gap-1.5 cursor-pointer ${
                  isRestoringPenalty ? 'bg-rose-600 hover:bg-rose-700' : 'bg-amber-500 hover:bg-amber-600'
                }`}
              >
                {isRestoringPenalty ? (
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
    </div>
  );
};

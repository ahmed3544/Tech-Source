import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  LogIn, 
  LogOut, 
  Coffee, 
  CheckCircle2, 
  Clock, 
  Search, 
  MapPin, 
  ShieldCheck, 
  User, 
  Sparkles,
  AlertCircle,
  KeyRound,
  Play,
  Square,
  AlertTriangle,
  UserX,
  ShieldAlert,
  Palmtree
} from 'lucide-react';
import { Employee, Shift, AttendanceRecord, LeaveRequest, Language } from '../types';
import { TechSourceLogo } from './TechSourceLogo';
import { UserAvatar } from './UserAvatar';
import { WorkTimer } from './WorkTimer';
import { formatTime, formatDate, formatSecondsToHMS, calculateLateDetails, getFirstTwoNames, getLeaveTypeLabel, getTodayString, isWeekend } from '../utils/helpers';

interface KioskPunchProps {
  employees: Employee[];
  shifts: Shift[];
  todayRecords: AttendanceRecord[];
  leaveRequests?: LeaveRequest[];
  onPunch: (
    employeeId: string, 
    action: 'check_in' | 'check_out' | 'break_start' | 'break_end' | 'force_break_end',
    location: string,
    notes?: string
  ) => void;
  onAddLeave?: (req: LeaveRequest) => void;
  lang: Language;
  currentUser?: Employee | null;
}

export const KioskPunch: React.FC<KioskPunchProps> = ({
  employees,
  shifts,
  todayRecords,
  leaveRequests = [],
  onPunch,
  onAddLeave,
  lang,
  currentUser,
}) => {
  const [selectedEmp, setSelectedEmp] = useState<Employee | null>(
    currentUser || employees[0] || null
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [noteInput, setNoteInput] = useState('');
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [leaveType, setLeaveType] = useState<'annual' | 'sick' | 'permission' | 'emergency'>('annual');
  const [leaveStartDate, setLeaveStartDate] = useState(getTodayString());
  const [leaveEndDate, setLeaveEndDate] = useState(getTodayString());
  const [leaveReason, setLeaveReason] = useState('');
  const [successToast, setSuccessToast] = useState<{
    msg: string;
    type: 'check_in' | 'check_out' | 'break';
    empName: string;
    time: string;
  } | null>(null);
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [breakWarningModal, setBreakWarningModal] = useState<boolean>(false);

  // Live timer tick every 1000ms
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Sync selected employee if currentUser changes
  useEffect(() => {
    if (currentUser && currentUser.role === 'employee') {
      setSelectedEmp(currentUser);
    }
  }, [currentUser]);

  const filteredEmployees = employees.filter(
    emp => 
      emp.nameAr.includes(searchQuery) || 
      emp.nameEn.toLowerCase().includes(searchQuery.toLowerCase()) || 
      emp.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      emp.department.includes(searchQuery)
  );

  const currentRecord = selectedEmp 
    ? todayRecords.find(r => r.employeeId === selectedEmp.id) 
    : undefined;

  const todayDateStr = getTodayString();
  const activeApprovedLeaveToday = selectedEmp ? leaveRequests.find(l => 
    l.employeeId === selectedEmp.id &&
    l.status === 'approved' &&
    l.type !== 'permission' &&
    todayDateStr >= l.startDate &&
    todayDateStr <= l.endDate
  ) : undefined;

  const activePermissionToday = selectedEmp ? leaveRequests.find(l => 
    l.employeeId === selectedEmp.id &&
    l.status === 'approved' &&
    l.type === 'permission' &&
    todayDateStr >= l.startDate &&
    todayDateStr <= l.endDate
  ) : undefined;

  const isWeekendToday = isWeekend(todayDateStr);
  const isOnLeaveToday = Boolean(
    activeApprovedLeaveToday || currentRecord?.status === 'on_leave' || isWeekendToday
  );

  // Active break check
  const isBreakActive = Boolean(currentRecord?.breakStart && !currentRecord?.breakEnd);
  // Single punch per day check
  const hasCheckedIn = Boolean(currentRecord?.checkIn);
  const hasCheckedOut = Boolean(currentRecord?.checkOut);

  // Calculate live break elapsed seconds without refresh
  const [liveBreakSeconds, setLiveBreakSeconds] = useState<number>(0);

  useEffect(() => {
    if (!currentRecord?.breakStart || currentRecord?.breakEnd) {
      setLiveBreakSeconds(0);
      return;
    }

    const calcElapsed = () => {
      try {
        const now = new Date();
        const startStr = currentRecord.breakStart || '';
        let startHour = 0;
        let startMin = 0;
        let startSec = 0;

        // Parse breakStart string (e.g. 12:30:00 or 12:30:00 PM)
        let cleanStr = startStr.trim();
        let isPM = cleanStr.toUpperCase().includes('PM');
        let isAM = cleanStr.toUpperCase().includes('AM');
        cleanStr = cleanStr.replace(/AM|PM/gi, '').trim();
        const parts = cleanStr.split(':').map(Number);
        
        startHour = parts[0] || 0;
        startMin = parts[1] || 0;
        startSec = parts[2] || 0;

        if (isPM && startHour < 12) startHour += 12;
        if (isAM && startHour === 12) startHour = 0;

        const startDate = new Date();
        startDate.setHours(startHour, startMin, startSec, 0);

        const diffSecs = Math.max(0, Math.floor((now.getTime() - startDate.getTime()) / 1000));
        setLiveBreakSeconds(diffSecs);
      } catch {
        setLiveBreakSeconds(0);
      }
    };

    calcElapsed();
    const interval = setInterval(calcElapsed, 1000);
    return () => clearInterval(interval);
  }, [currentRecord?.breakStart, currentRecord?.breakEnd]);

  const isLeader = currentUser?.role === 'leader' || !currentUser;

  const playAudioTone = (type: 'in' | 'out' | 'error') => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = type === 'in' ? 'sine' : type === 'out' ? 'triangle' : 'square';
      osc.frequency.setValueAtTime(type === 'in' ? 587.33 : type === 'out' ? 440 : 220, ctx.currentTime);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
    } catch {
      // Audio fallback
    }
  };

  const handleAction = (action: 'check_in' | 'check_out' | 'break_start' | 'break_end' | 'force_break_end') => {
    if (!selectedEmp) {
      setErrorMsg(lang === 'ar' ? 'الرجاء اختيار الموظف أولاً' : 'Please select an employee first');
      return;
    }

    // Rule: Prevent any action if today is weekend or employee is on leave today
    if (isWeekendToday) {
      setErrorMsg(
        lang === 'ar' 
          ? `اليوم الجمعة/السبت عطلة أسبوعية رسمية! غير مسموح بتسجيل الحضور أو الانصراف في العطلات الأسبوعية.` 
          : `Today is a weekend holiday (Friday/Saturday). Check-in and check-out are disabled.`
      );
      playAudioTone('error');
      return;
    }

    if (isOnLeaveToday) {
      setErrorMsg(
        lang === 'ar' 
          ? `الموظف في إجازة معتمدة اليوم، لا يمكن اتخاذ أي إجراء (حضور / انصراف / استراحة).` 
          : `Employee is on active leave today. No actions (check-in, check-out, break) are allowed.`
      );
      playAudioTone('error');
      return;
    }

    // Rule: Single check-in per day
    if (action === 'check_in' && hasCheckedIn) {
      setErrorMsg(lang === 'ar' ? 'تم تسجيل الحضور لهذا اليوم بالفعل! التسجيل مسموح مرة واحدة فقط في اليوم.' : 'Check-in already registered for today!');
      playAudioTone('error');
      return;
    }

    // Rule: Single check-out per day
    if (action === 'check_out' && hasCheckedOut) {
      setErrorMsg(lang === 'ar' ? 'تم تسجيل الانصراف لهذا اليوم بالفعل! التسجيل مسموح مرة واحدة فقط في اليوم.' : 'Check-out already registered for today!');
      playAudioTone('error');
      return;
    }

    // Rule: Prevent check out while on active break
    if (action === 'check_out' && isBreakActive) {
      setBreakWarningModal(true);
      playAudioTone('error');
      return;
    }

    setErrorMsg(null);
    onPunch(selectedEmp.id, action, '', noteInput);
    
    const timeFormattedStr = formatTime(currentTime, lang);

    const actionTextMap = {
      check_in: lang === 'ar' ? 'تسجيل حضور' : 'Check-In',
      check_out: lang === 'ar' ? 'تسجيل انصراف' : 'Check-Out',
      break_start: lang === 'ar' ? 'بدء استراحة' : 'Break Start',
      break_end: lang === 'ar' ? 'العودة من الاستراحة' : 'Break End',
      force_break_end: lang === 'ar' ? 'إرجاع من الاستراحة (الليدر)' : 'Leader Force End Break',
    };

    setSuccessToast({
      msg: `${actionTextMap[action]} بنجاح!`,
      type: action.includes('check_in') ? 'check_in' : action.includes('check_out') ? 'check_out' : 'break',
      empName: lang === 'ar' ? selectedEmp.nameAr : selectedEmp.nameEn,
      time: timeFormattedStr,
    });

    playAudioTone(action === 'check_in' ? 'in' : 'out');
    setNoteInput('');

    setTimeout(() => {
      setSuccessToast(null);
    }, 4000);
  };

  const handleLeaveSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmp || !leaveReason) return;

    if (onAddLeave) {
      onAddLeave({
        id: `leave-${Date.now()}`,
        employeeId: selectedEmp.id,
        type: leaveType,
        startDate: leaveStartDate,
        endDate: leaveEndDate,
        reason: leaveReason,
        status: 'pending',
        createdAt: getTodayString(),
      });
    }

    setShowLeaveModal(false);
    setLeaveReason('');
    setSuccessToast({
      msg: lang === 'ar' ? 'تم تقديم طلب الإجازة بنجاح!' : 'Leave request submitted!',
      type: 'break',
      empName: selectedEmp.nameAr,
      time: leaveStartDate,
    });
  };

  // Calculate late check-in notice
  const lateCheck = calculateLateDetails(formatTime(currentTime, 'en'), '09:00:00');

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6 animate-fade-in">
      
      {/* Kiosk Header Card */}
      <div className="bg-slate-900 text-white rounded-3xl p-6 sm:p-8 shadow-xl border border-slate-800 relative overflow-hidden flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex items-center gap-4 z-10">
          <TechSourceLogo size="lg" showSubtitle={true} />
        </div>

        {/* Live Digital Clock (12-Hour Western Digits) */}
        <div className="bg-slate-800/90 border border-slate-700/80 px-6 py-4 rounded-2xl text-center z-10 shadow-inner">
          <div className="text-[11px] uppercase tracking-widest text-emerald-400 font-bold mb-1 flex items-center justify-center gap-1.5">
            <Clock className="w-4 h-4 animate-pulse" />
            <span>{lang === 'ar' ? 'ساعة النظام الحية (12H)' : 'Live System Clock'}</span>
          </div>
          <div className="text-3xl sm:text-4xl font-black font-mono tracking-wider text-white">
            {formatTime(currentTime, lang)}
          </div>
          <div className="text-xs text-slate-400 mt-1">
            {formatDate(currentTime.toISOString(), lang)}
          </div>
        </div>
      </div>

      {/* Warning Notice: Check in after 09:00 AM late or after 10:00 AM absent indicator */}
      {(() => {
        const currentTotalMins = currentTime.getHours() * 60 + currentTime.getMinutes();
        if (currentTotalMins >= 600) {
          return (
            <div className="p-4 rounded-2xl bg-red-600 text-white border-2 border-red-700 shadow-xl flex items-center justify-between gap-3 text-xs sm:text-sm font-bold">
              <div className="flex items-center gap-2.5">
                <ShieldAlert className="w-5 h-5 shrink-0 text-white animate-bounce" />
                <span className="leading-relaxed">
                  {lang === 'ar' 
                    ? 'تنويه هام: الوقت الحالي تجاوز الساعة 10:00:00 AM (أكثر من ساعة تأخير عن الوردية). تسجيل الحضور الآن يُسجّل كـ "غائب".' 
                    : 'Notice: Time is past 10:00:00 AM (>1 hour late). Clocking in now will record status as "Absent".'}
                </span>
              </div>
              <span className="font-mono font-black bg-white text-red-700 px-3 py-1.5 rounded-xl shadow-md text-xs shrink-0">
                +10:00 AM (غائب)
              </span>
            </div>
          );
        } else if (lateCheck.isLate) {
          return (
            <div className="p-4 rounded-2xl bg-amber-500 text-slate-950 border-2 border-amber-600 shadow-xl flex items-center justify-between gap-3 text-xs sm:text-sm font-bold">
              <div className="flex items-center gap-2.5">
                <AlertTriangle className="w-5 h-5 shrink-0 text-slate-950 animate-bounce" />
                <span className="leading-relaxed">
                  {lang === 'ar' 
                    ? `تنويه: التسجيل بعد الساعة 09:10:00 AM يُحسب "متأخر" (التأخير: ${lateCheck.lateMinutes} دقيقة و ${lateCheck.lateSeconds} ثانية)`
                    : `Notice: Clocking in after 09:00:00 AM marks as Late (${lateCheck.formattedLateDuration})`}
                </span>
              </div>
              <span className="font-mono font-black bg-slate-950 text-amber-300 px-3 py-1.5 rounded-xl shadow-md text-xs shrink-0">
                +09:00 AM (تأخير)
              </span>
            </div>
          );
        }
        return null;
      })()}

      {/* Success Notification Banner */}
      <AnimatePresence>
        {successToast && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className={`p-5 rounded-2xl shadow-xl flex items-center justify-between text-white ${
              successToast.type === 'check_in' 
                ? 'bg-emerald-600 border border-emerald-500' 
                : successToast.type === 'check_out' 
                ? 'bg-rose-600 border border-rose-500'
                : 'bg-amber-600 border border-amber-500'
            }`}
          >
            <div className="flex items-center gap-4">
              <div className="p-3 bg-white/20 rounded-xl">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <div>
                <h3 className="font-bold text-lg">{successToast.msg}</h3>
                <p className="text-sm opacity-90 font-mono">
                  {successToast.empName} - {successToast.time}
                </p>
              </div>
            </div>
            <div className="text-xs bg-white/20 px-3 py-1.5 rounded-lg font-bold font-mono">
              TECH SOURCE VERIFIED
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Side: Employee Directory (Leader Only or view single employee) */}
        {isLeader && (
          <div className="lg:col-span-5 bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <User className="w-4 h-4 text-emerald-600" />
                <span>{lang === 'ar' ? 'دليل الموظفين' : 'Employee Directory'}</span>
              </h3>
              <span className="text-xs font-semibold font-mono bg-slate-100 text-slate-700 px-2.5 py-1 rounded-full">
                {filteredEmployees.length} {lang === 'ar' ? 'موظف' : 'emps'}
              </span>
            </div>

            {/* Search Bar */}
            <div className="relative">
              <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={lang === 'ar' ? 'ابحث بالاسم أو الكود (EMP001)...' : 'Search name or code...'}
                className="w-full pl-3 pr-9 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all font-sans"
              />
            </div>

            {/* Employee Cards List */}
            <div className="space-y-2 max-h-[440px] overflow-y-auto pr-1">
              {filteredEmployees.map((emp) => {
                const rec = todayRecords.find(r => r.employeeId === emp.id);
                const isSelected = selectedEmp?.id === emp.id;
                const onBreak = Boolean(rec?.breakStart && !rec?.breakEnd);
                const todayStr = getTodayString();
                const activeLeaveObj = leaveRequests.find(
                  l => l.employeeId === emp.id && l.status === 'approved' && l.type !== 'permission' && todayStr >= l.startDate && todayStr <= l.endDate
                );
                const hasApprovedLeave = Boolean(activeLeaveObj) || rec?.status === 'on_leave';

                return (
                  <div
                    key={emp.id}
                    onClick={() => { setSelectedEmp(emp); setErrorMsg(null); }}
                    className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                      isSelected
                        ? 'border-emerald-500 bg-emerald-50/60 shadow-sm ring-1 ring-emerald-500/20'
                        : 'border-slate-100 bg-slate-50/50 hover:bg-slate-100/70 hover:border-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <UserAvatar name={emp.nameEn || emp.nameAr} code={emp.code} size="md" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-nowrap min-w-0">
                          <span className="font-bold text-sm text-slate-900 whitespace-nowrap" title={lang === 'ar' ? emp.nameAr : emp.nameEn}>
                            {getFirstTwoNames(lang === 'ar' ? emp.nameAr : emp.nameEn)}
                          </span>
                          <span className="text-[10px] font-mono font-bold bg-[#0d2240] text-white px-1.5 py-0.5 rounded shrink-0">
                            {emp.code}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500">
                          {emp.department}
                        </p>
                      </div>
                    </div>

                    {/* Punch Badges */}
                    <div className="flex flex-col items-end gap-1">
                      {hasApprovedLeave ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-teal-800 bg-teal-100 px-2 py-0.5 rounded-full border border-teal-300">
                          <Palmtree className="w-3 h-3 text-teal-600" />
                          {getLeaveTypeLabel(activeLeaveObj?.type, lang)}
                        </span>
                      ) : onBreak ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-300 animate-pulse">
                          <Coffee className="w-3 h-3 text-amber-600" />
                          {lang === 'ar' ? 'في استراحة' : 'On Break'}
                        </span>
                      ) : rec?.checkIn && !rec?.checkOut ? (
                        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-300">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          <span>{lang === 'ar' ? 'حاضر' : 'In'}</span>
                          <WorkTimer checkIn={rec.checkIn} checkOut={rec.checkOut} breakStart={rec.breakStart} breakEnd={rec.breakEnd} showIcon={false} className="text-[10px] text-emerald-900 font-mono pl-1 border-l border-emerald-300" />
                        </span>
                      ) : rec?.checkOut ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-600 bg-slate-200 px-2 py-0.5 rounded-full">
                          {lang === 'ar' ? 'منصرف' : 'Out'}
                        </span>
                      ) : (
                        (() => {
                          const currentTotalMins = currentTime.getHours() * 60 + currentTime.getMinutes();
                          if (currentTotalMins < 540) { // Before 09:00 AM
                            return (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded-full border border-sky-200">
                                {lang === 'ar' ? 'لم يحضر بعد' : 'Not In Yet'}
                              </span>
                            );
                          } else if (currentTotalMins < 600) { // 09:00 AM - 10:00 AM
                            return (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                                {lang === 'ar' ? 'تأخر عن 9:00' : 'Late > 9:00'}
                              </span>
                            );
                          } else { // After 10:00 AM
                            return (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                                {lang === 'ar' ? 'غائب' : 'Absent'}
                              </span>
                            );
                          }
                        })()
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Action Pad Container */}
        <div className={`${isLeader ? 'lg:col-span-7' : 'lg:col-span-12'} bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-6 flex flex-col justify-between`}>
          {selectedEmp ? (
            <>
              {/* Employee Selected Header */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4 min-w-0">
                  <UserAvatar name={selectedEmp.nameEn || selectedEmp.nameAr} code={selectedEmp.code} size="lg" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-nowrap min-w-0">
                      <h4 className="font-extrabold text-base sm:text-lg text-slate-900 whitespace-nowrap" title={lang === 'ar' ? selectedEmp.nameAr : selectedEmp.nameEn}>
                        {getFirstTwoNames(lang === 'ar' ? selectedEmp.nameAr : selectedEmp.nameEn)}
                      </h4>
                      {selectedEmp.role === 'leader' && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-[#0d2240] text-amber-300 border border-blue-900 shadow-sm whitespace-nowrap shrink-0">
                          <ShieldCheck className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span>{lang === 'ar' ? 'تيم ليدر' : 'Team Leader'}</span>
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 font-medium mt-0.5 whitespace-nowrap truncate">
                      {lang === 'ar' ? 'كود الموظف' : 'Code'}: <span className="font-mono font-bold text-slate-900">{selectedEmp.code}</span> • {selectedEmp.department}
                    </p>
                  </div>
                </div>

                {/* Modern Punch Status Badge Card */}
                <div className="flex items-center gap-3 bg-slate-900 text-white px-4 py-2.5 rounded-2xl border border-slate-800 shadow-sm shrink-0 w-full sm:w-auto">
                  <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-slate-800 text-emerald-400 border border-slate-700">
                    <Clock className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                      {lang === 'ar' ? 'حالة الحضور اليوم' : 'Today Attendance'}
                    </div>
                    <div className="text-xs font-mono font-bold flex items-center gap-1.5">
                      {(() => {
                        const todayStr = getTodayString();
                        const selLeaveObj = leaveRequests.find(
                          l => l.employeeId === selectedEmp.id && l.status === 'approved' && l.type !== 'permission' && todayStr >= l.startDate && todayStr <= l.endDate
                        );
                        const selPermObj = leaveRequests.find(
                          l => l.employeeId === selectedEmp.id && l.status === 'approved' && l.type === 'permission' && todayStr >= l.startDate && todayStr <= l.endDate
                        );
                        const selHasLeave = Boolean(selLeaveObj) || currentRecord?.status === 'on_leave';

                        if (selHasLeave) {
                          return (
                            <span className="text-teal-300 font-sans font-extrabold text-xs flex items-center gap-1">
                              <Palmtree className="w-3.5 h-3.5 text-teal-400" />
                              <span>{getLeaveTypeLabel(selLeaveObj?.type, lang)} (معتمدة 🌴)</span>
                            </span>
                          );
                        }

                        if (selPermObj && !currentRecord?.checkIn) {
                          return (
                            <span className="text-sky-300 font-sans font-extrabold text-xs flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5 text-sky-400" />
                              <span>إذن معتمد (تسجيل الحضور متاح) ⏱️</span>
                            </span>
                          );
                        }

                        if (currentRecord?.checkIn && currentRecord?.checkOut) {
                          return (
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shrink-0 shadow-xs" />
                              <span className="text-white font-mono font-bold">
                                {formatTime(currentRecord.checkIn, lang)} → {formatTime(currentRecord.checkOut, lang)}
                              </span>
                              <span className="text-emerald-300 font-sans font-black text-xs">
                                ({lang === 'ar' ? `اليوم مقفل ومكتمل • ${currentRecord.workHours || 8}س` : `Day Closed • ${currentRecord.workHours || 8}h`})
                              </span>
                            </div>
                          );
                        }

                        if (currentRecord?.checkIn) {
                          return (
                            <>
                              <span className={`w-2 h-2 rounded-full ${currentRecord.status === 'absent' ? 'bg-rose-400' : currentRecord.status === 'late' ? 'bg-amber-400' : 'bg-emerald-400'} animate-pulse shrink-0`} />
                              <span className="text-white">{formatTime(currentRecord.checkIn, lang)}</span>
                              <WorkTimer checkIn={currentRecord.checkIn} checkOut={currentRecord.checkOut} breakStart={currentRecord.breakStart} breakEnd={currentRecord.breakEnd} className="text-emerald-400 text-xs font-bold" />
                              {currentRecord.status === 'absent' && (
                                <span className="text-[11px] text-rose-400 font-sans font-extrabold">({lang === 'ar' ? 'غائب - تجاوز 60د' : 'Absent > 1h'})</span>
                              )}
                              {currentRecord.status === 'late' && (
                                <span className="text-[11px] text-amber-400 font-sans font-extrabold">({lang === 'ar' ? 'متأخر' : 'Late'})</span>
                              )}
                            </>
                          );
                        }

                        const currentTotalMins = currentTime.getHours() * 60 + currentTime.getMinutes();
                        if (currentTotalMins < 540) { // Before 09:00 AM
                          return <span className="text-sky-300 font-sans font-extrabold text-xs">{lang === 'ar' ? 'لم يحضر بعد' : 'Not Arrived Yet'}</span>;
                        } else if (currentTotalMins < 600) { // 09:00 AM - 10:00 AM
                          return <span className="text-amber-400 font-sans font-extrabold text-xs">{lang === 'ar' ? 'لم يحضر بعد (تجاوز 09:00 AM)' : 'Late > 09:00 AM'}</span>;
                        } else { // After 10:00 AM
                          return <span className="text-rose-400 font-sans font-extrabold text-xs">{lang === 'ar' ? 'غائب (تجاوز 60 دقيقة)' : 'Absent (> 1 Hour)'}</span>;
                        }
                      })()}
                    </div>
                  </div>
                </div>
              </div>

              {/* LIVE BREAK MONITOR WIDGET (HH:MM:SS) - Counts live without refresh */}
              {isBreakActive && (
                <div className="p-4 rounded-2xl bg-amber-500/10 border-2 border-amber-500/30 space-y-2 animate-pulse">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-amber-800 font-bold text-xs">
                      <Coffee className="w-4 h-4 text-amber-600 animate-spin" />
                      <span>{lang === 'ar' ? 'استراحة نشطة حالياً (عداد لايف مباشر HH:MM:SS)' : 'Active Break Live Counter'}</span>
                    </div>
                    <span className="text-[10px] font-mono font-bold bg-amber-500/20 text-amber-900 px-2 py-0.5 rounded border border-amber-500/30">
                      LIVE TICKING
                    </span>
                  </div>

                  <div className="flex items-center justify-between bg-white/80 p-3 rounded-xl border border-amber-200">
                    <div>
                      <span className="text-[10px] text-slate-500 block font-semibold">
                        {lang === 'ar' ? 'وقت بدء الاستراحة:' : 'Break Start Time:'}
                      </span>
                      <span className="font-mono text-xs font-bold text-slate-900">
                        {formatTime(currentRecord?.breakStart, lang)}
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
                  </div>

                  {/* Leader force break return option */}
                  {isLeader && (
                    <div className="pt-2 flex justify-end">
                      <button
                        onClick={() => handleAction('force_break_end')}
                        className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow transition flex items-center gap-1.5"
                      >
                        <ShieldAlert className="w-3.5 h-3.5" />
                        <span>{lang === 'ar' ? 'إرجاع الموظف من الاستراحة (صلاحية الليدر)' : 'Force End Break (Leader)'}</span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Active Approved Leave Notice Banner */}
              {activeApprovedLeaveToday && (
                <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-950 text-xs flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <Palmtree className="w-5 h-5 text-amber-600 shrink-0" />
                    <div>
                      <span className="font-bold text-slate-900 block">
                        {lang === 'ar' ? 'إجازة معتمدة سارية' : 'Active Approved Leave'}
                      </span>
                      <span className="text-slate-600">
                        {lang === 'ar' 
                          ? `الفترة: من ${activeApprovedLeaveToday.startDate} إلى ${activeApprovedLeaveToday.endDate}.`
                          : `Period: ${activeApprovedLeaveToday.startDate} to ${activeApprovedLeaveToday.endDate}.`}
                      </span>
                    </div>
                  </div>
                  <span className="font-mono font-bold bg-amber-200 text-amber-900 px-3 py-1.5 rounded-xl text-[11px] shrink-0 border border-amber-300 shadow-xs">
                    {lang === 'ar' ? 'إجازة معتمدة' : 'Approved Leave'}
                  </span>
                </div>
              )}

              {/* Active Approved Permission Notice Banner */}
              {activePermissionToday && !hasCheckedIn && (
                <div className="p-4 rounded-2xl bg-sky-500/10 border border-sky-500/30 text-sky-950 text-xs flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <Clock className="w-5 h-5 text-sky-600 shrink-0" />
                    <div>
                      <span className="font-bold text-slate-900 block">
                        {lang === 'ar' ? 'إذن استئذان معتمد اليوم ⏱️' : 'Active Approved Permission ⏱️'}
                      </span>
                      <span className="text-slate-600">
                        {lang === 'ar' 
                          ? 'يمكنك تسجيل الحضور في أي وقت خلال أو بعد ساعات الإذن دون انتطار.'
                          : 'Check-in is allowed at any time during or after permission hours.'}
                      </span>
                    </div>
                  </div>
                  <span className="font-mono font-bold bg-sky-100 text-sky-800 px-3 py-1.5 rounded-xl text-[11px] shrink-0 border border-sky-200 shadow-xs">
                    {lang === 'ar' ? 'إذن معتمد (تسجيل الحضور متاح)' : 'Permission (Check-in allowed)'}
                  </span>
                </div>
              )}

              {/* Completed for the day notice - Day Locked & Closed */}
              {hasCheckedIn && hasCheckedOut && (
                <div className="p-4 rounded-2xl bg-emerald-50 border-2 border-emerald-300 text-emerald-950 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
                  <div className="flex items-center gap-2.5">
                    <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
                    <div>
                      <span className="font-extrabold text-sm text-emerald-950 block">
                        {lang === 'ar' 
                          ? 'تم إغلاق اليوم وانصراف الموظف بنجاح (اليوم مقفل ومكتمل)' 
                          : 'Day Closed and Checked Out Successfully (Locked)'}
                      </span>
                      <span className="text-emerald-700 text-xs font-medium">
                        {lang === 'ar'
                          ? `حضور: ${formatTime(currentRecord?.checkIn, lang)} | انصراف: ${formatTime(currentRecord?.checkOut, lang)} | ساعات العمل: ${currentRecord?.workHours || 8} ساعة (لا يمكن التعديل أو الإلغاء)`
                          : `In: ${formatTime(currentRecord?.checkIn, lang)} | Out: ${formatTime(currentRecord?.checkOut, lang)} | Total: ${currentRecord?.workHours || 8} hrs`}
                      </span>
                    </div>
                  </div>
                  <span className="font-mono font-black bg-emerald-600 text-white px-3 py-1.5 rounded-xl text-xs shrink-0 shadow-xs">
                    {lang === 'ar' ? '🔒 اليوم مقفل' : '🔒 Day Closed'}
                  </span>
                </div>
              )}

              {/* Notes & Leave Request trigger */}
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row items-center gap-3">
                  <div className="flex-1 w-full">
                    <input
                      type="text"
                      value={noteInput}
                      onChange={(e) => setNoteInput(e.target.value)}
                      placeholder={lang === 'ar' ? 'ملاحظة إضافية (مثل سبب التأخير أو مهمة خارجية)...' : 'Optional note...'}
                      className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-sans"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowLeaveModal(true)}
                    className="w-full sm:w-auto px-4 py-2.5 bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200 rounded-xl font-bold text-xs transition flex items-center justify-center gap-2 shrink-0 shadow-xs"
                  >
                    <Palmtree className="w-4 h-4 text-sky-600" />
                    <span>{lang === 'ar' ? 'تقديم طلب إجازة / سنوية' : 'Submit Leave / Annual'}</span>
                  </button>
                </div>
              </div>

              {/* Error Message */}
              {errorMsg && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-medium flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Main Punch Action Buttons */}
              <div className="grid grid-cols-2 gap-4 pt-2">
                {/* Check In Button */}
                <button
                  onClick={() => handleAction('check_in')}
                  disabled={hasCheckedIn || isOnLeaveToday}
                  className={`group flex flex-col items-center justify-center p-6 text-white rounded-2xl shadow-lg transition-all border ${
                    hasCheckedIn || isOnLeaveToday
                      ? 'bg-slate-200 text-slate-400 border-slate-300 cursor-not-allowed opacity-60'
                      : 'bg-gradient-to-b from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 border-emerald-500/40 hover:shadow-xl active:scale-[0.98]'
                  }`}
                >
                  <LogIn className="w-8 h-8 mb-2 group-hover:scale-110 transition-transform text-emerald-300" />
                  <span className="font-extrabold text-lg tracking-wide">{lang === 'ar' ? 'تسجيل حضور' : 'CHECK IN'}</span>
                  <span className="text-[11px] opacity-90 mt-1 font-mono">
                    {isOnLeaveToday
                      ? (lang === 'ar' ? 'إجازة معتمدة اليوم 🌴' : 'Approved Leave Today 🌴')
                      : activePermissionToday && !hasCheckedIn
                      ? (lang === 'ar' ? 'إذن معتمد (تسجيل الحضور متاح) ⏱️' : 'Permission Active (Check-in allowed)')
                      : hasCheckedIn 
                      ? (lang === 'ar' ? 'تم الحضور اليوم' : 'Already Checked In') 
                      : (lang === 'ar' ? 'الوردية 09:00:00 AM' : 'Shift 09:00 AM')}
                  </span>
                </button>

                {/* Check Out Button */}
                <div className="relative group">
                  <button
                    onClick={() => handleAction('check_out')}
                    disabled={!hasCheckedIn || isBreakActive || hasCheckedOut || isOnLeaveToday}
                    title={
                      isOnLeaveToday
                        ? (lang === 'ar' ? 'الموظف في إجازة معتمدة اليوم' : 'Employee is on leave today')
                        : !hasCheckedIn
                        ? (lang === 'ar' ? 'يجب تسجيل الحضور أولاً' : 'Must check in first')
                        : isBreakActive 
                        ? (lang === 'ar' ? 'يجب إنهاء الاستراحة النشطة أولاً قبل تسجيل الانصراف' : 'Must end break before check out') 
                        : hasCheckedOut
                        ? (lang === 'ar' ? 'تم تسجيل الانصراف لهذا اليوم بالفعل' : 'Already checked out today')
                        : ''
                    }
                    className={`w-full h-full flex flex-col items-center justify-center p-6 rounded-2xl shadow-lg transition-all border ${
                      !hasCheckedIn || isBreakActive || hasCheckedOut || isOnLeaveToday
                        ? 'bg-slate-200 text-slate-400 border-slate-300 cursor-not-allowed opacity-60' 
                        : 'bg-gradient-to-b from-rose-600 to-rose-700 hover:from-rose-700 hover:to-rose-800 text-white border-rose-500/40 hover:shadow-xl active:scale-[0.98]'
                    }`}
                  >
                    <LogOut className="w-8 h-8 mb-2 group-hover:scale-110 transition-transform" />
                    <span className="font-extrabold text-lg tracking-wide">{lang === 'ar' ? 'تسجيل انصراف' : 'CHECK OUT'}</span>
                    <span className="text-[11px] opacity-90 mt-1 font-mono">
                      {isOnLeaveToday
                        ? (lang === 'ar' ? 'غير متاح (إجازة 🌴)' : 'Disabled (Leave 🌴)')
                        : hasCheckedOut
                        ? (lang === 'ar' ? 'تم الانصراف اليوم' : 'Already Checked Out')
                        : isBreakActive 
                        ? (lang === 'ar' ? 'معطّل (استراحة نشطة)' : 'Disabled (On Break)') 
                        : !hasCheckedIn 
                        ? (lang === 'ar' ? 'سجّل الحضور أولاً' : 'Check In First')
                        : (lang === 'ar' ? 'نهاية الوردية 05:00 PM' : 'Shift End 05:00 PM')}
                    </span>
                  </button>
                  {isBreakActive && !isOnLeaveToday && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-rose-700 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow pointer-events-none whitespace-nowrap">
                      {lang === 'ar' ? 'إنهاء الاستراحة أولاً ⚠️' : 'End Break First ⚠️'}
                    </div>
                  )}
                </div>
              </div>

              {/* Secondary Break Control Buttons */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={() => handleAction('break_start')}
                  disabled={!hasCheckedIn || hasCheckedOut || isBreakActive || isOnLeaveToday}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold text-xs transition-colors ${
                    !hasCheckedIn || hasCheckedOut || isBreakActive || isOnLeaveToday
                      ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed opacity-60'
                      : 'bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200'
                  }`}
                >
                  <Coffee className="w-4 h-4 text-amber-600" />
                  <span>
                    {isOnLeaveToday
                      ? (lang === 'ar' ? 'الاستراحة معطلة (إجازة 🌴)' : 'Break Disabled (Leave)')
                      : (lang === 'ar' ? 'بدء استراحة' : 'Start Break')}
                  </span>
                </button>

                <button
                  onClick={() => handleAction('break_end')}
                  disabled={!isBreakActive || isOnLeaveToday}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold text-xs transition-colors ${
                    !isBreakActive || isOnLeaveToday
                      ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed opacity-60'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-md border border-emerald-500 animate-pulse'
                  }`}
                >
                  <Sparkles className="w-4 h-4" />
                  <span>{lang === 'ar' ? 'العودة من الاستراحة' : 'End Break'}</span>
                </button>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center text-slate-400">
              <User className="w-16 h-16 stroke-1 mb-3 text-slate-300" />
              <p className="font-semibold">{lang === 'ar' ? 'الرجاء تحديد موظف من القائمة أولاً' : 'Select an employee from the directory'}</p>
            </div>
          )}
        </div>
      </div>

      {/* Warning Modal when attempting to check out during break */}
      {breakWarningModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-rose-500/50 rounded-3xl p-6 max-w-md w-full text-center space-y-4 shadow-2xl">
            <div className="w-14 h-14 rounded-2xl bg-rose-500/20 text-rose-400 flex items-center justify-center mx-auto border border-rose-500/30">
              <AlertTriangle className="w-8 h-8 animate-bounce" />
            </div>
            <h3 className="text-xl font-black text-white">
              {lang === 'ar' ? 'ممنوع تسجيل الانصراف!' : 'Cannot Check Out!'}
            </h3>
            <p className="text-sm text-slate-300 leading-relaxed">
              {lang === 'ar'
                ? 'لا يمكنك تسجيل الانصراف أثناء التواجد في استراحة نشطة. يرجى تسجيل العودة من الاستراحة أولاً ثم المحاولة مرة أخرى.'
                : 'You are currently on an active break. Please end your break before checking out.'}
            </p>
            <div className="pt-2">
              <button
                onClick={() => setBreakWarningModal(false)}
                className="w-full py-3 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm shadow transition"
              >
                {lang === 'ar' ? 'فهمت، العودة للتحكم' : 'Got it'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Leave Request Modal */}
      {showLeaveModal && selectedEmp && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-3xl p-6 shadow-2xl border border-slate-200 space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-extrabold text-slate-900 text-base">
                  {lang === 'ar' ? 'تقديم طلب إجازة / سنوية' : 'Submit Leave / Annual Request'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {lang === 'ar' ? `للموظف: ${selectedEmp.nameAr}` : `Employee: ${selectedEmp.nameEn}`}
                </p>
              </div>
              <button onClick={() => setShowLeaveModal(false)} className="text-slate-400 hover:text-slate-600 font-bold text-sm p-1">
                ✕
              </button>
            </div>

            <form onSubmit={handleLeaveSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">نوع الإجازة المطلوبة</label>
                <select
                  value={leaveType}
                  onChange={(e) => setLeaveType(e.target.value as any)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 font-bold text-slate-800"
                >
                  <option value="annual">🌴 إجازة سنوية اعتيادية (Annual Leave)</option>
                  <option value="sick">🩺 إجازة مرضية (Sick Leave)</option>
                  <option value="permission">⏱️ إذن استئذان ساعات (Short Permission)</option>
                  <option value="emergency">🚨 إجازة طارئة (Emergency Leave)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">تاريخ البداية</label>
                  <input
                    type="date"
                    required
                    value={leaveStartDate}
                    onChange={(e) => setLeaveStartDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">تاريخ النهاية</label>
                  <input
                    type="date"
                    required
                    value={leaveEndDate}
                    onChange={(e) => setLeaveEndDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">سبب ومبررات الطلب</label>
                <textarea
                  required
                  rows={3}
                  value={leaveReason}
                  onChange={(e) => setLeaveReason(e.target.value)}
                  placeholder="اكتب أسباب الإجازة بالتفصيل..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowLeaveModal(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 font-semibold hover:bg-slate-100"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-md"
                >
                  تأكيد وإرسال الطلب
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

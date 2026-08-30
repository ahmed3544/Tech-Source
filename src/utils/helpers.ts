import { AttendanceRecord, Shift, AttendanceStatus, PermissionSlot, LeaveRequest } from '../types';
import * as XLSX from 'xlsx';
const APP_TIME_ZONE = 'Africa/Cairo';

function getCairoParts(date: Date): Record<string, string> {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date).reduce<Record<string, string>>((parts, part) => {
    if (part.type !== 'literal') parts[part.type] = part.value;
    return parts;
  }, {});
}

/**
 * Get current date string formatted as YYYY-MM-DD in LOCAL browser timezone.
 * Prevents ISO UTC date shifts before local 12:00 midnight!
 */
export function getTodayString(d: Date = new Date()): string {
  const parts = getCairoParts(d);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/**
 * Get current time string formatted as HH:MM:SS in 24-hour local time (e.g. "17:05:30")
 */
export function getNowTimeString(d: Date = new Date()): string {
  const parts = getCairoParts(d);
  return `${parts.hour}:${parts.minute}:${parts.second}`;
}

/**
 * Check if a given date is a fixed weekend day (Friday = 5, Saturday = 6)
 */
export function isWeekend(date: string | Date): boolean {
  if (!date) return false;
  if (typeof date === 'string') {
    const cleanStr = date.split('T')[0];
    const parts = cleanStr.split('-').map(Number);
    if (parts.length === 3 && !parts.some(isNaN)) {
      const d = new Date(parts[0], parts[1] - 1, parts[2]);
      const day = d.getDay();
      return day === 5 || day === 6; // Friday (5) & Saturday (6) are fixed weekly holidays
    }
  }
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return false;
  const day = d.getDay();
  return day === 5 || day === 6; // Friday (5) & Saturday (6) are fixed weekly holidays
}

/**
 * Calculate actual work days in a period (excluding Friday & Saturday)
 */
export function calculateWorkDaysInPeriod(
  startDateStr: string,
  endDateStr: string,
  attendanceRecords: any[] = []
): number {
  if (!startDateStr || !endDateStr) return 0;

  const startParts = startDateStr.split('T')[0].split('-').map(Number);
  const endParts = endDateStr.split('T')[0].split('-').map(Number);

  if (
    startParts.length !== 3 ||
    endParts.length !== 3 ||
    startParts.some(isNaN) ||
    endParts.some(isNaN)
  ) {
    return 0;
  }

  const start = new Date(
    startParts[0],
    startParts[1] - 1,
    startParts[2]
  );

  const end = new Date(
    endParts[0],
    endParts[1] - 1,
    endParts[2]
  );

  if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;

  // تواريخ الإجازات والعطلات الرسمية
  const excludedDates = new Set(
    (attendanceRecords || [])
      .filter(record => {
        const status = String(record.status || '').toLowerCase();
        const leaveType = String(record.leaveType || '').toLowerCase();

        return (
          status === 'on_leave' ||
          leaveType === 'annual' ||
          leaveType === 'regular' ||
          leaveType === 'sick' ||
          leaveType === 'casual' ||
          leaveType === 'official' ||
          leaveType === 'holiday'
        );
      })
      .map(record => String(record.date || '').split('T')[0])
      .filter(Boolean)
  );

  let count = 0;
  const cur = new Date(start);

  while (cur <= end) {
    const day = cur.getDay();

    const yyyy = cur.getFullYear();
    const mm = String(cur.getMonth() + 1).padStart(2, '0');
    const dd = String(cur.getDate()).padStart(2, '0');

    const dateStr = `${yyyy}-${mm}-${dd}`;

    // الجمعة والسبت = إجازة أسبوعية
    const isWeekendDay = day === 5 || day === 6;

    // إجازة سنوية / مرضية / عارضة / رسمية
    const isExcludedDay = excludedDates.has(dateStr);

    if (!isWeekendDay && !isExcludedDay) {
      count++;
    }

    cur.setDate(cur.getDate() + 1);
  }

  return count;
}

/**
 * Extract the first two names from a full name string (e.g. "Mostafa Mohamed" from "Mostafa Mohamed Kamel Abou Seada")
 */
export function getFirstTwoNames(fullName?: string): string {
  if (!fullName) return '';
  const parts = fullName.trim().split(/\s+/);
  if (parts.length <= 2) return fullName.trim();
  return `${parts[0]} ${parts[1]}`;
}

/**
 * Convert any Eastern Arabic numerals (٠١٢٣٤٥٦٧٨٩) to Western English numerals (0-9)
 */
export function toWesternDigits(val: string | number): string {
  if (val === undefined || val === null) return '';
  const str = String(val);
  return str.replace(/[٠-٩]/g, d => '0123456789'['٠١٢٣٤٥٦٧٨٩'.indexOf(d)]);
}

/**
 * Format date with Arabic names for days/months and Western numbers (0-9)
 */
export function formatDate(dateString: string, lang: 'ar' | 'en' = 'ar'): string {
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    
    // Get formatted string from locale
    const formatted = d.toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    
    return toWesternDigits(formatted);
  } catch {
    return toWesternDigits(dateString);
  }
}

/**
 * Format time to 12-Hour format with AM/PM using Western numbers (0-9)
 * Examples: "09:00:00 AM", "05:00:00 PM", "04:04:28 PM"
 */
export function formatTime(timeStr?: string | Date, lang: 'ar' | 'en' = 'ar'): string {
  if (!timeStr) return '--:--';
  
  if (timeStr instanceof Date) {
    const hours = timeStr.getHours();
    const minutes = String(timeStr.getMinutes()).padStart(2, '0');
    const seconds = String(timeStr.getSeconds()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const h12 = hours % 12 || 12;
    const hFormatted = String(h12).padStart(2, '0');
    return `${hFormatted}:${minutes}:${seconds} ${ampm}`;
  }

  const str = String(timeStr).trim();
  if (str.includes('AM') || str.includes('PM')) {
    return toWesternDigits(str);
  }

  const parts = str.split(':');
  if (parts.length < 2) return toWesternDigits(str);

  let hours = parseInt(parts[0], 10);
  const minutes = String(parts[1]).padStart(2, '0');
  const seconds = parts[2] ? String(parts[2]).padStart(2, '0') : '00';

  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  const hFormatted = String(hours).padStart(2, '0');

  return `${hFormatted}:${minutes}:${seconds} ${ampm}`;
}

/**
 * Convert duration in seconds to HH:MM:SS format (Western digits)
 */
export function formatSecondsToHMS(totalSeconds: number): string {
  const secs = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;

  const hh = String(h).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');

  return `${hh}:${mm}:${ss}`;
}

/**
 * Calculate late details when checking in after shift start:
 * - Default shift start 09:00 AM with a 10-minute grace period
 * - If approvedPermissionSlot is 'first_half' (نصف اليوم الأول), deadline is shifted by 2h to 11:00 AM.
 * - At or before deadline: On Time (0 late)
 * - After deadline: Late (متأخر)
 * - After 1 hour past deadline (> 60 mins late): Absent (غائب)
 */
export function calculateLateDetails(
  checkInTimeStr: string, 
  shiftStartStr: string = '09:00:00',
  permissionSlot?: PermissionSlot,
  hasApprovedPermission?: boolean
): {
  isLate: boolean;
  isAbsent: boolean;
  lateMinutes: number;
  lateSeconds: number;
  formattedLateDuration: string;
} {
  const parseSeconds = (tStr: string) => {
    let str = tStr.trim();
    let isPM = false;
    let isAM = false;
    if (str.toUpperCase().includes('PM')) {
      isPM = true;
      str = str.replace(/PM/i, '').trim();
    } else if (str.toUpperCase().includes('AM')) {
      isAM = true;
      str = str.replace(/AM/i, '').trim();
    }
    
    const parts = str.split(':').map(Number);
    let h = parts[0] || 0;
    const m = parts[1] || 0;
    const s = parts[2] || 0;

    if (isPM && h < 12) h += 12;
    if (isAM && h === 12) h = 0;

    return h * 3600 + m * 60 + s;
  };

  // Rule: An approved 2-hour permission (start of day, end of day, custom) excuses check-in tardiness
  if (permissionSlot || hasApprovedPermission) {
    return {
      isLate: false,
      isAbsent: false,
      lateMinutes: 0,
      lateSeconds: 0,
      formattedLateDuration: '00:00:00',
    };
  }

  const checkInSecs = parseSeconds(checkInTimeStr);
  const baseShiftSecs = parseSeconds(shiftStartStr); // 09:00:00 => 32400s
  const gracePeriodSecs = 10 * 60;
  const lateAfterSecs = baseShiftSecs + gracePeriodSecs;

  if (checkInSecs > lateAfterSecs) {
    const diffSecs = checkInSecs - baseShiftSecs;
    const lateMinutes = Math.floor(diffSecs / 60);
    const lateSeconds = diffSecs % 60;

    return {
      isLate: true,
      isAbsent: false,
      lateMinutes,
      lateSeconds,
      formattedLateDuration: formatSecondsToHMS(diffSecs),
    };
  }

  return {
    isLate: false,
    isAbsent: false,
    lateMinutes: 0,
    lateSeconds: 0,
    formattedLateDuration: '00:00:00',
  };
}

/**
 * Calculate work hours for an attendance record dynamically
 */
export function calculateRecordWorkHours(r: Partial<AttendanceRecord>, shiftEndTime: string = '17:00:00'): number {
  if (r.workHours && r.workHours > 0) return r.workHours;
  if (!r.checkIn) return 0;
  
  const parseSecs = (str: string) => {
    let s = str.trim();
    let isPM = s.toUpperCase().includes('PM');
    let isAM = s.toUpperCase().includes('AM');
    s = s.replace(/AM|PM/gi, '').trim();
    const parts = s.split(':').map(Number);
    let h = parts[0] || 0;
    const m = parts[1] || 0;
    const sec = parts[2] || 0;
    if (isPM && h < 12) h += 12;
    if (isAM && h === 12) h = 0;
    return h * 3600 + m * 60 + sec;
  };

  const inSecs = parseSecs(r.checkIn);
  let outSecs: number;

  if (r.checkOut) {
    outSecs = parseSecs(r.checkOut);
  } else {
    const todayStr = getTodayString();
    if (r.date === todayStr || !r.date) {
      const now = new Date();
      const nowSecs = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
      outSecs = Math.max(inSecs, nowSecs);
    } else {
      outSecs = parseSecs(shiftEndTime);
    }
  }

  if (outSecs <= inSecs) return 0;
  let diffSecs = outSecs - inSecs;

  if (r.breakStart) {
    const bsSecs = parseSecs(r.breakStart);
    let beSecs = outSecs;
    if (r.breakEnd) {
      beSecs = parseSecs(r.breakEnd);
    }
    const breakSecs = Math.max(0, beSecs - bsSecs);
    diffSecs = Math.max(0, diffSecs - breakSecs);
  }

  return Math.round((diffSecs / 3600) * 10) / 10;
}

/**
 * Evaluate attendance punch status with support for first_half and second_half permissions
 */
export function evaluatePunch(
  checkInTimeStr?: string,
  checkOutTimeStr?: string,
  shift?: Shift,
  recordDate?: string,
  permissionSlot?: PermissionSlot,
  hasApprovedPermission?: boolean,
  breakStartStr?: string,
  breakEndStr?: string
): {
  lateMinutes: number;
  lateSeconds: number;
  earlyLeaveMinutes: number;
  workHours: number;
  overtimeHours: number;
  status: AttendanceStatus;
} {
  const currentShift = shift || {
    id: 's1',
    nameAr: 'الدوام الموحد',
    nameEn: 'Standard Shift',
    startTime: '09:00:00',
    endTime: '17:00:00',
    gracePeriodMinutes: 0,
    workDays: [0, 1, 2, 3, 4],
  };

  if (!checkInTimeStr || checkInTimeStr.trim() === '') {
    return {
      lateMinutes: 0,
      lateSeconds: 0,
      earlyLeaveMinutes: 0,
      workHours: 0,
      overtimeHours: 0,
      status: 'absent',
    };
  }

  const lateInfo = calculateLateDetails(checkInTimeStr, currentShift.startTime || '09:00:00', permissionSlot, hasApprovedPermission);
  
  let workHours = 0;
  let earlyLeaveMinutes = 0;
  let overtimeHours = 0;
  let status: AttendanceStatus = lateInfo.isLate ? 'late' : 'on_time';

  const parseSecs = (str: string) => {
    let s = str.trim();
    let isPM = s.toUpperCase().includes('PM');
    let isAM = s.toUpperCase().includes('AM');
    s = s.replace(/AM|PM/gi, '').trim();
    const parts = s.split(':').map(Number);
    let h = parts[0] || 0;
    const m = parts[1] || 0;
    const sec = parts[2] || 0;
    if (isPM && h < 12) h += 12;
    if (isAM && h === 12) h = 0;
    return h * 3600 + m * 60 + sec;
  };

  const inSecs = parseSecs(checkInTimeStr);
  let shiftEndSecs = parseSecs(currentShift.endTime || '17:00:00');

  // If second_half permission, allow leaving at 3:00 PM (15:00) without early leave deduction
  if (permissionSlot === 'second_half') {
    shiftEndSecs -= 2 * 3600; // 15:00:00 (3:00 PM)
  }

  let outSecs: number | undefined = undefined;
  if (checkOutTimeStr) {
    outSecs = parseSecs(checkOutTimeStr);
  } else {
    const todayStr = getTodayString();
    if (recordDate === todayStr || !recordDate) {
      const now = new Date();
      const nowSecs = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
      outSecs = Math.max(inSecs, nowSecs);
    } else {
      outSecs = shiftEndSecs;
    }
  }

  if (outSecs !== undefined && outSecs > inSecs) {
    let durationSecs = outSecs - inSecs;
    if (breakStartStr) {
      const bsSecs = parseSecs(breakStartStr);
      let beSecs = outSecs;
      if (breakEndStr) {
        beSecs = parseSecs(breakEndStr);
      }
      const breakSecs = Math.max(0, beSecs - bsSecs);
      durationSecs = Math.max(0, durationSecs - breakSecs);
    }
    workHours = Math.round((durationSecs / 3600) * 10) / 10;

    if (checkOutTimeStr) {
      if (outSecs < shiftEndSecs - 60) {
        earlyLeaveMinutes = Math.floor((shiftEndSecs - outSecs) / 60);
        status = 'early_leave';
      } else {
        const scheduledDurationSecs = currentShift.durationMinutes
          ? currentShift.durationMinutes * 60
          : Math.max(0, shiftEndSecs - parseSecs(currentShift.startTime || '09:00:00'));
        if (durationSecs > scheduledDurationSecs) {
          overtimeHours = Math.round(((durationSecs - scheduledDurationSecs) / 3600) * 10) / 10;
        }
        if (overtimeHours > 0) {
        status = 'overtime';
        } else if (lateInfo.isLate) {
          status = 'late';
        } else {
          status = 'on_time';
        }
      }
    } else {
      status = lateInfo.isLate ? 'late' : 'in_progress';
    }
  } else {
    status = lateInfo.isLate ? 'late' : 'in_progress';
  }

  return {
    lateMinutes: lateInfo.lateMinutes,
    lateSeconds: lateInfo.lateSeconds,
    earlyLeaveMinutes,
    workHours: Math.max(0, workHours),
    overtimeHours: Math.max(0, overtimeHours),
    status,
  };
}

export function getLeaveTypeLabel(type?: string, lang: 'ar' | 'en' = 'ar', notes?: string): string {
  let finalType = type;
  if (!finalType && notes) {
    if (notes.includes('مرضية') || notes.toLowerCase().includes('sick')) finalType = 'sick';
    else if (notes.includes('عارضة') || notes.toLowerCase().includes('casual')) finalType = 'casual';
    else if (notes.includes('اعتيادية') || notes.includes('سنوية') || notes.toLowerCase().includes('annual')) finalType = 'annual';
    else if (notes.includes('طارئة') || notes.toLowerCase().includes('emergency')) finalType = 'emergency';
    else if (notes.includes('رسمية') || notes.toLowerCase().includes('official')) finalType = 'official';
    else if (notes.includes('استئذان') || notes.includes('إذن')) finalType = 'permission';
  }

  const mapAr: Record<string, string> = {
    annual: 'إجازة اعتيادية',
    regular: 'إجازة اعتيادية',
    casual: 'إجازة عارضة',
    sick: 'إجازة مرضية',
    emergency: 'إجازة طارئة',
    permission: 'إذن استئذان',
    maternity: 'إجازة وضع',
    paternity: 'إجازة أبوة',
    study: 'إجازة امتحانات',
    hajj: 'إجازة حج/عمرة',
    official: 'إجازة رسمية'
  };
  const mapEn: Record<string, string> = {
    annual: 'Regular Leave',
    regular: 'Regular Leave',
    casual: 'Casual Leave',
    sick: 'Sick Leave',
    emergency: 'Emergency Leave',
    permission: 'Permission',
    maternity: 'Maternity Leave',
    paternity: 'Paternity Leave',
    study: 'Study Leave',
    hajj: 'Hajj Leave',
    official: 'Official Holiday'
  };
  if (finalType && (mapAr[finalType] || mapEn[finalType])) {
    return lang === 'ar' ? mapAr[finalType] : mapEn[finalType];
  }
  return lang === 'ar' ? 'إجازة اعتيادية' : 'Regular Leave';
}

export function getStatusText(status?: AttendanceStatus, lang: 'ar' | 'en' = 'ar', leaveType?: string, notes?: string) {
  if (!status) {
    return lang === 'ar' ? 'لم يسجل بعد' : 'Not Logged Yet';
  }

  if (status === 'weekend') {
    return lang === 'ar' ? 'عطلة أسبوعية 🏖️' : 'Weekend Holiday 🏖️';
  }

  if (status === 'on_leave') {
    const leaveLabel = getLeaveTypeLabel(leaveType, lang, notes);
    return `${leaveLabel} 🌴`;
  }

  const mapAr: Record<AttendanceStatus, string> = {
    on_time: 'حاضر (في الوقت)',
    late: 'متأخر',
    early_leave: 'انصراف مبكر',
    overtime: 'ساعات إضافية',
    absent: 'غائب',
    on_leave: 'إجازة اعتيادية 🌴',
    in_progress: 'قيد العمل الان',
    weekend: 'عطلة أسبوعية 🏖️',
  };

  const mapEn: Record<AttendanceStatus, string> = {
    on_time: 'On Time',
    late: 'Late Arrival',
    early_leave: 'Early Departure',
    overtime: 'Overtime Work',
    absent: 'Absent',
    on_leave: 'On Leave',
    in_progress: 'Currently Clocked In',
    weekend: 'Weekend Holiday 🏖️',
  };

  return lang === 'ar' ? mapAr[status] || status : mapEn[status] || status;
}

export function getStatusBadgeStyle(status?: AttendanceStatus): string {
  switch (status) {
    case 'on_time':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'late':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'early_leave':
      return 'bg-orange-50 text-orange-700 border-orange-200';
    case 'overtime':
      return 'bg-purple-50 text-purple-700 border-purple-200';
    case 'absent':
      return 'bg-rose-50 text-rose-700 border-rose-200';
    case 'on_leave':
      return 'bg-sky-50 text-sky-700 border-sky-200';
    case 'in_progress':
      return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'weekend':
      return 'bg-emerald-50 text-emerald-800 border-emerald-300 font-bold';
    default:
      return 'bg-slate-50 text-slate-700 border-slate-200';
  }
}

/**
 * Export attendance records or generic row objects to CSV file download
 */
export function exportToCSV(
  data: AttendanceRecord[] | Record<string, any>[], 
  getEmpNameOrFilename?: ((id: string) => string) | string,
  customFilename?: string
) {
  let csvContent = '\uFEFF';
  let fileName = customFilename || `attendance_report_${new Date().toISOString().split('T')[0]}.csv`;

  if (typeof getEmpNameOrFilename === 'string') {
    fileName = `${getEmpNameOrFilename}.csv`;
  }

  if (data.length === 0) return;

  const firstItem = data[0];

  // If passing formatted object array (e.g., Overall Search report)
  if (typeof firstItem === 'object' && !('employeeId' in firstItem)) {
    const headers = Object.keys(firstItem);
    const rows = (data as Record<string, any>[]).map(row => 
      headers.map(h => `"${String(row[h] ?? '').replace(/"/g, '""')}"`).join(',')
    );
    csvContent += [headers.join(','), ...rows].join('\n');
  } else {
    // Standard AttendanceRecord[]
    const getEmpName = typeof getEmpNameOrFilename === 'function' ? getEmpNameOrFilename : (id: string) => id;
    const records = data as AttendanceRecord[];
    const headers = ['تاريخ', 'الموظف', 'وقت الحضور', 'وقت الانصراف', 'ساعات العمل', 'ساعات إضافية', 'دقائق التأخير', 'الحالة'];
    
    const rows = records.map(r => [
      toWesternDigits(r.date),
      `"${getEmpName(r.employeeId)}"`,
      formatTime(r.checkIn ?? undefined),
      formatTime(r.checkOut ?? undefined),
      toWesternDigits(r.workHours?.toFixed(1) || '0'),
      toWesternDigits(r.overtimeHours?.toFixed(1) || '0'),
      toWesternDigits(r.lateMinutes || 0),
      getStatusText(r.status, 'ar')
    ]);

    csvContent += [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
  }

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function ensureSanitizedRecord(rec: AttendanceRecord): AttendanceRecord {
  if (!rec) return rec;

  // Rule: Weekend days (Friday & Saturday) are official weekly off days
  if (isWeekend(rec.date)) {
    if (!rec.checkIn || rec.status === 'weekend' || rec.status === 'absent') {
      // If employee is on an approved leave request on a weekend, it's either on_leave or weekend
      if (rec.status !== 'on_leave') {
        return {
          ...rec,
          status: 'weekend',
          workHours: 0,
          lateMinutes: 0,
          lateSeconds: 0,
          earlyLeaveMinutes: 0,
          notes: rec.notes || 'عطلة أسبوعية رسمية (الجمعة والسبت)',
        };
      }
    }
  }

  let status = rec.status;
  let workHours = rec.workHours || 0;
  let earlyLeaveMinutes = rec.earlyLeaveMinutes || 0;

  if (rec.checkIn && typeof rec.checkIn === 'string' && rec.checkIn.trim() !== '') {
    if (rec.checkOut && typeof rec.checkOut === 'string' && rec.checkOut.trim() !== '') {
      if (!workHours || workHours === 0) {
        workHours = calculateRecordWorkHours(rec);
      }
      if (status === 'in_progress' || status === 'absent' || !status || status === 'weekend') {
        if (rec.lateMinutes && rec.lateMinutes > 0) {
          status = 'late';
        } else if (earlyLeaveMinutes > 0) {
          status = 'early_leave';
        } else {
          status = 'on_time';
        }
      }
    } else if (!rec.checkOut) {
      if (status === 'absent' || !status || status === 'weekend') {
        if (rec.lateMinutes && rec.lateMinutes > 0) {
          status = 'late';
        } else {
          status = 'in_progress';
        }
      }
    }
  }
  return { ...rec, status, workHours, earlyLeaveMinutes };
}

/**
 * Sanitize attendance records against approved permission leave requests.
 * Excuses lateness, prevents absent status when check-in is present, and sets zero late minutes.
 */
export function sanitizeAttendanceWithPermissions(
  records: AttendanceRecord[],
  leaves: LeaveRequest[]
): AttendanceRecord[] {
  const approvedPerms = leaves.filter(l => l.status === 'approved' && l.type === 'permission');
  
  return records.map(r => {
    let sanitized = ensureSanitizedRecord(r);
    if (approvedPerms.length > 0) {
      const perm = approvedPerms.find(
        l => l.employeeId === sanitized.employeeId && sanitized.date >= l.startDate && sanitized.date <= l.endDate
      );
      if (perm) {
        if (sanitized.checkIn) {
          // Has checked in -> late minutes MUST be 0, status must be in_progress or on_time (never absent or late)
          const newStatus = sanitized.checkOut ? 'on_time' : 'in_progress';
          sanitized = {
            ...sanitized,
            lateMinutes: 0,
            lateSeconds: 0,
            status: newStatus,
          };
        } else {
          sanitized = {
            ...sanitized,
            lateMinutes: 0,
            lateSeconds: 0,
            status: 'on_leave',
            leaveType: 'permission',
          };
        }
      }
    }
    return sanitized;
  });
}

/**
 * Ensures that all approved leave requests have corresponding attendance records marked as on_leave.
 */
export function ensureApprovedLeaveRecords(records: AttendanceRecord[] = [], leaveRequests: LeaveRequest[] = []): AttendanceRecord[] {
  const map = new Map<string, AttendanceRecord>();
  records.forEach(r => {
    if (!r) return;
    const sanitized = ensureSanitizedRecord(r);
    const normEmp = (sanitized.employeeId || "").trim().toLowerCase();
    const dt = (sanitized.date || "").trim();
    if (normEmp && dt) {
      map.set(`${normEmp}_${dt}`, sanitized);
    }
  });

  const approved = (leaveRequests || []).filter(l => l.status === "approved");

  approved.forEach(req => {
    const rawEmp = (req.employeeId || "").trim();
    const normEmp = rawEmp.toLowerCase();
    if (!normEmp || !req.startDate || !req.endDate) return;

    // Normalize date iteration to handle start/end regardless of order
    const startStr = req.startDate <= req.endDate ? req.startDate : req.endDate;
    const endStr = req.startDate <= req.endDate ? req.endDate : req.startDate;

    let d = new Date(startStr + "T00:00:00");
    const end = new Date(endStr + "T00:00:00");

    while (d <= end) {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      const dateStr = `${yyyy}-${mm}-${dd}`;
      const key = `${normEmp}_${dateStr}`;

      const existing = map.get(key);
      const notesText = req.type === "permission"
        ? (req.reason ? `إذن: ${req.reason}` : "إذن خروج معتمد")
        : req.type === "sick"
        ? `إجازة مرضية: ${req.reason || "تقرير طبي"}`
        : req.type === "casual"
        ? `إجازة عارضة: ${req.reason || "ظرف طارئ"}`
        : req.type === "annual" || req.type === "regular"
        ? `إجازة اعتيادية: ${req.reason || "رصيد سنوي"}`
        : (req.reason ? `إجازة (${req.type}): ${req.reason}` : "إجازة معتمدة");

      if (!existing) {
        map.set(key, ensureSanitizedRecord({
          id: `rec-leave-${normEmp}-${dateStr}`,
          employeeId: rawEmp,
          date: dateStr,
          status: "on_leave",
          leaveType: req.type,
          workHours: 0,
          lateMinutes: 0,
          earlyLeaveMinutes: 0,
          overtimeHours: 0,
          notes: notesText,
          verifiedByFace: true,
          updatedAt: new Date().toISOString()
        }));
      } else if (!existing.checkIn && existing.status !== "on_leave") {
        map.set(key, ensureSanitizedRecord({
          ...existing,
          status: "on_leave",
          leaveType: req.type,
          notes: existing.notes ? `${existing.notes} | ${notesText}` : notesText,
          updatedAt: new Date().toISOString()
        }));
      }

      d.setDate(d.getDate() + 1);
    }
  });

  return Array.from(map.values());
}

/**
 * Helper to parse updatedAt to timestamp ms
 */
function parseRecordMs(rec: any): number {
  if (!rec || !rec.updatedAt) return 0;
  const ms = Date.parse(rec.updatedAt);
  return isNaN(ms) ? 0 : ms;
}

/**
 * Merge attendance records safely without losing historical data, checkouts, or admin edits.
 * Uses updatedAt versioning so newer edits always win over stale cached records.
 */
export function mergeAttendanceRecords(existing: AttendanceRecord[] = [], incoming: AttendanceRecord[] = []): AttendanceRecord[] {
  const map = new Map<string, AttendanceRecord>();

  const processRecord = (r: AttendanceRecord) => {
    if (!r) return;
    const sanitizedInput = ensureSanitizedRecord(r);
    const rawEmpId = sanitizedInput.employeeId ? String(sanitizedInput.employeeId).trim() : '';
    const normEmpId = rawEmpId.toLowerCase();
    const date = sanitizedInput.date ? String(sanitizedInput.date).trim() : '';
    const canonicalId = (normEmpId && date) ? `rec-${normEmpId}-${date}` : sanitizedInput.id;
    const key = (normEmpId && date) ? `${normEmpId}_${date}` : canonicalId;
    if (!key) return;

    const old = map.get(key);
    if (!old) {
      map.set(key, {
        ...sanitizedInput,
        id: canonicalId,
        employeeId: rawEmpId || sanitizedInput.employeeId,
        updatedAt: sanitizedInput.updatedAt || new Date().toISOString()
      });
    } else {
      const oldTime = parseRecordMs(old);
      const newTime = parseRecordMs(sanitizedInput);

      // Check-in preservation: Never lose checkIn
      const checkIn = (sanitizedInput.checkIn && typeof sanitizedInput.checkIn === 'string' && sanitizedInput.checkIn.trim() !== '')
        ? sanitizedInput.checkIn
        : (old.checkIn || undefined);

      // Check-out preservation: If either has checkout, preserve it unless explicitly cancelled
      const isExplicitCancel = sanitizedInput._isExplicitCancelCheckOut === true || old._isExplicitCancelCheckOut === true;
      let checkOut: string | undefined = undefined;
      if (!isExplicitCancel) {
        if (sanitizedInput.checkOut && typeof sanitizedInput.checkOut === 'string' && sanitizedInput.checkOut.trim() !== '') {
          checkOut = sanitizedInput.checkOut;
        } else if (old.checkOut && typeof old.checkOut === 'string' && old.checkOut.trim() !== '') {
          checkOut = old.checkOut;
        }
      }

      const breakStart = sanitizedInput.breakStart !== undefined && sanitizedInput.breakStart !== null ? sanitizedInput.breakStart : old.breakStart;
      const breakEnd = sanitizedInput.breakEnd !== undefined && sanitizedInput.breakEnd !== null ? sanitizedInput.breakEnd : old.breakEnd;

      const baseRec = newTime >= oldTime ? { ...old, ...sanitizedInput } : { ...sanitizedInput, ...old };

      // Calculate workHours correctly
      let workHours = isExplicitCancel ? 0 : (baseRec.workHours || 0);
      if (checkIn && checkOut && (!workHours || workHours === 0)) {
        workHours = calculateRecordWorkHours({ ...baseRec, checkIn, checkOut, breakStart, breakEnd });
      }

      const lateMinutes = baseRec.lateMinutes !== undefined && baseRec.lateMinutes !== null ? baseRec.lateMinutes : (old.lateMinutes || 0);
      const lateSeconds = baseRec.lateSeconds !== undefined && baseRec.lateSeconds !== null ? baseRec.lateSeconds : (old.lateSeconds || 0);
      const earlyLeaveMinutes = isExplicitCancel ? 0 : (baseRec.earlyLeaveMinutes !== undefined && baseRec.earlyLeaveMinutes !== null ? baseRec.earlyLeaveMinutes : (old.earlyLeaveMinutes || 0));
      const overtimeHours = baseRec.overtimeHours !== undefined && baseRec.overtimeHours !== null ? baseRec.overtimeHours : (old.overtimeHours || 0);

      const isExcused = sanitizedInput.isExcused !== undefined ? sanitizedInput.isExcused : old.isExcused;
      const excusedReason = isExcused === false ? undefined : (sanitizedInput.excusedReason || old.excusedReason);
      const excusedBy = isExcused === false ? undefined : (sanitizedInput.excusedBy || old.excusedBy);
      const leaveType = sanitizedInput.leaveType || old.leaveType;

      let notes = old.notes || '';
      if (sanitizedInput.notes && typeof sanitizedInput.notes === 'string') {
        const trimmed = sanitizedInput.notes.trim();
        if (trimmed && !notes.includes(trimmed)) {
          notes = notes ? `${notes} | ${trimmed}` : trimmed;
        }
      }

      let status = baseRec.status;
      if (isExplicitCancel) {
        status = (lateMinutes > 0) ? 'late' : 'in_progress';
      } else if (checkOut) {
        if (!status || status === 'in_progress' || status === 'absent' || status === 'weekend') {
          status = (lateMinutes > 0) ? 'late' : (earlyLeaveMinutes > 0 ? 'early_leave' : 'on_time');
        }
      } else if (checkIn) {
        if (!status || status === 'absent' || status === 'weekend') {
          status = (lateMinutes > 0) ? 'late' : 'in_progress';
        }
      }

      const mergedRec = ensureSanitizedRecord({
        ...baseRec,
        id: canonicalId,
        employeeId: rawEmpId || old.employeeId,
        checkIn,
        checkOut,
        breakStart,
        breakEnd,
        workHours,
        overtimeHours,
        lateMinutes,
        lateSeconds,
        earlyLeaveMinutes,
        isExcused,
        excusedReason,
        excusedBy,
        leaveType,
        notes,
        status,
        _isExplicitCancelCheckOut: isExplicitCancel ? true : undefined,
        updatedAt: sanitizedInput.updatedAt || old.updatedAt || new Date().toISOString()
      });

      map.set(key, mergedRec);
    }
  };

  for (const r of existing) processRecord(r);
  for (const r of incoming) processRecord(r);

  return Array.from(map.values()).map(ensureSanitizedRecord).sort((a, b) => {
    if (b.date !== a.date) return (b.date || '').localeCompare(a.date || '');
    return (a.employeeId || '').localeCompare(b.employeeId || '');
  });
}

/**
 * Merge two arrays by unique item id, preserving local updates and incorporating incoming updates
 */
export function mergeByUniqueId<T extends { id: string; avatar?: string; _isPhotoRemoved?: boolean; status?: any; reviewNotes?: any; reviewedBy?: any; attachmentUrl?: any; attachmentName?: any }>(
  existing: T[] = [],
  incoming: T[] = []
): T[] {
  const map = new Map<string, T>();
  for (const item of existing) {
    if (item && item.id) map.set(item.id, { ...item });
  }
  for (const item of incoming) {
    if (item && item.id) {
      const old = map.get(item.id);
      if (!old) {
        map.set(item.id, { ...item });
      } else {
        const updatedStatus = (item.status && item.status !== 'pending')
          ? item.status
          : (old.status || 'pending');

        let avatar = item.avatar;
        if (item._isPhotoRemoved) {
          avatar = '';
        } else if ((!avatar || avatar.trim() === '') && old.avatar && old.avatar.trim() !== '') {
          avatar = old.avatar;
        }

        map.set(item.id, {
          ...old,
          ...item,
          status: updatedStatus,
          reviewNotes: item.reviewNotes || old.reviewNotes,
          reviewedBy: item.reviewedBy || old.reviewedBy,
          attachmentUrl: item.attachmentUrl || old.attachmentUrl,
          attachmentName: item.attachmentName || old.attachmentName,
          avatar: avatar !== undefined ? avatar : (old.avatar || ''),
        });
      }
    }
  }
  return Array.from(map.values());
}


export function formatHoursToHHMM(hours?: number | null | string): string {
  if (hours === undefined || hours === null || isNaN(Number(hours))) return '--:--';
  const val = Number(hours);
  if (val < 0) return '00:00';
  const totalMinutes = Math.round(val * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function generateCSVString(
  data: AttendanceRecord[] | Record<string, any>[], 
  getEmpName?: ((id: string) => string)
): string {
  let csvContent = '﻿';
  if (data.length === 0) return csvContent;
  const firstItem = data[0];
  if (typeof firstItem === 'object' && !('employeeId' in firstItem)) {
    const headers = Object.keys(firstItem);
    const rows = (data as Record<string, any>[]).map(row => 
      headers.map(h => `"${String(row[h] ?? '').replace(/"/g, '""')}"`).join(',')
    );
    csvContent += [headers.join(','), ...rows].join('\n');
  } else {
    const headers = ['التاريخ', 'اسم الموظف', 'الحضور', 'الانصراف', 'ساعات العمل', 'العمل الإضافي', 'تأخير (بالدقائق)', 'الحالة'];
    const rows = (data as AttendanceRecord[]).map(r => [
      toWesternDigits(r.date),
      `"${getEmpName ? getEmpName(r.employeeId) : r.employeeId}"`,
      formatTime(r.checkIn ?? undefined),
      formatTime(r.checkOut ?? undefined),
      toWesternDigits(r.workHours?.toFixed(1) || '0'),
      toWesternDigits(r.overtimeHours?.toFixed(1) || '0'),
      toWesternDigits(r.lateMinutes || 0),
      getStatusText(r.status, 'ar')
    ]);
    csvContent += [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
  }
  return csvContent;
}
export function exportToExcel(
  data: AttendanceRecord[] | Record<string, any>[],
  fileName: string = `attendance_report_${getTodayString()}.xlsx`
) {
  if (!data || data.length === 0) return;

  const firstItem = data[0];

  let rows: Record<string, any>[];

  // لو البيانات بالفعل عبارة عن تقرير Overall
  if (
    typeof firstItem === 'object' &&
    !('employeeId' in firstItem)
  ) {
    rows = data as Record<string, any>[];
  } else {
    // تحويل AttendanceRecord إلى بيانات Excel
    rows = (data as AttendanceRecord[]).map(r => ({
      'التاريخ': toWesternDigits(r.date || ''),
      'اسم الموظف': r.employeeId || '',
      'الحضور': formatTime(r.checkIn ?? undefined),
      'الانصراف': formatTime(r.checkOut ?? undefined),
      'ساعات العمل': Number(r.workHours || 0).toFixed(1),
      'العمل الإضافي': Number(r.overtimeHours || 0).toFixed(1),
      'التأخير بالدقائق': Number(r.lateMinutes || 0),
      'الانصراف المبكر بالدقائق': Number(r.earlyLeaveMinutes || 0),
      'الحالة': getStatusText(
        r.status,
        'ar',
        r.leaveType,
        r.notes
      ),
    }));
  }

  const worksheet = XLSX.utils.json_to_sheet(rows);

  // ضبط عرض الأعمدة
  const columnWidths = Object.keys(rows[0]).map(key => ({
    wch: Math.max(
      key.length + 2,
      ...rows.map(row =>
        String(row[key] ?? '').length + 2
      )
    ),
  }));

  worksheet['!cols'] = columnWidths;

  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    workbook,
    worksheet,
    'Monthly Report'
  );

  XLSX.writeFile(workbook, fileName);
}
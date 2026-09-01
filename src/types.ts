export type Language = 'ar' | 'en';

export type Role = 'leader' | 'employee' | 'admin';

export type PunchType = 'check_in' | 'check_out' | 'break_start' | 'break_end';

export type AttendanceStatus = 
  | 'on_time' 
  | 'late' 
  | 'early_leave' 
  | 'overtime' 
  | 'absent' 
  | 'on_leave'
  | 'in_progress'
  | 'weekend';

export type LeaveType = 
  | 'annual' 
  | 'casual' 
  | 'regular'
  | 'sick' 
  | 'permission' 
  | 'maternity' 
  | 'paternity' 
  | 'study' 
  | 'hajj' 
  | 'emergency';

export type LeaveStatus = 'pending' | 'approved' | 'rejected';

export type NotificationType = 
  | 'leave_requested' 
  | 'leave_approved' 
  | 'leave_rejected' 
  | 'overtime_requested' 
  | 'overtime_approved' 
  | 'overtime_rejected' 
  | 'shift_changed' 
  | 'admin_notice';

export interface Shift {
  id: string;
  nameAr: string;
  nameEn: string;
  startTime: string; // e.g. "09:00"
  endTime: string;   // e.g. "17:00"
  durationMinutes?: number;
  gracePeriodMinutes: number; // e.g. 0 mins
  workDays: number[]; // 0 = Sun, 1 = Mon, ...
}

export interface Employee {
  id: string;
  code: string; // e.g. "EMP001"
  nameAr: string;
  nameEn: string;
  avatar: string;
  email: string;
  phone: string;
  department: string;
  jobTitleAr: string;
  jobTitleEn: string;
  shiftId: string;
  pin: string; // PIN or Password (e.g. "Tech_123")
  role?: Role;
  joinedDate: string;
  status: 'active' | 'inactive';
  teamLeaderId?: string;
  teamId?: string;
  annualLeaveBalance?: number;
  casualLeaveBalance?: number;
  regularLeaveBalance?: number;
  sickLeaveBalance?: number;
  _isPhotoRemoved?: boolean;
}

export interface BreakLog {
  id: string;
  type: 'prayer' | 'lunch' | 'rest' | 'wc' | 'other';
  typeAr: string;
  startTime: string; // e.g. "12:15:00"
  endTime?: string;
  durationSeconds?: number;
}

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  date: string; // YYYY-MM-DD
  checkIn?: string | null; // HH:mm:ss or 12h formatted
  checkOut?: string | null; // HH:mm:ss
  breakStart?: string;
  breakEnd?: string;
  breaks?: BreakLog[];
  totalBreakSeconds?: number;
  location?: string;
  deviceInfo?: string;
  lateMinutes: number;
  lateSeconds?: number;
  earlyLeaveMinutes: number;
  workHours: number; // calculated hours
  overtimeHours: number;
  status: AttendanceStatus;
  leaveType?: LeaveType;
  notes?: string;
  verifiedByFace?: boolean;
  isExcused?: boolean;
  excusedBy?: string;
  excusedReason?: string;
  updatedAt?: string;
  _isExplicitCancelCheckOut?: boolean;
}

export type PermissionSlot = 'first_half' | 'second_half' | 'custom';

export interface LeaveRequest {
  id: string;
  employeeId: string;
  type: LeaveType;
  startDate: string;
  endDate: string;
  reason: string;
  status: LeaveStatus;
  createdAt: string;
  updatedAt?: string;
  hours?: number; // Duration in hours (max 2 hours for permissions)
  permissionSlot?: PermissionSlot; // 'first_half' (نصف اليوم الأول - حتى 11:00 ص), 'second_half' (نصف اليوم الثاني - من 3:00 م), 'custom'
  attachmentUrl?: string; // Medical report image / document URL (صورة التقرير الطبي)
  attachmentName?: string;
  reviewedBy?: string;
  reviewNotes?: string;
}

export interface OfficialHoliday {
  id: string;
  nameAr: string;
  nameEn?: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  daysCount: number;
  type: 'national' | 'religious' | 'official';
}

export interface Department {
  id: string;
  nameAr: string;
  nameEn: string;
  managerName: string;
}

export interface UrgentNotice {
  id: string;
  title: string;
  message: string;
  updatedAt: string;
  active: boolean;
  authorName?: string;
}

export interface Notification {
  id: string;
  recipientId: string;
  type: NotificationType;
  title: string;
  message: string;
  relatedEmployeeId?: string;
  relatedLeaveId?: string;
  relatedOvertimeId?: string;
  isRead: boolean;
  createdAt: string;
  updatedAt: string;
}


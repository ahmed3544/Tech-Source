export type Language = 'ar' | 'en';

export type Role = 'leader' | 'employee' | 'admin';

export type PunchType = 'check_in' | 'check_out' | 'break_start' | 'break_end';

export type AttendanceStatus = 'on_time' | 'late' | 'early_leave' | 'overtime' | 'absent' | 'on_leave' | 'in_progress' | 'weekend';
export type LeaveType = 'annual' | 'casual' | 'regular' | 'sick' | 'permission' | 'maternity' | 'paternity' | 'study' | 'hajj' | 'emergency';
export type LeaveStatus = 'pending' | 'approved' | 'rejected';
export type NotificationType = 'leave_requested' | 'leave_approved' | 'leave_rejected' | 'overtime_requested' | 'overtime_approved' | 'overtime_rejected' | 'shift_changed' | 'shift_swap_requested' | 'shift_swap_accepted' | 'shift_swap_rejected' | 'admin_notice';

export interface ShiftBreak { id:string; nameAr:string; nameEn:string; startTime:string; endTime:string; durationMinutes?:number; }
export interface Shift { id:string; nameAr:string; nameEn:string; startTime:string; endTime:string; startDate?:string; endDate?:string; durationMinutes?:number; gracePeriodMinutes:number; workDays:number[]; breaks?:ShiftBreak[]; }
export interface DailyShiftAssignment { employeeId:string; date:string; shiftId:string; isOffDay?:boolean; assignedBy?:string; updatedAt:string; }
export type ShiftSwapStatus = 'awaiting_target' | 'pending' | 'approved' | 'rejected';
export interface ShiftSwapRequest { id:string; requesterId:string; targetEmployeeId:string; date:string; requesterShiftId:string; targetShiftId:string; status:ShiftSwapStatus; createdAt:string; reviewedBy?:string; reviewedAt?:string; targetRespondedAt?:string; }
export interface Employee { id:string; code:string; nameAr:string; nameEn:string; avatar:string; email:string; phone:string; department:string; jobTitleAr:string; jobTitleEn:string; shiftId:string; pin:string; role?:Role; joinedDate:string; status:'active'|'inactive'; teamLeaderId?:string; teamId?:string; annualLeaveBalance?:number; casualLeaveBalance?:number; regularLeaveBalance?:number; sickLeaveBalance?:number; _isPhotoRemoved?:boolean; }
export interface BreakLog { id:string; type:'prayer'|'lunch'|'rest'|'wc'|'other'; typeAr:string; startTime:string; endTime?:string; durationSeconds?:number; }
export interface AttendanceRecord { id:string; employeeId:string; date:string; checkIn?:string|null; checkOut?:string|null; breakStart?:string; breakEnd?:string; breaks?:BreakLog[]; totalBreakSeconds?:number; location?:string; deviceInfo?:string; lateMinutes:number; lateSeconds?:number; earlyLeaveMinutes:number; workHours:number; overtimeHours:number; status:AttendanceStatus; leaveType?:LeaveType; notes?:string; verifiedByFace?:boolean; isExcused?:boolean; excusedBy?:string; excusedReason?:string; updatedAt?:string; _isExplicitCancelCheckOut?:boolean; }
export type PermissionSlot = 'first_half'|'second_half'|'custom';
export interface LeaveRequest { id:string; employeeId:string; type:LeaveType; startDate:string; endDate:string; reason:string; status:LeaveStatus; createdAt:string; updatedAt?:string; hours?:number; permissionSlot?:PermissionSlot; attachmentUrl?:string; attachmentName?:string; reviewedBy?:string; reviewNotes?:string; }
export interface OfficialHoliday { id:string; nameAr:string; nameEn?:string; startDate:string; endDate:string; daysCount:number; type:'national'|'religious'|'official'; }
export interface Department { id:string; nameAr:string; nameEn:string; managerName:string; }
export interface UrgentNotice { id:string; title:string; message:string; updatedAt:string; active:boolean; authorName?:string; }

export interface Notification {
  id:string;
  recipientId:string;
  type:NotificationType;
  title:string;
  message:string;
  relatedEmployeeId?:string;
  relatedLeaveId?:string;
  relatedOvertimeId?:string;
  relatedShiftSwapId?:string;
  /** SPA target generated from the notification relation. */
  link?:string;
  targetUrl?:string;
  isRead:boolean;
  createdAt:string;
  updatedAt:string;
}

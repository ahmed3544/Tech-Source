import {
  pgTable,
  text,
  integer,
  timestamp,
  boolean,
  uniqueIndex,
  jsonb,
  real
} from 'drizzle-orm/pg-core';

export const employees = pgTable('employees', {
  id: text('id').primaryKey(),
  code: text('code'),
  nameAr: text('name_ar').notNull(),
  nameEn: text('name_en').notNull(),
  avatar: text('avatar'),
  email: text('email'),
  phone: text('phone'),
  department: text('department'),
  jobTitleAr: text('job_title_ar'),
  jobTitleEn: text('job_title_en'),
  shiftId: text('shift_id'),
  pin: text('pin'),
  role: text('role'),
  joinedDate: text('joined_date'),
  status: text('status'),
  annualLeaveBalance: real('annual_leave_balance'),
  casualLeaveBalance: real('casual_leave_balance'),
  regularLeaveBalance: real('regular_leave_balance'),
  sickLeaveBalance: real('sick_leave_balance'),
  isPhotoRemoved: boolean('is_photo_removed'),
});

export const attendanceRecords = pgTable('attendance_records', {
  id: text('id').primaryKey(),
  employeeId: text('employee_id').notNull(),
  date: text('date').notNull(),
  checkIn: text('check_in'),
  checkOut: text('check_out'),
  breakStart: text('break_start'),
  breakEnd: text('break_end'),
  breaks: jsonb('breaks'),
  totalBreakSeconds: integer('total_break_seconds'),
  location: text('location'),
  deviceInfo: text('device_info'),
  lateMinutes: integer('late_minutes').default(0),
  lateSeconds: integer('late_seconds').default(0),
  earlyLeaveMinutes: integer('early_leave_minutes').default(0),
  workHours: real('work_hours').default(0),
  overtimeHours: real('overtime_hours').default(0),
  minusHours: real('minus_hours').default(0),
  status: text('status'),
  leaveType: text('leave_type'),
  notes: text('notes'),
  verifiedByFace: boolean('verified_by_face'),
  isExcused: boolean('is_excused'),
  excusedBy: text('excused_by'),
  excusedReason: text('excused_reason'),
  updatedAt: text('updated_at'),
  isExplicitCancelCheckOut: boolean('is_explicit_cancel_check_out'),
}, (table) => [
  uniqueIndex('employee_date_idx').on(table.employeeId, table.date)
]);

export const leaveRequests = pgTable('leave_requests', {
  id: text('id').primaryKey(),
  employeeId: text('employee_id').notNull(),
  type: text('type'),
  startDate: text('start_date'),
  endDate: text('end_date'),
  reason: text('reason'),
  status: text('status'),
  createdAt: text('created_at'),
  hours: integer('hours'),
  permissionSlot: text('permission_slot'),
  attachmentUrl: text('attachment_url'),
  attachmentName: text('attachment_name'),
  reviewedBy: text('reviewed_by'),
  reviewNotes: text('review_notes'),
});

export const overtimeRequests = pgTable('overtime_requests', {
  id: text('id').primaryKey(),
  employeeId: text('employee_id').notNull(),
  date: text('date').notNull(),
  type: text('type').notNull(), // overtime or short_time
  durationSeconds: integer('duration_seconds').notNull(), 
  reason: text('reason'),
  status: text('status').default('pending'), // pending, approved, rejected
  reviewedBy: text('reviewed_by'),
  reviewNotes: text('review_notes'),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});

export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: jsonb('value'),
});

export const shifts = pgTable('shifts', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  startTime: text('start_time').notNull(),
  endTime: text('end_time').notNull(),
  durationMinutes: integer('duration_minutes').notNull(),
  breakMinutes: integer('break_minutes').default(0),
  gracePeriodMinutes: integer('grace_period_minutes').default(0),
  overtimeEnabled: boolean('overtime_enabled').default(false),
  isOvernight: boolean('is_overnight').default(false),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});

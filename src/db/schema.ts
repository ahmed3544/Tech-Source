import { pgTable, text, integer, boolean, jsonb, uniqueIndex } from 'drizzle-orm/pg-core';

export const employees = pgTable('employees', {
  id: text('id').primaryKey(),
  code: text('code').notNull(),
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
  role: text('role').notNull().default('employee'),
  joinedDate: text('joined_date'),
  status: text('status').default('active'),
  annualLeaveBalance: integer('annual_leave_balance').default(15),
  casualLeaveBalance: integer('casual_leave_balance').default(7),
  regularLeaveBalance: integer('regular_leave_balance').default(8),
  sickLeaveBalance: integer('sick_leave_balance').default(30),
  isPhotoRemoved: boolean('is_photo_removed').default(false),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
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
  location: jsonb('location'),
  deviceInfo: jsonb('device_info'),
  lateMinutes: integer('late_minutes'),
  lateSeconds: integer('late_seconds'),
  earlyLeaveMinutes: integer('early_leave_minutes'),
  workHours: text('work_hours'),
  overtimeHours: text('overtime_hours'),
  minusHours: text('minus_hours'),
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
  // Keep this table compatible with the existing production database.
  // Some deployments predate the updated_at column, so leave sync must not
  // make reads/writes depend on it being present.
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
  type: text('type').notNull(),
  durationSeconds: integer('duration_seconds').notNull(),
  reason: text('reason'),
  status: text('status').default('pending'),
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

export const employeeShiftAssignments = pgTable('employee_shift_assignments', {
  id: text('id').primaryKey(),
  employeeId: text('employee_id').notNull(),
  scheduleDate: text('schedule_date').notNull(),
  shiftTemplateId: text('shift_template_id'),
  customStartTime: text('custom_start_time'),
  customEndTime: text('custom_end_time'),
  durationMinutes: integer('duration_minutes').default(480),
  status: text('status').default('draft'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  version: integer('version').default(1),
}, (table) => [
  uniqueIndex('employee_shift_assignment_date_idx').on(table.employeeId, table.scheduleDate)
]);

export const rotationPatterns = pgTable('rotation_patterns', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  shiftIds: jsonb('shift_ids').notNull(),
  createdBy: text('created_by'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const rotationPatternItems = pgTable('rotation_pattern_items', {
  id: text('id').primaryKey(),
  patternId: text('pattern_id').notNull(),
  dayOffset: integer('day_offset').notNull(),
  shiftId: text('shift_id'),
  isOff: boolean('is_off').default(false),
});

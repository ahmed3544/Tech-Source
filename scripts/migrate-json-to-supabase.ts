import fs from 'fs';
import path from 'path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '../src/db/schema.js';
import * as dotenv from 'dotenv';
import { sql } from 'drizzle-orm';

dotenv.config();

const connectionString = process.env.SUPABASE_DB_URL;
if (!connectionString) {
  console.error("FATAL: SUPABASE_DB_URL is required to run migration.");
  process.exit(1);
}

const pool = new Pool({ connectionString, max: 2 });
const db = drizzle(pool, { schema });

const dataPath = path.join(process.cwd(), 'server_data.json');
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

async function migrate() {
  console.log('--- STARTING MIGRATION ---');

  if (data.employees && data.employees.length > 0) {
    console.log(`Migrating ${data.employees.length} employees...`);
    for (const emp of data.employees) {
      if (!emp || !emp.id) continue;
      await db.insert(schema.employees).values({
        id: String(emp.id),
        code: emp.code ? String(emp.code) : null,
        nameAr: String(emp.nameAr || 'Unknown'),
        nameEn: String(emp.nameEn || 'Unknown'),
        avatar: emp.avatar ? String(emp.avatar) : null,
        email: emp.email ? String(emp.email) : null,
        phone: emp.phone ? String(emp.phone) : null,
        department: emp.department ? String(emp.department) : null,
        jobTitleAr: emp.jobTitleAr ? String(emp.jobTitleAr) : null,
        jobTitleEn: emp.jobTitleEn ? String(emp.jobTitleEn) : null,
        shiftId: emp.shiftId ? String(emp.shiftId) : null,
        pin: emp.pin ? String(emp.pin) : null,
        role: emp.role ? String(emp.role) : null,
        joinedDate: emp.joinedDate ? String(emp.joinedDate) : null,
        status: emp.status ? String(emp.status) : null,
        annualLeaveBalance: emp.annualLeaveBalance || 0,
        casualLeaveBalance: emp.casualLeaveBalance || 0,
        regularLeaveBalance: emp.regularLeaveBalance || 0,
        sickLeaveBalance: emp.sickLeaveBalance || 0,
        isPhotoRemoved: !!emp._isPhotoRemoved
      }).onConflictDoNothing();
    }
  }

  if (data.attendanceRecords && data.attendanceRecords.length > 0) {
    console.log(`Migrating ${data.attendanceRecords.length} attendance records...`);
    for (const rec of data.attendanceRecords) {
      if (!rec || !rec.employeeId || !rec.date) continue;
      const canonicalId = `rec-${String(rec.employeeId).toLowerCase()}-${rec.date}`;
      
      await db.insert(schema.attendanceRecords).values({
        id: canonicalId,
        employeeId: String(rec.employeeId),
        date: String(rec.date),
        checkIn: rec.checkIn || null,
        checkOut: rec.checkOut || null,
        breakStart: rec.breakStart || null,
        breakEnd: rec.breakEnd || null,
        breaks: rec.breaks ? rec.breaks : null,
        totalBreakSeconds: rec.totalBreakSeconds || 0,
        location: rec.location || null,
        deviceInfo: rec.deviceInfo || null,
        lateMinutes: rec.lateMinutes || 0,
        lateSeconds: rec.lateSeconds || 0,
        earlyLeaveMinutes: rec.earlyLeaveMinutes || 0,
        workHours: rec.workHours || 0,
        overtimeHours: rec.overtimeHours || 0,
        status: rec.status || 'in_progress',
        leaveType: rec.leaveType || null,
        notes: rec.notes || null,
        verifiedByFace: !!rec.verifiedByFace,
        isExcused: !!rec.isExcused,
        excusedBy: rec.excusedBy || null,
        excusedReason: rec.excusedReason || null,
        updatedAt: rec.updatedAt || new Date().toISOString(),
        isExplicitCancelCheckOut: !!rec._isExplicitCancelCheckOut
      }).onConflictDoUpdate({
        target: [schema.attendanceRecords.employeeId, schema.attendanceRecords.date],
        set: {
          checkIn: sql`COALESCE(attendance_records.check_in, EXCLUDED.check_in)`,
          checkOut: sql`COALESCE(attendance_records.check_out, EXCLUDED.check_out)`,
          breakStart: sql`COALESCE(attendance_records.break_start, EXCLUDED.break_start)`,
          breakEnd: sql`COALESCE(attendance_records.break_end, EXCLUDED.break_end)`,
          updatedAt: sql`EXCLUDED.updated_at`
        }
      });
    }
  }

  if (data.leaveRequests && data.leaveRequests.length > 0) {
    console.log(`Migrating ${data.leaveRequests.length} leave requests...`);
    for (const leave of data.leaveRequests) {
      if (!leave || !leave.id || !leave.employeeId) continue;
      await db.insert(schema.leaveRequests).values({
        id: String(leave.id),
        employeeId: String(leave.employeeId),
        type: leave.type || null,
        startDate: leave.startDate || null,
        endDate: leave.endDate || null,
        reason: leave.reason || null,
        status: leave.status || 'pending',
        createdAt: leave.createdAt || new Date().toISOString(),
        hours: leave.hours || null,
        permissionSlot: leave.permissionSlot || null,
        attachmentUrl: leave.attachmentUrl || null,
        attachmentName: leave.attachmentName || null,
        reviewedBy: leave.reviewedBy || null,
        reviewNotes: leave.reviewNotes || null,
      }).onConflictDoNothing();
    }
  }

  if (data.overtimeRequests && data.overtimeRequests.length > 0) {
    console.log(`Migrating ${data.overtimeRequests.length} overtime requests...`);
    for (const ov of data.overtimeRequests) {
      if (!ov || !ov.id || !ov.employeeId) continue;
      await db.insert(schema.overtimeRequests).values({
        id: String(ov.id),
        employeeId: String(ov.employeeId),
        date: String(ov.date),
        type: String(ov.type),
        durationSeconds: ov.durationSeconds || 0,
        reason: ov.reason || null,
        status: ov.status || 'pending',
        reviewedBy: ov.reviewedBy || null,
        reviewNotes: ov.reviewNotes || null,
        createdAt: ov.createdAt || new Date().toISOString(),
        updatedAt: ov.updatedAt || new Date().toISOString(),
      }).onConflictDoNothing();
    }
  }

  // Migrate Settings
  const ignoreKeys = ['employees', 'attendanceRecords', 'leaveRequests', 'overtimeRequests', 'deletedEmployeeKeys', 'deletedAttendanceKeys', 'deletedLeaveKeys'];
  let settingsCount = 0;
  for (const key of Object.keys(data)) {
    if (!ignoreKeys.includes(key)) {
      settingsCount++;
      await db.insert(schema.settings).values({
        key: key,
        value: data[key]
      }).onConflictDoUpdate({
        target: schema.settings.key,
        set: { value: sql`EXCLUDED.value` }
      });
    }
  }
  console.log(`Migrated ${settingsCount} settings keys.`);

  console.log('--- MIGRATION COMPLETE ---');
  process.exit(0);
}

migrate().catch(err => {
  console.error("MIGRATION ERROR:", err);
  process.exit(1);
});

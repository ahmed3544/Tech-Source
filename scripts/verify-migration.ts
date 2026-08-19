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
  console.error("FATAL: SUPABASE_DB_URL is not set. Please set it in your .env file or environment secrets.");
  process.exit(1);
}

const pool = new Pool({ connectionString, max: 2 });
const db = drizzle(pool, { schema });

const dataPath = path.join(process.cwd(), 'server_data.json');
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

async function verify() {
  console.log('==================================================');
  console.log('MIGRATION AUDIT REPORT');
  console.log('==================================================\n');

  let allPass = true;

  // 1. Employees
  const jsonEmployees = data.employees ? data.employees.length : 0;
  const dbEmployeesRes = await db.select({ count: sql<number>`count(*)` }).from(schema.employees);
  const dbEmployees = Number(dbEmployeesRes[0].count);
  console.log(`Employees:        JSON (${jsonEmployees}) | Supabase (${dbEmployees}) -> ${jsonEmployees === dbEmployees ? 'PASS' : 'FAIL'}`);
  if (jsonEmployees !== dbEmployees) allPass = false;

  // 2. Attendance
  const jsonAttendance = data.attendanceRecords ? data.attendanceRecords.length : 0;
  const dbAttendanceRes = await db.select({ count: sql<number>`count(*)` }).from(schema.attendanceRecords);
  const dbAttendance = Number(dbAttendanceRes[0].count);
  console.log(`Attendance:       JSON (${jsonAttendance}) | Supabase (${dbAttendance}) -> ${jsonAttendance === dbAttendance ? 'PASS' : 'FAIL'}`);
  if (jsonAttendance !== dbAttendance) allPass = false;

  // 3. Leaves
  const jsonLeaves = data.leaveRequests ? data.leaveRequests.length : 0;
  const dbLeavesRes = await db.select({ count: sql<number>`count(*)` }).from(schema.leaveRequests);
  const dbLeaves = Number(dbLeavesRes[0].count);
  console.log(`Leave Requests:   JSON (${jsonLeaves}) | Supabase (${dbLeaves}) -> ${jsonLeaves === dbLeaves ? 'PASS' : 'FAIL'}`);
  if (jsonLeaves !== dbLeaves) allPass = false;

  // 4. Overtime / Short Time (Excuses/Adjustments embedded)
  const jsonOvertime = data.overtimeRequests ? data.overtimeRequests.length : 0;
  const dbOvertimeRes = await db.select({ count: sql<number>`count(*)` }).from(schema.overtimeRequests);
  const dbOvertime = Number(dbOvertimeRes[0].count);
  console.log(`Overtime/Excuses: JSON (${jsonOvertime}) | Supabase (${dbOvertime}) -> ${jsonOvertime === dbOvertime ? 'PASS' : 'FAIL'}`);
  if (jsonOvertime !== dbOvertime) allPass = false;

  // 5. Settings
  const ignoreKeys = ['employees', 'attendanceRecords', 'leaveRequests', 'overtimeRequests', 'deletedEmployeeKeys', 'deletedAttendanceKeys', 'deletedLeaveKeys'];
  const jsonSettings = Object.keys(data).filter(k => !ignoreKeys.includes(k)).length;
  const dbSettingsRes = await db.select({ count: sql<number>`count(*)` }).from(schema.settings);
  const dbSettings = Number(dbSettingsRes[0].count);
  console.log(`Settings:         JSON (${jsonSettings}) | Supabase (${dbSettings}) -> ${jsonSettings === dbSettings ? 'PASS' : 'FAIL'}`);
  if (jsonSettings !== dbSettings) allPass = false;

  console.log('\n==================================================');
  if (allPass) {
    console.log('ZERO DATA LOSS AUDIT');
    console.log('==================================================');
    console.log(`Employees: PASS`);
    console.log(`Attendance: PASS`);
    console.log(`Leave Requests: PASS`);
    console.log(`Overtime/Excuses: PASS`);
    console.log(`Settings: PASS`);
    console.log('\n==================================================');
    console.log('MIGRATION SUCCESS');
    console.log('SUPABASE DATA VERIFIED');
    console.log('==================================================');
  } else {
    console.error('AUDIT FAILED: DATA MISMATCH DETECTED. DO NOT PROCEED TO PRODUCTION.');
  }
  
  process.exit(allPass ? 0 : 1);
}

verify().catch(err => {
  console.error("VERIFICATION ERROR:", err);
  process.exit(1);
});

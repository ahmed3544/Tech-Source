import * as dotenv from 'dotenv';
dotenv.config();
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '../src/db/schema.js';
import { eq, and } from 'drizzle-orm';

const connectionString = process.env.SUPABASE_DB_URL;
const pool = new Pool({ connectionString, max: 2 });
const db = drizzle(pool, { schema });

async function runTests() {
  console.log('--- RUNNING ATTENDANCE TESTS ---');
  
  // Use first employee
  const emps = await db.select().from(schema.employees).limit(1);
  if (!emps.length) throw new Error("No employees found");
  const empId = emps[0].id;
  const today = '2029-01-01'; // use a dummy future date so we don't mess up current real data
  const canonicalId = `rec-${empId.toLowerCase()}-${today}`;

  const sendPunch = async (action: string, time: string) => {
    const res = await fetch('http://127.0.0.1:3000/api/punch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employeeId: empId,
        action,
        nowTimeStr: time,
        record: { date: today }
      })
    });
    return res.json();
  };

  // TEST 1: Check-in
  console.log('\\nTEST 1: Check-in');
  const res1 = await sendPunch('check_in', '08:00');
  console.log(res1.record);
  if (res1.record.checkIn !== '08:00') throw new Error("Check-in failed");
  
  // TEST 2: Check-out
  console.log('\\nTEST 2: Check-out');
  const res2 = await sendPunch('check_out', '17:00');
  console.log(res2.record);
  if (res2.record.checkIn !== '08:00' || res2.record.checkOut !== '17:00') throw new Error("Check-out failed or erased check-in");

  // TEST 3: Direct DB verification
  console.log('\\nTEST 3: Direct DB Verification');
  const dbRecs = await db.select().from(schema.attendanceRecords).where(eq(schema.attendanceRecords.id, canonicalId));
  console.log(dbRecs[0]);
  if (dbRecs[0].checkIn !== '08:00' || dbRecs[0].checkOut !== '17:00') throw new Error("DB state mismatch");

  // Cleanup test record
  await db.delete(schema.attendanceRecords).where(eq(schema.attendanceRecords.id, canonicalId));
  console.log('\\nALL TESTS PASSED');
  process.exit(0);
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});

import { db } from '../src/db/index.js';
import * as schema from '../src/db/schema.js';

async function run() {
  try {
    const emps = await db.select().from(schema.employees);
    console.log("Employees Count:", emps.length);
    
    const recs = await db.select().from(schema.attendanceRecords);
    console.log("Records Count:", recs.length);
    
    // Check for duplicate employees
    const empIds = new Set();
    let duplicateEmps = 0;
    for (let e of emps) {
      if (empIds.has(e.id)) duplicateEmps++;
      empIds.add(e.id);
    }
    console.log("Duplicate Employee IDs:", duplicateEmps);
    
    // Check for duplicate attendance
    const recKeys = new Set();
    let duplicateRecs = 0;
    for (let r of recs) {
      const key = r.employeeId + "_" + r.date;
      if (recKeys.has(key)) duplicateRecs++;
      recKeys.add(key);
    }
    console.log("Duplicate Attendance Keys (employee + date):", duplicateRecs);
    
    const leaves = await db.select().from(schema.leaveRequests);
    console.log("Leaves Count:", leaves.length);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
run();

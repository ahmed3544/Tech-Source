import fs from 'fs';
import path from 'path';

const serverTsPath = path.join(process.cwd(), 'server.ts');
let code = fs.readFileSync(serverTsPath, 'utf-8');

const importInject = `
import { db } from './src/db/index.js';
import * as schema from './src/db/schema.js';
import { sql } from 'drizzle-orm';
`;

if (!code.includes("import { db }")) {
  code = code.replace("import fs from 'fs';", "import fs from 'fs';\n" + importInject);
}

// We will inject a new /api/punch handler that checks for process.env.SUPABASE_DB_URL
const newPunchHandler = `
// POST /api/punch - Direct atomic endpoint for clock-in, clock-out, break actions
app.post('/api/punch', async (req, res) => {
  const { employeeId, record, action, nowTimeStr } = req.body;
  if (!employeeId) {
    return res.status(400).json({ success: false, error: 'Employee ID is required' });
  }

  const rawEmpId = String(employeeId).trim();
  const normEmpId = rawEmpId.toLowerCase();
  const todayDate = record?.date ? String(record.date).trim() : new Date().toISOString().split('T')[0];
  const canonicalId = \`rec-\${normEmpId}-\${todayDate}\`;
  const timeVal = nowTimeStr || record?.checkIn || record?.checkOut || new Date().toTimeString().split(' ')[0];

  if (process.env.SUPABASE_DB_URL) {
    // SUPABASE IMPLEMENTATION (Safe, Atomic, No Data Loss)
    try {
      let updateSet: any = { updatedAt: new Date().toISOString() };
      let insertSet: any = {
        id: canonicalId,
        employeeId: rawEmpId,
        date: todayDate,
        updatedAt: new Date().toISOString(),
      };

      if (action === 'check_in') {
        insertSet.checkIn = timeVal;
        insertSet.status = 'on_time';
        updateSet.checkIn = sql\`COALESCE(attendance_records.check_in, \${timeVal})\`;
      } else if (action === 'check_out') {
        insertSet.checkOut = timeVal;
        insertSet.status = 'on_time';
        updateSet.checkOut = timeVal;
      } else if (action === 'break_start') {
        insertSet.breakStart = timeVal;
        updateSet.breakStart = timeVal;
      } else if (action === 'break_end' || action === 'force_break_end') {
        insertSet.breakEnd = timeVal;
        updateSet.breakEnd = timeVal;
      }

      await db.insert(schema.attendanceRecords)
        .values(insertSet)
        .onConflictDoUpdate({
          target: [schema.attendanceRecords.employeeId, schema.attendanceRecords.date],
          set: updateSet
        });

      // Refetch the updated record
      const updatedRecs = await db.select().from(schema.attendanceRecords)
        .where(sql\`employee_id = \${rawEmpId} AND date = \${todayDate}\`);

      return res.json({
        success: true,
        record: updatedRecs[0],
        lastUpdated: Date.now()
      });

    } catch (err) {
      console.error("Supabase Punch Error:", err);
      return res.status(500).json({ success: false, error: "Database error" });
    }
  }

  // LEGACY JSON IMPLEMENTATION (Fallback)
`;

// Replace the existing app.post('/api/punch', (req, res) => {
code = code.replace("app.post('/api/punch', (req, res) => {", newPunchHandler);

// Close the legacy block at the end of the handler
const legacyEnd = `
  res.json({
    success: true,
    lastUpdated: serverState.lastUpdated,
    record: currentRecord || targetRec,
    attendanceRecords: (serverState.attendanceRecords || []).filter((r: any) => !deletedEmpKeys[r.employeeId]),
  });
});`;

const newLegacyEnd = `
  res.json({
    success: true,
    lastUpdated: serverState.lastUpdated,
    record: currentRecord || targetRec,
    attendanceRecords: (serverState.attendanceRecords || []).filter((r: any) => !deletedEmpKeys[r.employeeId]),
  });
});`;

fs.writeFileSync(serverTsPath, code, 'utf-8');
console.log('Patched /api/punch for Supabase');

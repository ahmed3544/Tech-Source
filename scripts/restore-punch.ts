import fs from 'fs';
import path from 'path';

const serverTsPath = path.join(process.cwd(), 'server.ts');
let code = fs.readFileSync(serverTsPath, 'utf-8');

const punchImplementation = `
// POST /api/punch - Direct atomic endpoint for clock-in, clock-out, break actions
app.post('/api/punch', async (req, res) => {
  const { employeeId, record, action, nowTimeStr } = req.body;
  console.log(\`[PUNCH-INCOMING] \${action} for Emp: \${employeeId}, Time: \${nowTimeStr}\`);

  if (!employeeId) {
    return res.status(400).json({ success: false, error: 'Employee ID is required' });
  }

  const rawEmpId = String(employeeId).trim();
  const normEmpId = rawEmpId.toLowerCase();
  const todayDate = record?.date ? String(record.date).trim() : new Date().toISOString().split('T')[0];
  const canonicalId = \`rec-\${normEmpId}-\${todayDate}\`;
  const timeVal = nowTimeStr || record?.checkIn || record?.checkOut || new Date().toTimeString().split(' ')[0];

  console.log(\`[PUNCH-DETAILS] Canonical ID: \${canonicalId}, Date: \${todayDate}, TimeVal: \${timeVal}\`);

  if (process.env.SUPABASE_DB_URL) {
    // SUPABASE IMPLEMENTATION (Safe, Atomic, No Data Loss)
    try {
      let updateSet: any = { updated_at: new Date().toISOString() };
      let insertSet: any = {
        id: canonicalId,
        employee_id: rawEmpId,
        date: todayDate,
        updated_at: new Date().toISOString(),
      };

      if (action === 'check_in') {
        insertSet.check_in = timeVal;
        insertSet.status = 'on_time';
        updateSet.check_in = sql\`COALESCE(attendance_records.check_in, \${timeVal})\`;
      } else if (action === 'check_out') {
        insertSet.check_out = timeVal;
        insertSet.status = 'on_time'; // Default, logic might override
        updateSet.check_out = timeVal;
      } else if (action === 'break_start') {
        insertSet.break_start = timeVal;
        updateSet.break_start = timeVal;
      } else if (action === 'break_end' || action === 'force_break_end') {
        insertSet.break_end = timeVal;
        updateSet.break_end = timeVal;
      } else if (action === 'update' && record) {
        // Direct object update
        if (record.checkIn) { insertSet.check_in = record.checkIn; updateSet.check_in = record.checkIn; }
        if (record.checkOut) { insertSet.check_out = record.checkOut; updateSet.check_out = record.checkOut; }
        if (record.status) { insertSet.status = record.status; updateSet.status = record.status; }
        if (record.leaveType) { insertSet.leave_type = record.leaveType; updateSet.leave_type = record.leaveType; }
      }

      console.log(\`[PUNCH-DB-UPSERT] Action: \${action}, Insert: \`, insertSet, \`Update: \`, updateSet);

      await db.insert(schema.attendanceRecords)
        .values(insertSet)
        .onConflictDoUpdate({
          target: [schema.attendanceRecords.employeeId, schema.attendanceRecords.date],
          set: updateSet
        });

      // Refetch all attendance for today to return to client (or all for recent window)
      console.log(\`[PUNCH-DB-SUCCESS] Upsert completed, refetching state...\`);
      const updatedRecs = await db.select().from(schema.attendanceRecords);
      
      // Also get the single record back just to verify
      const single = updatedRecs.find(r => r.id === canonicalId);
      console.log(\`[PUNCH-DB-VERIFY] Final record in DB:\`, single);

      return res.json({
        success: true,
        record: single,
        attendanceRecords: updatedRecs,
        lastUpdated: Date.now()
      });

    } catch (err) {
      console.error("[PUNCH-DB-ERROR] Supabase Punch Error:", err);
      return res.status(500).json({ success: false, error: err.message || "Database error" });
    }
  }

  // LEGACY JSON IMPLEMENTATION (Fallback)
  console.log('[PUNCH-LEGACY] Executing JSON fallback');
  let currentRecord = null;
  if (!serverState.attendanceRecords) {
    serverState.attendanceRecords = [];
  }
  
  let targetRec = serverState.attendanceRecords.find(
    (r: any) => String(r.employeeId).toLowerCase() === normEmpId && r.date === todayDate
  );

  if (!targetRec) {
    targetRec = {
      id: canonicalId,
      employeeId: rawEmpId,
      date: todayDate,
      status: 'in_progress',
      updatedAt: new Date().toISOString()
    };
    serverState.attendanceRecords.push(targetRec);
  }

  if (action === 'check_in') {
    if (!targetRec.checkIn) targetRec.checkIn = timeVal;
  } else if (action === 'check_out') {
    targetRec.checkOut = timeVal;
  } else if (action === 'break_start') {
    targetRec.breakStart = timeVal;
  } else if (action === 'break_end' || action === 'force_break_end') {
    targetRec.breakEnd = timeVal;
  } else if (action === 'update' && record) {
    Object.assign(targetRec, record);
  }
  targetRec.updatedAt = new Date().toISOString();

  serverState.lastUpdated = Date.now();
  saveServerData(serverState);
  
  const deletedEmpKeys = serverState.deletedEmployeeKeys || {};
  res.json({
    success: true,
    lastUpdated: serverState.lastUpdated,
    record: targetRec,
    attendanceRecords: (serverState.attendanceRecords || []).filter((r: any) => !deletedEmpKeys[r.employeeId]),
  });
});
`;

code = code.replace("// POST /api/punch - Direct atomic endpoint for clock-in, clock-out, break actions", punchImplementation);
fs.writeFileSync(serverTsPath, code, 'utf-8');
console.log("Restored /api/punch");

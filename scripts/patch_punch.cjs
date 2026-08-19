const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const replacement = `
  if (process.env.SUPABASE_DB_URL) {
    try {
      const existingQuery = await db.select().from(schema.attendanceRecords).where(sql\`id = \${canonicalId}\`);
      let existingRecord = existingQuery.length > 0 ? existingQuery[0] : null;
      
      let newRecord = existingRecord ? { ...existingRecord } : {
        id: canonicalId,
        employeeId: rawEmpId,
        date: todayDate,
        updatedAt: new Date().toISOString()
      };
      
      if (action === 'check_in') {
        newRecord.checkIn = newRecord.checkIn || timeVal;
      } else if (action === 'check_out') {
        newRecord.checkOut = timeVal;
      } else if (action === 'break_start') {
        newRecord.breakStart = timeVal;
      } else if (action === 'break_end' || action === 'force_break_end') {
        newRecord.breakEnd = timeVal;
      } else if (action === 'update' && record) {
        if (record.checkIn !== undefined) newRecord.checkIn = record.checkIn;
        if (record.checkOut !== undefined) newRecord.checkOut = record.checkOut;
        if (record.status !== undefined) newRecord.status = record.status;
        if (record.leaveType !== undefined) newRecord.leaveType = record.leaveType;
        if (record.isExcused !== undefined) newRecord.isExcused = record.isExcused;
        if (record.excusedReason !== undefined) newRecord.excusedReason = record.excusedReason;
        if (record.excusedBy !== undefined) newRecord.excusedBy = record.excusedBy;
        if (record.notes !== undefined) newRecord.notes = record.notes;
        if (record.isExplicitCancelCheckOut !== undefined) newRecord.isExplicitCancelCheckOut = record.isExplicitCancelCheckOut;
      }

      // If user clears checkOut explicitly
      if (newRecord.checkOut === null || newRecord.isExplicitCancelCheckOut) {
         newRecord.checkOut = null;
         newRecord.workHours = 0;
         newRecord.overtimeHours = 0;
         newRecord.earlyLeaveMinutes = 0;
      }

      // Calculate everything properly
      const calculated = sanitizeRecordServer(newRecord);
      calculated.updatedAt = new Date().toISOString();

      // Upsert into Supabase
      await db.insert(schema.attendanceRecords)
        .values(calculated)
        .onConflictDoUpdate({
          target: [schema.attendanceRecords.employeeId, schema.attendanceRecords.date],
          set: calculated
        });
        
      const finalRecs = await db.select().from(schema.attendanceRecords);
      const single = finalRecs.find(r => r.id === canonicalId);
      
      return res.json({
        success: true,
        record: single,
        attendanceRecords: finalRecs,
        lastUpdated: Date.now()
      });
    } catch (err) {
      console.error("[PUNCH-DB-ERROR]", err);
      return res.status(500).json({ success: false, error: String(err) });
    }
  }
`;

const punchRegex = /if \(process\.env\.SUPABASE_DB_URL\) \{[\s\S]*?\/\/ LEGACY JSON IMPLEMENTATION \(Fallback\)/;
code = code.replace(punchRegex, replacement + '\n  // LEGACY JSON IMPLEMENTATION (Fallback)');
fs.writeFileSync('server.ts', code);

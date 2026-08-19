const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const regex = /\/\/ GET \/api\/data - Fetch current central state for sync[\s\S]*?\/\/ LEGACY JSON IMPLEMENTATION \(Fallback\)/;

const replacement = `// GET /api/data - Fetch current central state for sync
app.get('/api/data', async (req, res) => {
  if (process.env.SUPABASE_DB_URL) {
    try {
      const dbEmployees = await db.select().from(schema.employees);
      const dbAttendance = await db.select().from(schema.attendanceRecords);
      const dbLeaves = await db.select().from(schema.leaveRequests);
      const dbOvertime = await db.select().from(schema.overtimeRequests);
      
      return res.json({
        success: true,
        employees: dbEmployees,
        attendanceRecords: dbAttendance,
        leaveRequests: dbLeaves,
        overtimeRequests: dbOvertime,
        companyNameAr: serverState.companyNameAr || null,
        companyNameEn: serverState.companyNameEn || null,
        urgentNotice: serverState.urgentNotice !== undefined ? serverState.urgentNotice : null,
        lastUpdated: Date.now()
      });
    } catch (err) {
      console.error("Supabase Data Fetch Error:", err);
      return res.status(500).json({ success: false, error: "Database error" });
    }
  }

  if (!serverState.employees || serverState.employees.length === 0) {
    const current = loadServerData();
    if (current) {
      serverState = { ...current, ...serverState };
    }
  }
  if (serverState.leaveRequests && serverState.attendanceRecords) {
    serverState.attendanceRecords = ensureApprovedLeaveRecordsServer(serverState.attendanceRecords, serverState.leaveRequests);
  }
  const deletedEmpKeys = serverState.deletedEmployeeKeys || {};
  const cleanEmployees = (serverState.employees || []).filter(e => e && e.id && !deletedEmpKeys[e.id]);
  const cleanRecords = Array.isArray(serverState.attendanceRecords)
    ? serverState.attendanceRecords.filter(r => !deletedEmpKeys[r.employeeId])
    : [];
  const cleanLeaves = Array.isArray(serverState.leaveRequests)
    ? serverState.leaveRequests.filter(l => !deletedEmpKeys[l.employeeId])
    : [];
  const cleanOvertime = Array.isArray(serverState.overtimeRequests)
    ? serverState.overtimeRequests.filter(o => !deletedEmpKeys[o.employeeId])
    : [];
  res.json({
    success: true,
    employees: cleanEmployees,
    attendanceRecords: cleanRecords,
    leaveRequests: cleanLeaves,
    overtimeRequests: cleanOvertime,
    companyNameAr: serverState.companyNameAr || null,
    companyNameEn: serverState.companyNameEn || null,
    urgentNotice: serverState.urgentNotice !== undefined ? serverState.urgentNotice : null,
    lastUpdated: serverState.lastUpdated || Date.now(),
  });
});

// POST /api/sync - Full or partial state update from client
app.post('/api/sync', (req, res) => {
  const { employees, attendanceRecords, leaveRequests, companyNameAr, companyNameEn, urgentNotice, deletedAttendanceIds } = req.body;
  if (!serverState.deletedAttendanceKeys) serverState.deletedAttendanceKeys = {};

  if (Array.isArray(deletedAttendanceIds) && deletedAttendanceIds.length > 0) {
    const now = Date.now();
    deletedAttendanceIds.forEach(id => {
      const r = (serverState.attendanceRecords || []).find((rec: any) => rec.id === id);
      if (r && r.employeeId && r.date) {
        const empId = String(r.employeeId).trim().toLowerCase();
        serverState.deletedAttendanceKeys![\`\${empId}_\${r.date}\`] = now;
      }
    });
    const deleteSet = new Set(deletedAttendanceIds);
    serverState.attendanceRecords = (serverState.attendanceRecords || []).filter((r: any) => !deleteSet.has(r.id));
  }
  const deletedEmpKeys = serverState.deletedEmployeeKeys || {};
  if (Array.isArray(employees)) {
    serverState.employees = employees.filter(e => e && e.id && !deletedEmpKeys[e.id]);
  }
  if (Array.isArray(attendanceRecords)) {
    let cleanIncoming = attendanceRecords.filter(r => !deletedEmpKeys[r.employeeId]);
    if (Array.isArray(deletedAttendanceIds) && deletedAttendanceIds.length > 0) {
      const deleteSet = new Set(deletedAttendanceIds);
      cleanIncoming = cleanIncoming.filter(r => !deleteSet.has(r.id));
    }
    if (req.body.replaceAttendance) {
      serverState.attendanceRecords = cleanIncoming;
    } else {
      serverState.attendanceRecords = mergeAttendanceRecords(serverState.attendanceRecords || [], cleanIncoming);
    }
  }
  if (Array.isArray(leaveRequests)) {
    serverState.leaveRequests = leaveRequests.filter(l => !deletedEmpKeys[l.employeeId]);
  }
  if (companyNameAr !== undefined) serverState.companyNameAr = companyNameAr;
  if (companyNameEn !== undefined) serverState.companyNameEn = companyNameEn;
  if (urgentNotice !== undefined) serverState.urgentNotice = urgentNotice;
  
  if (serverState.leaveRequests && serverState.attendanceRecords) {
    serverState.attendanceRecords = ensureApprovedLeaveRecordsServer(serverState.attendanceRecords, serverState.leaveRequests);
  }
  serverState.lastUpdated = Date.now();
  saveServerData(serverState);
  res.json({ success: true, lastUpdated: serverState.lastUpdated });
});

app.post('/api/punch', async (req, res) => {
  const { employeeId, record, action, nowTimeStr } = req.body;
  if (!employeeId) return res.status(400).json({ success: false, error: 'Employee ID is required' });

  const rawEmpId = String(employeeId).trim();
  const normEmpId = rawEmpId.toLowerCase();
  const todayDate = record?.date ? String(record.date).trim() : new Date().toISOString().split('T')[0];
  const canonicalId = \`rec-\${normEmpId}-\${todayDate}\`;
  const timeVal = nowTimeStr || record?.checkIn || record?.checkOut || new Date().toTimeString().split(' ')[0];

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

      if (newRecord.checkOut === null || newRecord.isExplicitCancelCheckOut) {
         newRecord.checkOut = null;
         newRecord.workHours = 0;
         newRecord.overtimeHours = 0;
         newRecord.earlyLeaveMinutes = 0;
      }

      const calculated = sanitizeRecordServer(newRecord);
      calculated.updatedAt = new Date().toISOString();

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

  // LEGACY JSON IMPLEMENTATION (Fallback)`;

code = code.replace(regex, replacement);
fs.writeFileSync('server.ts', code);

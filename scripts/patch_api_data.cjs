const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const supabaseDataCode = `
app.get('/api/data', async (req, res) => {
  if (process.env.SUPABASE_DB_URL) {
    try {
      const dbEmployees = await db.select().from(schema.employees);
      const dbAttendance = await db.select().from(schema.attendanceRecords);
      const dbLeaves = await db.select().from(schema.leaveRequests);
      const dbOvertime = await db.select().from(schema.overtimeRequests);
      const dbNotifications = await db.select().from(schema.notifications);
      const dbShifts = await db.select().from(schema.shifts);
      const dbShiftAssignments = await db.select().from(schema.employeeShiftAssignments);
      const dbSettings = await db.select().from(schema.settings);

      const settingsMap = Object.fromEntries(
        dbSettings.map((row) => [String(row.key), row.value])
      );

      return res.json({
        success: true,
        employees: dbEmployees,
        attendanceRecords: dbAttendance,
        leaveRequests: dbLeaves,
        overtimeRequests: dbOvertime,
        notifications: dbNotifications,
        shifts: dbShifts,
        employeeShiftAssignments: dbShiftAssignments,
        companyNameAr: settingsMap.companyNameAr ?? serverState.companyNameAr ?? null,
        companyNameEn: settingsMap.companyNameEn ?? serverState.companyNameEn ?? null,
        urgentNotice: settingsMap.urgentNotice ?? (serverState.urgentNotice !== undefined ? serverState.urgentNotice : null),
        dailyShiftAssignments: settingsMap.dailyShiftAssignments ?? serverState.dailyShiftAssignments ?? {},
        lastUpdated: Date.now()
      });
    } catch (err) {
      console.error("Supabase Data Fetch Error:", err);
      return res.status(500).json({ success: false, error: "Database error" });
    }
  }
`;

code = code.replace("app.get('/api/data', (req, res) => {", supabaseDataCode);
fs.writeFileSync('server.ts', code);

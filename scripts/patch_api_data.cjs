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
`;

code = code.replace("app.get('/api/data', (req, res) => {", supabaseDataCode);
fs.writeFileSync('server.ts', code);

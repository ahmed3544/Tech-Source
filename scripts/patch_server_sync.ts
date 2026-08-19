import fs from 'fs';
import path from 'path';

const serverTsPath = path.join(process.cwd(), 'server.ts');
let code = fs.readFileSync(serverTsPath, 'utf-8');

const syncHandler = `
// POST /api/sync - Full or partial state update from client
app.post('/api/sync', async (req, res) => {
  if (process.env.SUPABASE_DB_URL) {
    // SUPABASE MODE: Do NOT allow bulk array overwrite from client to destroy data.
    // In a real system, we'd handle individual updates. For now, we return the DB state as authoritative.
    try {
      const dbEmployees = await db.select().from(schema.employees);
      const dbAttendance = await db.select().from(schema.attendanceRecords);
      const dbLeaves = await db.select().from(schema.leaveRequests);
      const dbOvertime = await db.select().from(schema.overtimeRequests);
      
      return res.json({
        success: true,
        lastUpdated: Date.now(),
        employees: dbEmployees,
        attendanceRecords: dbAttendance,
        leaveRequests: dbLeaves,
        overtimeRequests: dbOvertime,
      });
    } catch (err) {
      console.error("Supabase Sync Error:", err);
      return res.status(500).json({ success: false, error: "Database error" });
    }
  }

  // LEGACY JSON MODE
  const { employees, attendanceRecords, leaveRequests, companyNameAr, companyNameEn, urgentNotice, deletedAttendanceIds, deletedEmployeeIds, deletedLeaveIds } = req.body;
`;

code = code.replace("app.post('/api/sync', (req, res) => {", syncHandler.replace("app.post('/api/sync', async (req, res) => {", "app.post('/api/sync', (req, res) => {\n  // Replaced by async below").replace("// LEGACY JSON MODE", "// LEGACY JSON MODE\n"));
code = code.replace("app.post('/api/sync', (req, res) => {", "app.post('/api/sync', async (req, res) => {"); // Ensure it's async

fs.writeFileSync(serverTsPath, code, 'utf-8');
console.log('Patched /api/sync');

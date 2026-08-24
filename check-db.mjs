import 'dotenv/config';
import { Client } from 'pg';

const c = new Client({
  connectionString: process.env.SUPABASE_DB_URL
});

try {
  await c.connect();
  console.log("CONNECTION: OK");

  const tables = [
    "employees",
    "attendanceRecords",
    "leaveRequests",
    "overtimeRequests",
    "shifts",
    "settings"
  ];

  for (const table of tables) {
    try {
      const result = await c.query(`SELECT COUNT(*) FROM "${table}"`);
      console.log(`${table}: OK - ${result.rows[0].count}`);
    } catch (e) {
      console.log(`${table}: ERROR - ${e.message}`);
    }
  }
} catch (e) {
  console.log("CONNECTION ERROR:", e.message);
} finally {
  await c.end().catch(() => {});
}

import 'dotenv/config';
import { Client } from 'pg';

const c = new Client({
  connectionString: process.env.SUPABASE_DB_URL
});

try {
  await c.connect();

  const result = await c.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
    ORDER BY table_name
  `);

  console.log("TABLES IN SUPABASE:");
  for (const row of result.rows) {
    console.log(row.table_name);
  }
} catch (e) {
  console.error("ERROR:", e.message);
} finally {
  await c.end().catch(() => {});
}

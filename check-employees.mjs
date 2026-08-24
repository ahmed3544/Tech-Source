import 'dotenv/config';
import { Client } from 'pg';

const c = new Client({
  connectionString: process.env.SUPABASE_DB_URL
});

try {
  await c.connect();

  const r = await c.query(`
    SELECT id, code, name_ar, name_en, pin, status
    FROM employees
    ORDER BY id
  `);

  console.log(JSON.stringify(r.rows, null, 2));
} catch (e) {
  console.error("ERROR:", e.message);
} finally {
  await c.end().catch(() => {});
}

import "dotenv/config";
import { Client } from "pg";

const client = new Client({
  connectionString: process.env.SUPABASE_DB_URL,
});

try {
  await client.connect();

  const result = await client.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'employees'
    ORDER BY ordinal_position
  `);

  console.table(result.rows);
} catch (error) {
  console.error(error);
} finally {
  await client.end();
}
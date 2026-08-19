import { Client } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();

async function testConnection() {
  if (!process.env.SUPABASE_DB_URL) {
    console.error('ERROR: SUPABASE_DB_URL is not set.');
    process.exit(1);
  }
  const client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
  try {
    await client.connect();
    const res = await client.query('SELECT NOW()');
    console.log('SUCCESS: Connected to database at ' + res.rows[0].now);
    await client.end();
    process.exit(0);
  } catch (err) {
    console.error('ERROR: Could not connect to database');
    console.error(err);
    process.exit(1);
  }
}
testConnection();

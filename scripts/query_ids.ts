import { db } from '../src/db/index.js';
import * as schema from '../src/db/schema.js';

async function run() {
  const recs = await db.select().from(schema.attendanceRecords);
  console.log("Sample IDs in Supabase:", recs.slice(0, 5).map(r => r.id));
  process.exit(0);
}
run();

const { Client } = require('pg');

const SOURCE_URL = process.env.SUPABASE_DB_URL;
const TARGET_URL = process.env.DATABASE_URL;
const MIGRATION_KEY = 'supabase-to-neon-2026-09-09';

const TABLES = [
  'employees',
  'attendance_records',
  'leave_requests',
  'overtime_requests',
  'settings',
  'shifts',
  'employee_shift_assignments',
  'rotation_patterns',
  'rotation_pattern_items',
  'notifications',
  'notification_system_meta',
];

function normalizeJsonValue(value) {
  if (value == null) return null;

  // pg normally returns json/jsonb as native JS objects, but depending on the
  // source schema/driver a JSON value may arrive as a string. Never send a
  // raw string such as "شركة..." to a jsonb parameter: PostgreSQL would try
  // to parse it as JSON and fail. Preserve non-JSON source strings as valid
  // JSON strings instead of losing the source data.
  if (typeof value === 'string') {
    try {
      JSON.parse(value);
      return value;
    } catch {
      return JSON.stringify(value);
    }
  }

  return value;
}

async function main() {
  if (!SOURCE_URL || !TARGET_URL) {
    console.log('Supabase→Neon migration skipped: DATABASE_URL or SUPABASE_DB_URL is missing.');
    return;
  }

  if (SOURCE_URL === TARGET_URL) {
    throw new Error('Migration aborted: source and target connection strings are identical.');
  }

  const source = new Client({ connectionString: SOURCE_URL, ssl: { rejectUnauthorized: false } });
  const target = new Client({ connectionString: TARGET_URL, ssl: { rejectUnauthorized: false } });

  await source.connect();
  await target.connect();

  try {
    await target.query(`
      CREATE TABLE IF NOT EXISTS neon_migration_meta (
        key text PRIMARY KEY,
        completed_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const alreadyDone = await target.query(
      'SELECT 1 FROM neon_migration_meta WHERE key = $1 LIMIT 1',
      [MIGRATION_KEY],
    );

    if (alreadyDone.rowCount) {
      console.log(`Supabase→Neon migration already completed: ${MIGRATION_KEY}`);
      return;
    }

    for (const table of TABLES) {
      const sourceExists = await source.query(
        `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`,
        [table],
      );
      if (!sourceExists.rowCount) {
        console.log(`Skipping missing Supabase table: ${table}`);
        continue;
      }

      const targetExists = await target.query(
        `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`,
        [table],
      );
      if (!targetExists.rowCount) {
        console.log(`Skipping missing Neon table: ${table}`);
        continue;
      }

      const targetColumnsResult = await target.query(
        `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`,
        [table],
      );
      const targetColumns = targetColumnsResult.rows.map((r) => r.column_name);
      const targetTypes = new Map(targetColumnsResult.rows.map((r) => [r.column_name, r.data_type]));
      if (!targetColumns.length) continue;

      const sourceColumnsResult = await source.query(
        `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
        [table],
      );
      const sourceColumns = new Set(sourceColumnsResult.rows.map((r) => r.column_name));
      const columns = targetColumns.filter((c) => sourceColumns.has(c));
      if (!columns.length) continue;

      const primaryKeyResult = await target.query(
        `SELECT kcu.column_name
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
           ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
          AND tc.table_name = kcu.table_name
         WHERE tc.table_schema = 'public'
           AND tc.table_name = $1
           AND tc.constraint_type = 'PRIMARY KEY'
         ORDER BY kcu.ordinal_position`,
        [table],
      );
      const primaryKeys = primaryKeyResult.rows
        .map((r) => r.column_name)
        .filter((c) => columns.includes(c));

      const rows = (await source.query(`SELECT ${columns.map((c) => `"${c.replace(/"/g, '""')}"`).join(', ')} FROM public."${table.replace(/"/g, '""')}"`)).rows;
      console.log(`Migrating ${table}: ${rows.length} rows`);

      const batchSize = 50;
      for (let offset = 0; offset < rows.length; offset += batchSize) {
        const batch = rows.slice(offset, offset + batchSize);
        const values = [];
        const tuples = batch.map((row, rowIndex) => {
          const placeholders = columns.map((column, columnIndex) => {
            let value = row[column];
            if (targetTypes.get(column) === 'json' || targetTypes.get(column) === 'jsonb') {
              value = normalizeJsonValue(value);
            }
            values.push(value);
            return `$${rowIndex * columns.length + columnIndex + 1}`;
          });
          return `(${placeholders.join(', ')})`;
        });

        const quotedColumns = columns.map((c) => `"${c.replace(/"/g, '""')}"`).join(', ');
        let sql = `INSERT INTO public."${table.replace(/"/g, '""')}" (${quotedColumns}) VALUES ${tuples.join(', ')}`;

        if (primaryKeys.length) {
          const nonKeys = columns.filter((c) => !primaryKeys.includes(c));
          const conflict = primaryKeys.map((c) => `"${c.replace(/"/g, '""')}"`).join(', ');
          if (nonKeys.length) {
            sql += ` ON CONFLICT (${conflict}) DO UPDATE SET ${nonKeys.map((c) => `"${c.replace(/"/g, '""')}" = EXCLUDED."${c.replace(/"/g, '""')}"`).join(', ')}`;
          } else {
            sql += ` ON CONFLICT (${conflict}) DO NOTHING`;
          }
        } else {
          sql += ' ON CONFLICT DO NOTHING';
        }

        await target.query(sql, values);
      }
    }

    await target.query(
      `INSERT INTO neon_migration_meta (key) VALUES ($1) ON CONFLICT (key) DO NOTHING`,
      [MIGRATION_KEY],
    );
    console.log('Supabase→Neon migration completed successfully.');
  } finally {
    await source.end();
    await target.end();
  }
}

main().catch((error) => {
  console.error('Supabase→Neon migration failed:', error);
  process.exitCode = 1;
});

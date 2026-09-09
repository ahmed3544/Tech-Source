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

function quoteIdent(identifier) {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function normalizeJsonText(value) {
  if (value == null) return null;
  if (typeof value !== 'string') return JSON.stringify(value);

  // A source json/jsonb column is read below with ::text, so valid JSON is
  // already represented as JSON text (including quoted JSON strings).
  // For source text going into a JSON/JSONB target, encode it as a JSON string.
  try {
    JSON.parse(value);
    return value;
  } catch {
    return JSON.stringify(value);
  }
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
        `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`,
        [table],
      );
      const sourceTypes = new Map(sourceColumnsResult.rows.map((r) => [r.column_name, r.data_type]));
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

      // Read JSON/JSONB columns as their canonical PostgreSQL JSON text.
      // This avoids node-postgres guessing whether a string is plain text or
      // already-serialized JSON, and lets the INSERT explicitly cast it.
      const selectExpressions = columns.map((column) => {
        const sourceType = sourceTypes.get(column);
        if (sourceType === 'json' || sourceType === 'jsonb') {
          return `${quoteIdent(column)}::text AS ${quoteIdent(column)}`;
        }
        return quoteIdent(column);
      });

      const rows = (await source.query(
        `SELECT ${selectExpressions.join(', ')} FROM public.${quoteIdent(table)}`,
      )).rows;
      console.log(`Migrating ${table}: ${rows.length} rows`);

      const batchSize = 50;
      for (let offset = 0; offset < rows.length; offset += batchSize) {
        const batch = rows.slice(offset, offset + batchSize);
        const values = [];
        const tuples = batch.map((row, rowIndex) => {
          const placeholders = columns.map((column, columnIndex) => {
            let value = row[column];
            const targetType = targetTypes.get(column);
            const sourceType = sourceTypes.get(column);

            if (targetType === 'json' || targetType === 'jsonb') {
              if (sourceType === 'json' || sourceType === 'jsonb') {
                value = normalizeJsonText(value);
              } else {
                value = normalizeJsonText(value);
              }
            }

            values.push(value);
            const placeholder = `$${rowIndex * columns.length + columnIndex + 1}`;
            if (targetType === 'json') return `${placeholder}::json`;
            if (targetType === 'jsonb') return `${placeholder}::jsonb`;
            return placeholder;
          });
          return `(${placeholders.join(', ')})`;
        });

        const quotedColumns = columns.map(quoteIdent).join(', ');
        let sql = `INSERT INTO public.${quoteIdent(table)} (${quotedColumns}) VALUES ${tuples.join(', ')}`;

        if (primaryKeys.length) {
          const nonKeys = columns.filter((c) => !primaryKeys.includes(c));
          const conflict = primaryKeys.map(quoteIdent).join(', ');
          if (nonKeys.length) {
            sql += ` ON CONFLICT (${conflict}) DO UPDATE SET ${nonKeys.map((c) => `${quoteIdent(c)} = EXCLUDED.${quoteIdent(c)}`).join(', ')}`;
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

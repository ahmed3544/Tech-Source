import { createPool } from '../src/db/index.js';

/**
 * Self-healing schema bootstrap.
 *
 * Problem this solves: the app previously required the 0003_employee_breaks.sql
 * migration to be applied manually BEFORE deploying. If it was not, every full
 * drizzle SELECT on `employees` (which now includes team_leader_id / team_id)
 * threw "column does not exist", the permission guard returned 500
 * "Authentication backend unavailable." and no write operation worked.
 *
 * Solution: on process start (and before the first guarded request) we apply
 * the same additive, idempotent statements as the migration file:
 *   - CREATE TABLE IF NOT EXISTS employee_breaks ...
 *   - CREATE UNIQUE INDEX IF NOT EXISTS ...
 *   - ALTER TABLE employees ADD COLUMN IF NOT EXISTS team_leader_id / team_id
 * No existing data is ever modified or dropped (verified by integration tests,
 * which also prove the statements are safe to run repeatedly).
 *
 * The result is cached per process. A failure is retried on later requests
 * after a short cooldown so a transient database hiccup cannot permanently
 * disable the self-heal for the lifetime of the instance.
 */

const SCHEMA_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS employee_breaks (
      id text PRIMARY KEY,
      company_id text,
      employee_id text NOT NULL,
      date text NOT NULL,
      name text,
      name_ar text,
      name_en text,
      start_time text NOT NULL,
      end_time text NOT NULL,
      duration_minutes integer,
      created_at text NOT NULL,
      updated_at text NOT NULL
    )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS employee_breaks_employee_date_start_idx
      ON employee_breaks (employee_id, date, start_time)`,
  `ALTER TABLE employees ADD COLUMN IF NOT EXISTS team_leader_id text`,
  `ALTER TABLE employees ADD COLUMN IF NOT EXISTS team_id text`,
];

const RETRY_COOLDOWN_MS = 30_000;

let ensuredPromise: Promise<boolean> | null = null;
let lastFailureAt = 0;

async function applyStatements(): Promise<boolean> {
  const pool = createPool();
  for (const statement of SCHEMA_STATEMENTS) {
    await pool.query(statement);
  }
  return true;
}

/**
 * Ensures the additive schema pieces exist. Safe to call on every request —
 * after the first success it is a cached no-op. Returns true when the schema
 * is (now) guaranteed present, false when it could not be verified.
 */
export function ensureSchema(): Promise<boolean> {
  if (ensuredPromise) return ensuredPromise;
  if (Date.now() - lastFailureAt < RETRY_COOLDOWN_MS) return Promise.resolve(false);

  ensuredPromise = applyStatements()
    .then(() => {
      console.log('[ensure-schema] database schema verified (employee_breaks + team columns).');
      return true;
    })
    .catch((error: any) => {
      // Allow a later request to retry instead of caching the failure forever.
      ensuredPromise = null;
      lastFailureAt = Date.now();
      console.error('[ensure-schema] failed (will retry on next request):', error?.message || error);
      return false;
    });

  return ensuredPromise;
}

/** Test-only helper: forces the next ensureSchema() call to actually re-run. */
export function resetEnsureSchemaForTests(): void {
  ensuredPromise = null;
  lastFailureAt = 0;
}

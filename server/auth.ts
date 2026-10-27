import { eq } from 'drizzle-orm';
import { db, createPool } from '../src/db/index.js';
import * as schema from '../src/db/schema.js';
import { passwordMatches } from './passwords.js';
import { ensureSchema } from './ensure-schema.js';

/**
 * Server-side permission guard.
 *
 * The web client sends `x-auth-employee-id` + `x-auth-pin` headers on every
 * mutating request (the same credentials validated by /api/login). The server
 * re-validates them against the employees table on every call — the UI alone
 * is never trusted.
 *
 * Roles:
 *  - admin / company_admin / platform_admin : full access
 *  - leader (Team Leader)                   : access limited to their own team
 *  - employee                               : never allowed to manage others
 */

export type AuthedEmployee = {
  id: string;
  role: string;
  teamLeaderId?: string | null;
  teamId?: string | null;
};

export const MANAGER_ROLES = ['admin', 'company_admin', 'platform_admin', 'leader'];

const roleOf = (value: unknown) => String(value ?? '').trim().toLowerCase();

export const isPlatformAdmin = (role: unknown) => ['admin', 'company_admin', 'platform_admin'].includes(roleOf(role));
export const isManagerRole = (role: unknown) => MANAGER_ROLES.includes(roleOf(role));

/**
 * Validates requester credentials from auth headers.
 * Returns `{ ok: true, employee }` or `{ ok: false, status, error }`.
 */
export async function authenticateRequest(req: any): Promise<
  { ok: true; employee: AuthedEmployee } | { ok: false; status: number; error: string }
> {
  const headerId = String(req.headers?.['x-auth-employee-id'] ?? '').trim();
  const headerPin = String(req.headers?.['x-auth-pin'] ?? '');

  if (!headerId || !headerPin) {
    return { ok: false, status: 401, error: 'Authentication required. Please sign in again.' };
  }

  // Self-heal first: makes sure the additive schema pieces (employee_breaks,
  // team_leader_id, team_id) exist even if the migration was never applied.
  // Cached no-op after the first success.
  await ensureSchema();

  let employee: any = null;
  try {
    const rows = await db.select().from(schema.employees).where(eq(schema.employees.id, headerId));
    employee = rows[0] ?? null;
  } catch (error: any) {
    // Full-schema lookup failed (e.g. migration columns missing and DDL was
    // not permitted). Fall back to a raw query limited to columns that predate
    // the feature migration so authentication still works in degraded mode.
    console.error('[auth] full employee lookup failed, trying minimal fallback:', error?.message || error);
    const fallback = await loadEmployeeMinimal(headerId);
    if (fallback.state === 'error') {
      return { ok: false, status: 500, error: 'Authentication backend unavailable.' };
    }
    if (fallback.state === 'missing') {
      return { ok: false, status: 401, error: 'Invalid or inactive account.' };
    }
    employee = fallback.employee;
  }

  if (!employee || String(employee.status ?? 'active') !== 'active') {
    return { ok: false, status: 401, error: 'Invalid or inactive account.' };
  }
  if (!passwordMatches(employee, headerPin)) {
    return { ok: false, status: 401, error: 'Invalid credentials. Please sign in again.' };
  }

  return {
    ok: true,
    employee: {
      id: String(employee.id),
      role: roleOf(employee.role),
      teamLeaderId: employee.teamLeaderId ?? null,
      teamId: employee.teamId ?? null,
    },
  };
}

/**
 * Requires an authenticated manager. When `respond` is provided the helper
 * writes the error response itself and returns null.
 */
export async function requireManager(
  req: any,
  respond: (status: number, body: Record<string, unknown>) => void
): Promise<AuthedEmployee | null> {
  const auth = await authenticateRequest(req);
  if (auth.ok === false) {
    respond(auth.status, { success: false, error: auth.error });
    return null;
  }
  if (!isManagerRole(auth.employee.role)) {
    respond(403, { success: false, error: 'You do not have permission to perform this action.' });
    return null;
  }
  return auth.employee;
}

/**
 * Admins may manage anyone. Team leaders can manage regular employee accounts
 * across the roster, but cannot manage administrator accounts. Shift assignment
 * remains a separate admin-only UI permission.
 */
export function canManageEmployee(manager: AuthedEmployee, targetEmployee: any): boolean {
  if (isPlatformAdmin(manager.role)) return true;
  if (manager.role !== 'leader') return false;
  if (!targetEmployee) return false;
  const targetId = String(targetEmployee?.id ?? '').trim();
  if (!targetId) return false;
  if (targetId === manager.id) return true;
  // Keep administrator accounts protected from team-leader CRUD actions.
  if (isPlatformAdmin(targetEmployee?.role)) return false;
  return true;
}

/**
 * Degraded-mode lookup used when the full drizzle select fails.
 * Returns a discriminated result so the caller can distinguish
 * "database down" (500) from "unknown employee" (401).
 */
async function loadEmployeeMinimal(
  id: string
): Promise<{ state: 'found'; employee: any } | { state: 'missing' } | { state: 'error' }> {
  try {
    const result = await createPool().query(
      'SELECT id, role, status, pin, code FROM employees WHERE id = $1 LIMIT 1',
      [id]
    );
    const row: any = result?.rows?.[0];
    if (!row) return { state: 'missing' };
    // Team scoping columns may not exist in degraded mode; leaders fall back
    // to admin-only management until the schema heals (ensureSchema retries).
    return { state: 'found', employee: { ...row, teamLeaderId: null, teamId: null } };
  } catch (error: any) {
    console.error('[auth] minimal employee lookup failed:', error?.message || error);
    return { state: 'error' };
  }
}

/**
 * Loads an employee row by id, returning null when not found.
 * Falls back to a raw SELECT * when the drizzle-mapped columns are unavailable
 * (pre-migration database), mapping the snake_case team columns manually.
 */
export async function findEmployeeById(id: string): Promise<any | null> {
  try {
    const rows = await db.select().from(schema.employees).where(eq(schema.employees.id, id));
    return rows[0] ?? null;
  } catch (error: any) {
    console.error('[auth] findEmployeeById full lookup failed, using raw fallback:', error?.message || error);
    try {
      const result = await createPool().query('SELECT * FROM employees WHERE id = $1 LIMIT 1', [id]);
      const row: any = result?.rows?.[0];
      if (!row) return null;
      return { ...row, teamLeaderId: row.team_leader_id ?? null, teamId: row.team_id ?? null };
    } catch (fallbackError: any) {
      console.error('[auth] findEmployeeById fallback failed:', fallbackError?.message || fallbackError);
      return null;
    }
  }
}

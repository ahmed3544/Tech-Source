import { eq } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import * as schema from '../src/db/schema.js';
import { passwordMatches } from './passwords.js';

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

  let rows: any[] = [];
  try {
    rows = await db.select().from(schema.employees).where(eq(schema.employees.id, headerId));
  } catch (error: any) {
    console.error('[auth] employee lookup failed:', error?.message || error);
    return { ok: false, status: 500, error: 'Authentication backend unavailable.' };
  }

  const employee = rows[0];
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
 * Team scoping: admins may manage anyone; leaders only members of their own
 * team (direct reports via teamLeaderId, or same teamId when the leader has
 * one). Mirrors the visibility rules used by the schedule UI.
 */
export function canManageEmployee(manager: AuthedEmployee, targetEmployee: any): boolean {
  if (isPlatformAdmin(manager.role)) return true;
  if (manager.role !== 'leader') return false;
  // Unknown/nonexistent employees are always denied for leaders.
  if (!targetEmployee) return false;
  const targetId = String(targetEmployee?.id ?? '').trim();
  if (!targetId) return false;
  if (targetId === manager.id) return true; // leaders may manage their own record
  if (String(targetEmployee?.teamLeaderId ?? '').trim() === manager.id) return true;
  if (manager.teamId && String(targetEmployee?.teamId ?? '').trim() === String(manager.teamId)) return true;
  return false;
}

/** Loads an employee row by id, returning null when not found. */
export async function findEmployeeById(id: string): Promise<any | null> {
  const rows = await db.select().from(schema.employees).where(eq(schema.employees.id, id));
  return rows[0] ?? null;
}

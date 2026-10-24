import { and, eq, ne } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import * as schema from '../src/db/schema.js';
import { canManageEmployee, findEmployeeById, requireManager } from './auth.js';

/**
 * Shared employee CRUD handlers used by both the Express server (server.ts,
 * used in dev + Render production) and the Vercel catch-all (api/[...path].ts)
 * so both runtimes behave identically.
 *
 * Every response uses `error: string` — API errors are never returned as raw
 * objects, which is what previously surfaced as "[object Object]" in the UI.
 */

const EDITABLE_FIELDS = [
  'code', 'nameAr', 'nameEn', 'avatar', 'email', 'phone', 'department',
  'jobTitleAr', 'jobTitleEn', 'pin', 'role', 'joinedDate', 'status',
  'annualLeaveBalance', 'casualLeaveBalance', 'regularLeaveBalance', 'sickLeaveBalance',
  'isPhotoRemoved',
] as const;

const TEXT_ONLY_FIELDS = new Set(['code', 'nameAr', 'nameEn', 'avatar', 'email', 'phone', 'department', 'jobTitleAr', 'jobTitleEn', 'pin', 'role', 'joinedDate', 'status']);
const NUMBER_FIELDS = new Set(['annualLeaveBalance', 'casualLeaveBalance', 'regularLeaveBalance', 'sickLeaveBalance']);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeRoleValue(value: unknown): string {
  const role = String(value ?? '').trim().toLowerCase();
  if (role === 'leader' || role === 'team_leader' || role === 'team-leader' || role === 'tl') return 'leader';
  if (role === 'admin' || role === 'company_admin' || role === 'platform_admin') return 'admin';
  return 'employee';
}

/** Builds a validated whitelist of columns from a request body. */
export function buildEmployeeValues(requestBody: any): { values: Record<string, unknown>; error?: string } {
  if (!requestBody || typeof requestBody !== 'object' || Array.isArray(requestBody)) {
    return { values: {}, error: 'Invalid employee payload' };
  }
  const values: Record<string, unknown> = {};
  for (const key of EDITABLE_FIELDS) {
    const raw = requestBody[key];
    if (raw === undefined) continue;
    if (key === 'pin' && String(raw) === '***') continue; // placeholder = keep current pin
    if (TEXT_ONLY_FIELDS.has(key)) {
      const text = String(raw ?? '').trim();
      if (key === 'code' && !text) return { values, error: 'Employee code cannot be empty.' };
      if ((key === 'nameAr' || key === 'nameEn') && !text) return { values, error: 'Employee name cannot be empty.' };
      if (key === 'email' && text && !EMAIL_RE.test(text)) return { values, error: 'Invalid email address.' };
      if (key === 'status' && !['active', 'inactive'].includes(text.toLowerCase())) return { values, error: 'Status must be active or inactive.' };
      values[key] = key === 'status' ? text.toLowerCase() : text;
      continue;
    }
    if (NUMBER_FIELDS.has(key)) {
      if (raw === null || raw === '') { values[key] = null; continue; }
      const num = Number(raw);
      if (!Number.isFinite(num) || num < 0) return { values, error: `Invalid value for ${key}.` };
      values[key] = num;
      continue;
    }
    values[key] = raw; // avatar / isPhotoRemoved
  }
  if (values.role !== undefined) values.role = normalizeRoleValue(values.role);
  return { values };
}

async function assertUniqueCode(code: string, excludeId?: string): Promise<string | null> {
  const clean = String(code ?? '').trim();
  if (!clean) return null;
  const rows = excludeId
    ? await db.select({ id: schema.employees.id }).from(schema.employees).where(and(eq(schema.employees.code, clean), ne(schema.employees.id, excludeId)))
    : await db.select({ id: schema.employees.id }).from(schema.employees).where(eq(schema.employees.code, clean));
  return rows.length ? `Employee code "${clean}" is already used by another employee.` : null;
}

const noStore = (res: any) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
};

/** PUT /api/employees/:id — update an existing employee. */
export async function updateEmployeeHandler(req: any, res: any) {
  let requestBody = req.body;
  if (typeof requestBody === 'string') { try { requestBody = JSON.parse(requestBody); } catch { /* handled below */ } }
  if (!requestBody && req.rawBody) { try { requestBody = JSON.parse(Buffer.from(req.rawBody).toString('utf8')); } catch { /* handled below */ } }

  try {
    const manager = await requireManager(req, (status, body) => res.status(status).json(body));
    if (!manager) return;

    const id = String(req.params?.id ?? '').trim();
    if (!id) { noStore(res); return res.status(400).json({ success: false, error: 'Employee id is required.' }); }

    const { values, error } = buildEmployeeValues(requestBody);
    if (error) { noStore(res); return res.status(400).json({ success: false, error }); }
    if (Object.keys(values).length === 0) { noStore(res); return res.status(400).json({ success: false, error: 'No changes were provided.' }); }

    const existing = await findEmployeeById(id);
    if (!existing) { noStore(res); return res.status(404).json({ success: false, error: 'Employee not found.' }); }

    if (!canManageEmployee(manager, existing)) {
      noStore(res);
      return res.status(403).json({ success: false, error: 'You can only edit employees in your own team.' });
    }

    if (values.code !== undefined && String(values.code).toLowerCase() !== String(existing.code ?? '').toLowerCase()) {
      const duplicate = await assertUniqueCode(String(values.code), id);
      if (duplicate) { noStore(res); return res.status(409).json({ success: false, error: duplicate }); }
    }

    // Employee shifts are managed only by the weekly schedule.
    values.updatedAt = new Date().toISOString();
    await db.update(schema.employees).set(values as any).where(eq(schema.employees.id, id));
    const updated = await findEmployeeById(id);

    noStore(res);
    return res.json({ success: true, employee: updated, lastUpdated: Date.now() });
  } catch (error: any) {
    console.error('[EMPLOYEE-UPDATE-ERROR]', error?.message || error);
    return res.status(500).json({ success: false, error: String(error?.message || 'Employee update failed due to a server error.') });
  }
}

/** POST /api/employees — create a new employee. */
export async function createEmployeeHandler(req: any, res: any) {
  try {
    const manager = await requireManager(req, (status, body) => res.status(status).json(body));
    if (!manager) return;

    const body = req.body ?? {};
    const code = String(body.code ?? '').trim();
    const nameAr = String(body.nameAr ?? '').trim();
    const nameEn = String(body.nameEn ?? '').trim() || nameAr;
    const pin = String(body.pin ?? '').trim();
    if (!code) return res.status(400).json({ success: false, error: 'Employee code is required.' });
    if (!nameAr && !nameEn) return res.status(400).json({ success: false, error: 'Employee name is required.' });
    if (!pin) return res.status(400).json({ success: false, error: 'A temporary password is required.' });

    const duplicate = await assertUniqueCode(code);
    if (duplicate) return res.status(409).json({ success: false, error: duplicate });

    const now = new Date().toISOString();
    const id = String(body.id ?? '').trim() || `emp-${code.toLowerCase().replace(/[^a-z0-9_-]/g, '')}`;
    const existingId = await findEmployeeById(id);
    if (existingId) return res.status(409).json({ success: false, error: `Employee id "${id}" already exists.` });

    const row: Record<string, unknown> = {
      id,
      companyId: body.companyId ?? 'tech-source',
      code: code.toUpperCase(),
      nameAr, nameEn,
      avatar: body.avatar ?? '',
      email: body.email ?? '',
      phone: body.phone ?? '',
      department: body.department ?? 'CX',
      jobTitleAr: body.jobTitleAr ?? 'Employee',
      jobTitleEn: body.jobTitleEn ?? 'Employee',
      shiftId: body.shiftId ?? '',
      pin,
      role: normalizeRoleValue(body.role ?? 'employee'),
      joinedDate: body.joinedDate ?? now.slice(0, 10),
      status: 'active',
      annualLeaveBalance: Number.isFinite(Number(body.annualLeaveBalance)) ? Number(body.annualLeaveBalance) : 15,
      updatedAt: now,
    };
    await db.insert(schema.employees).values(row as any);
    const created = await findEmployeeById(id);
    return res.status(201).json({ success: true, employee: created, lastUpdated: Date.now() });
  } catch (error: any) {
    console.error('[EMPLOYEE-CREATE-ERROR]', error?.message || error);
    return res.status(500).json({ success: false, error: String(error?.message || 'Employee creation failed due to a server error.') });
  }
}

/** DELETE /api/employees/:id — remove an employee (tombstoned like the sync path). */
export async function deleteEmployeeHandler(req: any, res: any) {
  try {
    const manager = await requireManager(req, (status, body) => res.status(status).json(body));
    if (!manager) return;

    const id = String(req.params?.id ?? '').trim();
    if (!id) return res.status(400).json({ success: false, error: 'Employee id is required.' });
    if (id === manager.id) return res.status(400).json({ success: false, error: 'You cannot delete your own account.' });

    const existing = await findEmployeeById(id);
    if (!existing) return res.status(404).json({ success: false, error: 'Employee not found.' });
    if (!canManageEmployee(manager, existing)) {
      return res.status(403).json({ success: false, error: 'You can only delete employees in your own team.' });
    }

    await db.delete(schema.employees).where(eq(schema.employees.id, id));
    const key = '__sync_deleted_ids:employee';
    const rows = await db.select().from(schema.settings).where(eq(schema.settings.key, key));
    const oldIds = Array.isArray(rows[0]?.value) ? rows[0].value.map(String) : [];
    const nextIds = Array.from(new Set([...oldIds, id])).slice(-5000);
    if (rows[0]) await db.update(schema.settings).set({ value: nextIds } as any).where(eq(schema.settings.key, key));
    else await db.insert(schema.settings).values({ key, value: nextIds } as any);

    return res.json({ success: true, deletedId: id, lastUpdated: Date.now() });
  } catch (error: any) {
    console.error('[EMPLOYEE-DELETE-ERROR]', error?.message || error);
    return res.status(500).json({ success: false, error: String(error?.message || 'Employee deletion failed due to a server error.') });
  }
}

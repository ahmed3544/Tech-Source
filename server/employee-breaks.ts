import { and, eq, gte, lte, or, sql } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import * as schema from '../src/db/schema.js';
import { canManageEmployee, findEmployeeById, requireManager } from './auth.js';
import { logActivity } from './activity-logs.js';

/**
 * Employee-specific breaks API.
 *
 * GET  /api/employee-breaks?employeeId=..&from=YYYY-MM-DD&to=YYYY-MM-DD
 * POST /api/employee-breaks        { employeeId, date, breaks: [...] }
 *
 * Breaks are stored per employee + date. Two employees on the same shift can
 * have completely different break times. When a day has no employee-specific
 * rows the client falls back to the shift-level breaks (backward compatible).
 */

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_BREAKS_PER_DAY = 10;

/**
 * Normalize any stored/incoming date value to a clean YYYY-MM-DD key.
 *
 * Older writers (hand-written preview worker, Excel import paths) stored
 * full ISO timestamps like "2026-11-11T00:00:00.000Z" in the date column;
 * pg also hands back Date objects for DATE-typed columns. Such "zombie"
 * rows are invisible to day-scoped reads (lte 'YYYY-MM-DD' fails) and are
 * never matched by the replace-delete, so edits appeared to not stick.
 */
export function toDateKey(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const s = String(value ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.slice(0, 10);
  return s;
}

/** Replace-delete matcher: exact date OR any value whose day-prefix matches
 *  (catches ISO-timestamp zombie rows for the same day, on both TEXT and
 *  DATE-typed columns). */
const sameDayMatcher = (employeeId: string, date: string) =>
  and(
    eq(schema.employeeBreaks.employeeId, employeeId),
    or(
      eq(schema.employeeBreaks.date, date),
      sql`left(${schema.employeeBreaks.date}::text, 10) = ${date}`,
    ),
  );

const toMinutes = (value: string) => {
  const [h, m] = String(value ?? '').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

export interface ValidatedBreak {
  id: string;
  name?: string;
  nameAr?: string;
  nameEn?: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
}

/** Validates + normalizes one day's break list. Returns [breaks, error]. */
export function validateBreakList(raw: unknown): [ValidatedBreak[], string | null] {
  if (!Array.isArray(raw)) return [[], 'Breaks must be an array.'];
  if (raw.length > MAX_BREAKS_PER_DAY) return [[], `A day cannot have more than ${MAX_BREAKS_PER_DAY} breaks.`];

  const breaks: ValidatedBreak[] = [];
  for (const [index, item] of raw.entries()) {
    const startTime = String((item as any)?.startTime ?? '').trim();
    const endTime = String((item as any)?.endTime ?? '').trim();
    if (!TIME_RE.test(startTime) || !TIME_RE.test(endTime)) {
      return [[], `Break ${index + 1}: start and end times are required in HH:mm format.`];
    }
    if (toMinutes(endTime) <= toMinutes(startTime)) {
      return [[], `Break ${index + 1}: end time must be after start time.`];
    }
    const name = String((item as any)?.name ?? '').trim();
    const nameAr = String((item as any)?.nameAr ?? '').trim();
    const nameEn = String((item as any)?.nameEn ?? '').trim();
    breaks.push({
      id: String((item as any)?.id ?? '').trim() || `brk-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
      name: name || undefined,
      nameAr: nameAr || name || undefined,
      nameEn: nameEn || name || undefined,
      startTime,
      endTime,
      durationMinutes: toMinutes(endTime) - toMinutes(startTime),
    });
  }

  breaks.sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime));
  for (let i = 1; i < breaks.length; i++) {
    if (toMinutes(breaks[i].startTime) < toMinutes(breaks[i - 1].endTime)) {
      return [[], `Break "${breaks[i].nameEn || breaks[i].startTime}" overlaps with another break.`];
    }
  }
  return [breaks, null];
}

export function registerEmployeeBreaks(app: any) {
  app.get('/api/employee-breaks', async (req: any, res: any) => {
    try {
      const employeeId = String(req.query?.employeeId ?? '').trim();
      const from = String(req.query?.from ?? '').trim();
      const to = String(req.query?.to ?? '').trim();
      if (!employeeId || !DATE_RE.test(from) || !DATE_RE.test(to)) {
        return res.status(400).json({ success: false, error: 'employeeId, from and to (YYYY-MM-DD) are required.' });
      }
      const rows = await db
        .select()
        .from(schema.employeeBreaks)
        .where(and(eq(schema.employeeBreaks.employeeId, employeeId), gte(schema.employeeBreaks.date, from), lte(schema.employeeBreaks.date, to)));

      const byDate: Record<string, ValidatedBreak[]> = {};
      for (const row of rows) {
        // Normalize polluted/DATE-typed date values into clean day keys so
        // zombie rows are visible and editable instead of silently ignored.
        const dateKey = toDateKey(row.date);
        const list = byDate[dateKey] ?? [];
        list.push({
          id: String(row.id),
          name: row.name ?? undefined,
          nameAr: row.nameAr ?? undefined,
          nameEn: row.nameEn ?? undefined,
          startTime: String(row.startTime),
          endTime: String(row.endTime),
          durationMinutes: Number(row.durationMinutes ?? 0),
        });
        byDate[dateKey] = list;
      }
      res.setHeader('Cache-Control', 'no-store');
      return res.json({ success: true, breaksByDate: byDate });
    } catch (error: any) {
      console.error('[EMPLOYEE-BREAKS] GET failed:', error?.message || error);
      return res.status(500).json({ success: false, error: 'Could not load employee breaks.' });
    }
  });

  app.post('/api/employee-breaks', async (req: any, res: any) => {
    try {
      const manager = await requireManager(req, (status, body) => res.status(status).json(body));
      if (!manager) return;

      const employeeId = String(req.body?.employeeId ?? '').trim();
      const date = String(req.body?.date ?? '').trim();
      if (!employeeId || !DATE_RE.test(date)) {
        return res.status(400).json({ success: false, error: 'employeeId and date (YYYY-MM-DD) are required.' });
      }

      const employee = await findEmployeeById(employeeId);
      if (!employee) return res.status(404).json({ success: false, error: 'Employee not found.' });
      if (!canManageEmployee(manager, employee)) {
        return res.status(403).json({ success: false, error: 'You can only edit breaks for employees in your own team.' });
      }

      const [breaks, validationError] = validateBreakList(req.body?.breaks ?? []);
      if (validationError) return res.status(400).json({ success: false, error: validationError });

      // Replace-all semantics per employee+date keep saves atomic and simple.
      // The same-day matcher also removes ISO-timestamp zombie rows that older
      // writers stored, so an edit can never leave stale duplicates behind.
      await db.delete(schema.employeeBreaks).where(sameDayMatcher(employeeId, date));
      if (breaks.length) {
        const now = new Date().toISOString();
        await db.insert(schema.employeeBreaks).values(breaks.map((b) => ({
          id: b.id,
          companyId: employee.companyId ?? 'tech-source',
          employeeId,
          date,
          name: b.name ?? null,
          nameAr: b.nameAr ?? null,
          nameEn: b.nameEn ?? null,
          startTime: b.startTime,
          endTime: b.endTime,
          durationMinutes: b.durationMinutes,
          createdAt: now,
          updatedAt: now,
        } as any)));
      }

      // Activity log: one entry per manual breaks save. The Excel import
      // reports its own summary via /api/schedule-sync (source='excel-import'),
      // so its many per-day calls are skipped here to avoid spam.
      if (String(req.body?.source ?? '') !== 'excel-import') {
        logActivity({
          actorId: manager.id,
          actorName: (manager as any).nameAr || (manager as any).nameEn || manager.id,
          actorRole: manager.role,
          action: 'breaks.update',
          entityType: 'breaks',
          entityId: `${employeeId}|${date}`,
          entityLabel: `${employee.code} — ${employee.nameAr || employee.nameEn} — ${date}`,
          details: { breaks: breaks.map(b => `${b.startTime}-${b.endTime}`) },
          companyId: employee.companyId ?? 'tech-source',
        });
      }

      // Read the rows back from PostgreSQL and return those — the response
      // then reflects EXACTLY what the schedule GET will serve, so the UI
      // never flashes stale times after saving.
      const persistedRows = (await db
        .select()
        .from(schema.employeeBreaks)
        .where(and(eq(schema.employeeBreaks.employeeId, employeeId), eq(schema.employeeBreaks.date, date)))) as any[];
      const persistedBreaks: ValidatedBreak[] = persistedRows
        .map((row) => ({
          id: String(row.id),
          name: row.name ?? undefined,
          nameAr: row.nameAr ?? undefined,
          nameEn: row.nameEn ?? undefined,
          startTime: String(row.startTime),
          endTime: String(row.endTime),
          durationMinutes: Number(row.durationMinutes ?? 0),
        }))
        .sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime));

      res.setHeader('Cache-Control', 'no-store');
      return res.json({ success: true, employeeId, date, breaks: persistedBreaks, lastUpdated: Date.now() });
    } catch (error: any) {
      console.error('[EMPLOYEE-BREAKS] POST failed:', error?.message || error);
      return res.status(500).json({ success: false, error: 'Could not save employee breaks.' });
    }
  });
}

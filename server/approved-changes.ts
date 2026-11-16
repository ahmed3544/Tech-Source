import { eq } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import * as schema from '../src/db/schema.js';
import { requireManager } from './auth.js';

/**
 * Approved-schedule-changes registry — the bridge between in-app approvals
 * and the Excel import sheet ("عايز اي تبديل بريك او شفت يتوافق عليه يظهر في
 * شيت الـ Import").
 *
 * The admin's import workbook (uploaded file, URL auto-sync, or the daily
 * stored-file cron) is applied with overwriteAssignments: true, so every cell
 * it covers used to be reverted to the workbook's stale values — erasing
 * shifts swaps and approved break changes that only exist inside the app.
 *
 * Every approved swap (POST /api/schedule-sync with source 'shift-swap') and
 * every approved break change records a protection entry keyed
 * `${employeeId}|${date}`. The dashboard import then SKIPS workbook cells for
 * protected keys (the app's approved values stay live) and reports them in
 * the import summary so the admin knows which sheet cells are outdated.
 *
 * Deliberate manual edits clear the protection (a conscious admin decision
 * overrides an old approval), while imports never do. Entries expire after
 * 30 days so a forgotten protection can never permanently freeze a cell —
 * after expiry the workbook wins again until a new approval refreshes it.
 *
 * Storage is one settings JSON row (same pattern as sheetSyncConfig) — no
 * migration needed, and the registry is tiny (one entry per approved day).
 */

const KEY = 'approvedScheduleChanges';
const MAX_ENTRIES = 4000;
const EXPIRY_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export type ApprovedChangeKind = 'swap' | 'breaks';

export interface ApprovedChangeEntry {
  key: string; // `${employeeId}|${date}`
  kinds: ApprovedChangeKind[];
  shiftId?: string; // protected assignment value (swap kind)
  isOffDay?: boolean;
  recordedAt: string;
}

async function readAll(): Promise<ApprovedChangeEntry[]> {
  try {
    const rows = await db.select().from(schema.settings).where(eq(schema.settings.key, KEY));
    const value = rows[0]?.value;
    if (!Array.isArray(value)) return [];
    return value
      .filter((e: any) => e && typeof e === 'object' && typeof e.key === 'string')
      .map((e: any) => ({
        key: String(e.key),
        kinds: Array.isArray(e.kinds) ? e.kinds.filter((k: any) => k === 'swap' || k === 'breaks') : ['swap'],
        shiftId: e.shiftId === undefined ? undefined : String(e.shiftId),
        isOffDay: Boolean(e.isOffDay),
        recordedAt: String(e.recordedAt ?? ''),
      }));
  } catch (error: any) {
    console.warn('[approved-changes] read failed (ignored):', error?.message || error);
    return [];
  }
}

async function writeAll(entries: ApprovedChangeEntry[]): Promise<void> {
  const trimmed = entries.slice(-MAX_ENTRIES);
  await db.insert(schema.settings).values({ key: KEY, value: trimmed } as any)
    .onConflictDoUpdate({ target: schema.settings.key, set: { value: trimmed } as any });
}

/** Entries still inside their 30-day protection window. */
export async function listApprovedChanges(): Promise<ApprovedChangeEntry[]> {
  const now = Date.now();
  const all = await readAll();
  const fresh = all.filter((e) => {
    const t = Date.parse(e.recordedAt);
    return Number.isFinite(t) && now - t < EXPIRY_MS;
  });
  if (fresh.length !== all.length) {
    try { await writeAll(fresh); } catch { /* next write will prune again */ }
  }
  return fresh;
}

/** Record (or refresh) protection for the given employee|date keys. */
export async function recordApprovedChanges(
  entries: Array<{ key: string; kind: ApprovedChangeKind; shiftId?: string; isOffDay?: boolean }>,
): Promise<void> {
  const usable = entries.filter((e) => e && e.key && (e.kind === 'swap' || e.kind === 'breaks'));
  if (!usable.length) return;
  const now = new Date().toISOString();
  const map = new Map<string, ApprovedChangeEntry>();
  for (const existing of await readAll()) map.set(existing.key, existing);
  for (const entry of usable) {
    const current = map.get(entry.key);
    const kinds = new Set<ApprovedChangeKind>(current?.kinds ?? []);
    kinds.add(entry.kind);
    map.set(entry.key, {
      key: entry.key,
      kinds: Array.from(kinds),
      // swap values are refreshed to the latest approved assignment; breaks
      // entries carry no assignment value (imports never touch breaks rows).
      shiftId: entry.kind === 'swap' ? (entry.shiftId ?? current?.shiftId) : current?.shiftId,
      isOffDay: entry.kind === 'swap' ? Boolean(entry.isOffDay) : Boolean(current?.isOffDay),
      recordedAt: now,
    });
  }
  await writeAll(Array.from(map.values()));
}

/** Remove protection (manual admin edits deliberately override an approval). */
export async function clearApprovedChanges(keys: string[]): Promise<void> {
  const wanted = new Set(keys.filter(Boolean));
  if (!wanted.size) return;
  const all = await readAll();
  const remaining = all.filter((e) => !wanted.has(e.key));
  if (remaining.length !== all.length) await writeAll(remaining);
}

/* ---------------------------------------------------------------------- */
/* "Swap Shift or Break" table — every approved swap / approved break      */
/* change with its date and data ("يظهر في تيبول اسمها سواب شفت او بريك    */
/* بتاريخ الاسواب بالداتا").                                               */
/*                                                                        */
/* One shared builder feeds BOTH sheet surfaces:                          */
/*   • the Google dashboard sheet (a "Swap Shift or Break" feed tab        */
/*     written by the Apps Script, like Employees/Schedule/Breaks), and    */
/*   • the website's Excel export workbook (a third sheet next to the      */
/*     roster and the breaks detail), fetched through                      */
/*     GET /api/approved-swap-breaks at export time.                       */
/* ---------------------------------------------------------------------- */

export interface ApprovedSwapBreakRow {
  date: string;      // the swapped / break day (YYYY-MM-DD) — "تاريخ الاسواب"
  code: string;
  name: string;
  kind: 'swap' | 'breaks';
  change: string;    // new shift name / OFF, or "current → proposed" break times
  partner: string;   // the other side of a swap ('' for break changes)
  reviewedBy: string;
  approvedAt: string; // best-known review timestamp (YYYY-MM-DD HH:mm:ss)
}

/** How far back the table looks — matches the sheet-sync history window. */
const SWAP_BREAK_WINDOW_DAYS = 92;

const dateOnly = (value: unknown): string => String(value ?? '').slice(0, 10);
const isDateKey = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);
const stampOf = (value: unknown): string => String(value ?? '').slice(0, 19).replace('T', ' ');

export async function listApprovedSwapBreakRows(
  preloaded?: { employees?: any[]; shifts?: any[] },
): Promise<ApprovedSwapBreakRow[]> {
  try {
    const cutoff = new Date(Date.now() - SWAP_BREAK_WINDOW_DAYS * 86400000).toISOString().slice(0, 10);

    let employees = preloaded?.employees;
    if (!employees) { try { employees = await db.select().from(schema.employees); } catch { employees = []; } }
    let shifts = preloaded?.shifts;
    if (!shifts) { try { shifts = await db.select().from(schema.shifts); } catch { shifts = []; } }

    const byId = new Map<string, any>((employees as any[]).map((e: any) => [String(e.id), e]));
    const codeOf = (id: unknown): string => String(byId.get(String(id ?? ''))?.code || id || '');
    const nameOf = (id: unknown): string => {
      const e = byId.get(String(id ?? ''));
      return e ? String(e.nameAr || e.nameEn || e.name || e.code || id || '') : String(id ?? '');
    };
    const shiftNames = new Map<string, string>((shifts as any[]).map((s: any) => [String(s.id), String(s.name || s.nameAr || s.nameEn || s.id)]));
    // After an approved swap the requester works the TARGET's shift (or OFF
    // when the target's day was OFF) and the other way round — the exact
    // semantics of the approval write in ShiftSwapPanel.
    const shiftLabel = (shiftId: unknown, wasOff: boolean): string => {
      const id = String(shiftId ?? '').trim();
      if (wasOff || !id) return 'OFF';
      return shiftNames.get(id) || id;
    };

    const rows: ApprovedSwapBreakRow[] = [];

    // Approved shift swaps — settings.shiftSwapRequests rows with status 'approved'.
    try {
      const stored = await db.select().from(schema.settings).where(eq(schema.settings.key, 'shiftSwapRequests'));
      const swapRequests = Array.isArray(stored[0]?.value) ? stored[0].value : [];
      for (const r of swapRequests) {
        if (String(r?.status ?? '') !== 'approved') continue;
        const date = dateOnly(r?.date);
        if (!isDateKey(date) || date < cutoff) continue;
        const reviewerId = String(r?.reviewedBy ?? '');
        const approvedAt = stampOf(r?.reviewedAt || r?.updatedAt || r?.createdAt);
        rows.push({
          date, code: codeOf(r.requesterId), name: nameOf(r.requesterId), kind: 'swap',
          change: shiftLabel(r.targetShiftId, Boolean(r.targetWasOff)),
          partner: nameOf(r.targetEmployeeId),
          reviewedBy: reviewerId ? nameOf(reviewerId) : '',
          approvedAt,
        });
        rows.push({
          date, code: codeOf(r.targetEmployeeId), name: nameOf(r.targetEmployeeId), kind: 'swap',
          change: shiftLabel(r.requesterShiftId, Boolean(r.requesterWasOff)),
          partner: nameOf(r.requesterId),
          reviewedBy: reviewerId ? nameOf(reviewerId) : '',
          approvedAt,
        });
      }
    } catch (error: any) {
      console.warn('[approved-changes] swap rows failed (ignored):', error?.message || error);
    }

    // Approved break changes — break_change_requests rows with status 'approved'.
    try {
      const breakRequests = await db.select().from(schema.breakChangeRequests);
      for (const r of breakRequests) {
        if (String(r?.status ?? '') !== 'approved') continue;
        const date = dateOnly(r?.date);
        if (!isDateKey(date) || date < cutoff) continue;
        const current = r.currentStartTime && r.currentEndTime ? `${r.currentStartTime}-${r.currentEndTime}` : '';
        rows.push({
          date, code: codeOf(r.employeeId), name: nameOf(r.employeeId), kind: 'breaks',
          change: `${current || '—'} → ${r.proposedStartTime}-${r.proposedEndTime}`,
          partner: '',
          reviewedBy: r.reviewedBy ? nameOf(r.reviewedBy) : '',
          approvedAt: stampOf(r.reviewedAt || r.updatedAt || r.createdAt),
        });
      }
    } catch (error: any) {
      console.warn('[approved-changes] break rows failed (ignored):', error?.message || error);
    }

    rows.sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name) || a.kind.localeCompare(b.kind));
    return rows;
  } catch (error: any) {
    console.warn('[approved-changes] swap/break rows failed (ignored):', error?.message || error);
    return [];
  }
}

/** GET /api/approved-swap-breaks — managers only; feeds the Excel export's
 *  "Swap Shift or Break" sheet. Read-only, never throws 500 data at the UI. */
export function registerApprovedChanges(app: any) {
  app.get('/api/approved-swap-breaks', async (req: any, res: any) => {
    try {
      const manager = await requireManager(req, (status: number, body: unknown) => res.status(status).json(body));
      if (!manager) return;
      res.setHeader('Cache-Control', 'no-store');
      return res.json({ success: true, rows: await listApprovedSwapBreakRows() });
    } catch (error: any) {
      console.error('[approved-changes] GET approved-swap-breaks failed:', error?.message || error);
      return res.status(500).json({ success: false, error: 'APPROVED_SWAP_BREAKS_READ_FAILED' });
    }
  });
}

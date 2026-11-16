import { eq } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import * as schema from '../src/db/schema.js';

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

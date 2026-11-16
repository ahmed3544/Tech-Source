import crypto from 'crypto';
import type { Express, Request } from 'express';
import { and, eq, inArray, like, or } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import * as schema from '../src/db/schema.js';
import { ensureSchema } from './ensure-schema.js';
import { publishNotification } from './notification-sse.js';

type NotificationRecord = { id: string; recipientId: string; type: string; title: string; message: string; relatedEmployeeId?: string; relatedLeaveId?: string; relatedOvertimeId?: string; relatedShiftSwapId?: string; relatedBreakRequestId?: string; link?: string; targetUrl?: string; isRead: boolean; createdAt: string; updatedAt: string; };
const clean = (value: unknown) => String(value ?? '').trim();
const nowIso = () => new Date().toISOString();

function stableId(input: Omit<NotificationRecord, 'id'> & { id?: string }) {
  if (clean(input.id)) return clean(input.id);
  const basis = [input.recipientId, input.type, input.relatedEmployeeId || '', input.relatedLeaveId || '', input.relatedOvertimeId || '', input.relatedShiftSwapId || '', input.relatedBreakRequestId || '', input.title, input.message].join('|');
  return `n2_${crypto.createHash('sha256').update(basis).digest('hex').slice(0, 40)}`;
}

function semanticKey(raw: any): string {
  const recipientId = clean(raw?.recipientId); const type = clean(raw?.type);
  const relatedId = clean(raw?.relatedLeaveId) || clean(raw?.relatedOvertimeId) || clean(raw?.relatedShiftSwapId) || clean(raw?.relatedBreakRequestId);
  if (relatedId) return `${recipientId}|${type}|${relatedId}`;
  return `${recipientId}|${type}|${clean(raw?.title)}|${clean(raw?.message)}`;
}

function targetFor(raw: any): string | undefined {
  const explicit = clean(raw?.link || raw?.targetUrl); if (explicit) return explicit;
  const type = clean(raw?.type);
  if (clean(raw?.relatedLeaveId)) return `/leaves?leaveId=${encodeURIComponent(clean(raw.relatedLeaveId))}`;
  if (clean(raw?.relatedOvertimeId)) return `/overtime?overtimeId=${encodeURIComponent(clean(raw.relatedOvertimeId))}`;
  if (clean(raw?.relatedShiftSwapId)) return `/schedule?shiftSwapId=${encodeURIComponent(clean(raw.relatedShiftSwapId))}`;
  if (type.startsWith('leave_')) return '/leaves';
  if (type.startsWith('overtime_')) return '/leaves';
  if (type.startsWith('shift_')) return '/schedule';
  return '/notifications';
}

function withTarget(item: NotificationRecord): NotificationRecord {
  const link = targetFor(item); return link ? { ...item, link, targetUrl: link } : item;
}

function normalize(raw: any): NotificationRecord | null {
  const recipientId = clean(raw?.recipientId); const type = clean(raw?.type);
  if (!recipientId || !type) return null;
  if (type === 'leave_rejected' && !clean(raw?.relatedLeaveId)) return null;
  const createdAt = clean(raw?.createdAt) || nowIso();
  const updatedAt = clean(raw?.updatedAt) || createdAt;
  const item: Omit<NotificationRecord, 'id'> & { id?: string } = {
    id: clean(raw?.id) || undefined,
    recipientId,
    type,
    title: clean(raw?.title) || 'إشعار جديد',
    message: clean(raw?.message) || 'لديك إشعار جديد.',
    relatedEmployeeId: clean(raw?.relatedEmployeeId) || undefined,
    relatedLeaveId: clean(raw?.relatedLeaveId) || undefined,
    relatedOvertimeId: clean(raw?.relatedOvertimeId) || undefined,
    relatedShiftSwapId: clean(raw?.relatedShiftSwapId) || undefined,
    relatedBreakRequestId: clean(raw?.relatedBreakRequestId) || undefined,
    isRead: Boolean(raw?.isRead),
    createdAt,
    updatedAt,
  };
  return withTarget({ id: stableId(item), ...item });
}

function mergeDuplicates(items: NotificationRecord[]): NotificationRecord[] {
  const map = new Map<string, NotificationRecord>();
  for (const raw of items) {
    const item = withTarget(raw); const key = semanticKey(item); const old = map.get(key);
    if (!old) { map.set(key, item); continue; }
    const oldTime = new Date(old.updatedAt || old.createdAt || 0).getTime();
    const newTime = new Date(item.updatedAt || item.createdAt || 0).getTime();
    const newer = newTime >= oldTime ? item : old;
    map.set(key, {
      ...newer,
      isRead: Boolean(old.isRead || item.isRead),
      createdAt: new Date(old.createdAt || item.createdAt || 0).getTime() <= new Date(item.createdAt || old.createdAt || 0).getTime() ? old.createdAt : item.createdAt,
    });
  }
  return Array.from(map.values()).sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
}

async function ensureReady() {
  // Self-heal the additive schema pieces on the UNAUTHENTICATED notification
  // paths too. GET /api/notifications and POST /api/sync never pass through
  // authenticateRequest, and a drizzle SELECT/INSERT referencing a column the
  // production database does not have yet (e.g. related_break_request_id right
  // after a deploy) would 500 them until some authed request happened to heal
  // that isolate. ensureSchema is additive, idempotent and cached per process,
  // so after the first success this is a no-op; failures are retried with a
  // cooldown inside ensureSchema itself.
  await ensureSchema();
}

export async function ensureNotificationStorage() {
  await ensureReady();
}

async function listForUser(userId: string): Promise<NotificationRecord[]> {
  const id = clean(userId); if (!id) return [];
  await ensureReady();
  const rows = await db.select().from(schema.notifications).where(eq(schema.notifications.recipientId, id));
  let leaveRows: any[] = [];
  try {
    leaveRows = await db.select({ id: schema.leaveRequests.id, status: schema.leaveRequests.status }).from(schema.leaveRequests);
  } catch (error) {
    console.warn('[Notifications v2] leave validation skipped:', error);
  }
  const validRejectedLeaveIds = new Set(leaveRows.filter((row: any) => String(row.status || '').toLowerCase() === 'rejected').map((row: any) => String(row.id)));
  const validLeaveIds = new Set(leaveRows.map((row: any) => String(row.id)));
  const normalized = rows
    .map((row: any) => withTarget({ ...row, id: String(row.id), recipientId: String(row.recipientId) }))
    .filter((item) => leaveRows.length === 0 || (item.type === 'leave_rejected'
      ? Boolean(item.relatedLeaveId && validRejectedLeaveIds.has(String(item.relatedLeaveId)))
      : !(item.type.startsWith('leave_') && item.relatedLeaveId && !validLeaveIds.has(String(item.relatedLeaveId)))));
  // Reviewer-side request notifications ("new break/swap/leave/overtime
  // request … review it") must not outlive the request they describe: the
  // moment a request reaches a final state the notification is deleted at
  // review time, and this sweep resolves anything that predates that fix
  // (legacy rows without the link column) or slipped through another path.
  // It runs only when such rows exist, so steady-state reads stay cheap.
  let visible = normalized;
  try {
    const staleKeys = await staleRequestNotificationKeys(normalized, leaveRows);
    if (staleKeys.size) {
      const idsToDelete = new Set<string>();
      for (const item of normalized) if (staleKeys.has(semanticKey(item))) idsToDelete.add(String(item.id));
      if (idsToDelete.size) {
        await db.delete(schema.notifications).where(inArray(schema.notifications.id, Array.from(idsToDelete)));
        visible = normalized.filter((item) => !staleKeys.has(semanticKey(item)));
      }
    }
  } catch (error) {
    console.warn('[Notifications v2] resolved-request sweep skipped:', error);
  }
  return mergeDuplicates(visible);
}

/** Reviewer-side notification types whose usefulness dies with the request's pending state. */
const REQUEST_REVIEWER_TYPES = new Set(['break_request_requested', 'shift_swap_requested', 'shift_swap_accepted', 'leave_requested', 'overtime_requested']);

/** Extracts "… ليوم YYYY-MM-DD من …" — the date slot of legacy break-request messages. */
function breakDateFromMessage(message: string): string {
  const match = /ليوم\s*(\d{4}-\d{2}-\d{2})\s*من/.exec(String(message ?? ''));
  return match?.[1] ?? '';
}

/**
 * Returns the semantic keys of reviewer notifications whose underlying request
 * is no longer pending (approved / rejected / missing). Break rows written
 * before the related_break_request_id column existed are matched by
 * relatedEmployeeId + the date embedded in the message text.
 */
async function staleRequestNotificationKeys(items: NotificationRecord[], leaveRows: any[]): Promise<Set<string>> {
  const suspicious = items.filter((item) => REQUEST_REVIEWER_TYPES.has(item.type));
  if (!suspicious.length) return new Set();
  const stale = new Set<string>();
  const pendingOnly = (rows: any[]) => new Set(rows.filter((r: any) => clean(r?.status).toLowerCase() === 'pending').map((r: any) => String(r.id)));

  if (suspicious.some((item) => item.type === 'break_request_requested')) {
    const breakRows = (await db.select().from(schema.breakChangeRequests)) as any[];
    const pendingById = pendingOnly(breakRows);
    const pendingByEmployeeDate = new Set(breakRows
      .filter((r: any) => clean(r?.status).toLowerCase() === 'pending')
      .map((r: any) => `${clean(r.employeeId)}|${String(r.date ?? '').slice(0, 10)}`));
    for (const item of suspicious) {
      if (item.type !== 'break_request_requested') continue;
      if (item.relatedBreakRequestId) {
        if (!pendingById.has(String(item.relatedBreakRequestId))) stale.add(semanticKey(item));
        continue;
      }
      const date = breakDateFromMessage(item.message);
      if (date && item.relatedEmployeeId && !pendingByEmployeeDate.has(`${item.relatedEmployeeId}|${date}`)) {
        stale.add(semanticKey(item));
      }
    }
  }

  if (suspicious.some((item) => item.type === 'shift_swap_requested' || item.type === 'shift_swap_accepted')) {
    const rows = await db.select().from(schema.settings).where(eq(schema.settings.key, 'shiftSwapRequests'));
    const swaps: any[] = Array.isArray(rows[0]?.value) ? rows[0].value : [];
    const statusById = new Map(swaps.map((s: any) => [String(s?.id ?? ''), clean(s?.status).toLowerCase()]));
    for (const item of suspicious) {
      const swapId = clean(item.relatedShiftSwapId);
      if (!swapId) continue;
      const status = statusById.get(swapId);
      if (item.type === 'shift_swap_requested' && status !== 'awaiting_target') stale.add(semanticKey(item));
      if (item.type === 'shift_swap_accepted' && status !== 'pending') stale.add(semanticKey(item));
    }
  }

  if (leaveRows.length && suspicious.some((item) => item.type === 'leave_requested')) {
    // Mirror the legacy in-memory filter's guard: an empty/failed leave load
    // must never count as "no pending leaves exist".
    const pendingLeaves = pendingOnly(leaveRows);
    for (const item of suspicious) {
      if (item.type !== 'leave_requested') continue;
      const leaveId = clean(item.relatedLeaveId);
      if (leaveId && !pendingLeaves.has(leaveId)) stale.add(semanticKey(item));
    }
  }

  if (suspicious.some((item) => item.type === 'overtime_requested')) {
    let overtimeRows: any[] = [];
    let overtimeLoaded = false;
    try {
      overtimeRows = await db.select({ id: schema.overtimeRequests.id, status: schema.overtimeRequests.status }).from(schema.overtimeRequests);
      overtimeLoaded = true;
    } catch (error) {
      console.warn('[Notifications v2] overtime validation skipped:', error);
    }
    if (overtimeLoaded) {
      const pendingOvertimes = pendingOnly(overtimeRows);
      for (const item of suspicious) {
        if (item.type !== 'overtime_requested') continue;
        const overtimeId = clean(item.relatedOvertimeId);
        if (overtimeId && !pendingOvertimes.has(overtimeId)) stale.add(semanticKey(item));
      }
    }
  }

  return stale;
}

export async function saveOne(input: any): Promise<NotificationRecord | null> {
  const item = normalize(input); if (!item) return null;
  await ensureReady();
  const key = semanticKey(item);
  const allRows = await db.select().from(schema.notifications).where(eq(schema.notifications.recipientId, item.recipientId));
  const existing: any = allRows.find((row: any) => String(row.id) === item.id) || allRows.find((row: any) => semanticKey(row) === key);
  if (existing) {
    const existingTime = new Date(existing.updatedAt || existing.createdAt || 0).getTime();
    const incomingTime = new Date(item.updatedAt || item.createdAt || 0).getTime();
    if (existing.isRead && !item.isRead) return withTarget({ ...existing, id: String(existing.id), recipientId: String(existing.recipientId) });
    if (Number.isFinite(existingTime) && Number.isFinite(incomingTime) && incomingTime < existingTime) return withTarget({ ...existing, id: String(existing.id), recipientId: String(existing.recipientId) });
    const merged = { ...item, id: String(existing.id), isRead: Boolean(existing.isRead || item.isRead), updatedAt: nowIso() };
    const { id: _ignoredId, link: _link, targetUrl: _targetUrl, ...changes } = merged;
    await db.update(schema.notifications).set(changes as any).where(eq(schema.notifications.id, String(existing.id)));
    return withTarget(merged);
  }
  const { link: _link, targetUrl: _targetUrl, ...dbItem } = item;
  await db.insert(schema.notifications).values(dbItem as any).onConflictDoNothing({ target: schema.notifications.id });
  const persisted = await db.select().from(schema.notifications).where(eq(schema.notifications.id, item.id));
  return persisted[0] ? withTarget({ ...persisted[0], id: String(persisted[0].id), recipientId: String(persisted[0].recipientId) }) : item;
}

async function markRead(id: string, recipientId: string) {
  await ensureReady(); const notificationId = clean(id); const userId = clean(recipientId); if (!notificationId || !userId) return false;
  const rows = await db.select().from(schema.notifications).where(eq(schema.notifications.recipientId, userId));
  let target: any = rows.find((row: any) => String(row.id) === notificationId);
  if (!target) { const byId = await db.select().from(schema.notifications).where(eq(schema.notifications.id, notificationId)); target = byId[0]; }
  if (!target || String(target.recipientId) !== userId) return false;
  const key = semanticKey(target); const matches = rows.filter((row: any) => semanticKey(row) === key); const ids = new Set(matches.map((row: any) => String(row.id))); ids.add(String(target.id));
  await Promise.all(Array.from(ids).map((notificationIdToUpdate: string) => db.update(schema.notifications).set({ isRead: true, updatedAt: nowIso() }).where(eq(schema.notifications.id, notificationIdToUpdate))));
  return true;
}

async function markAllRead(recipientId: string) {
  await ensureReady(); const userId = clean(recipientId); if (!userId) return 0;
  const rows = await db.select({ isRead: schema.notifications.isRead }).from(schema.notifications).where(eq(schema.notifications.recipientId, userId));
  const unreadCount = rows.filter((row: any) => !Boolean(row.isRead)).length;
  await db.update(schema.notifications).set({ isRead: true, updatedAt: nowIso() }).where(eq(schema.notifications.recipientId, userId));
  return unreadCount;
}

function bodyOf(req: Request) { return req.body && typeof req.body === 'object' ? req.body : {}; }

/** Related-id columns usable by resolveRequestNotifications. */
const RELATED_COLUMNS = {
  relatedLeaveId: schema.notifications.relatedLeaveId,
  relatedOvertimeId: schema.notifications.relatedOvertimeId,
  relatedShiftSwapId: schema.notifications.relatedShiftSwapId,
  relatedBreakRequestId: schema.notifications.relatedBreakRequestId,
} as const;

/**
 * Resolves ("consumes") the reviewer-side notifications of a request that
 * reached a final state: deletes every notification pointing at the given
 * request id whose type is one of the supplied reviewer types. Semantic
 * duplicates (client-emitted and server-emitted copies share the related id)
 * are all covered because the match is by column + type, not by id.
 * Callers treat it as best-effort — a failed cleanup must never fail the
 * review itself.
 */
export async function resolveRequestNotifications(options: {
  related: keyof typeof RELATED_COLUMNS;
  relatedId: string;
  types: string[];
}): Promise<number> {
  await ensureReady();
  const relatedId = clean(options.relatedId);
  const types = (options.types ?? []).map((t) => clean(t)).filter(Boolean);
  const column = RELATED_COLUMNS[options.related];
  if (!relatedId || !types.length || !column) return 0;
  const rows = await db.select({ id: schema.notifications.id })
    .from(schema.notifications)
    .where(and(eq(column, relatedId), inArray(schema.notifications.type, types))) as any[];
  if (!rows.length) return 0;
  await db.delete(schema.notifications).where(inArray(schema.notifications.id, rows.map((row: any) => String(row.id))));
  return rows.length;
}

/**
 * Break-request variant: deletes the reviewer's "new break change request"
 * notifications for one request — both rows tagged with the request id (new
 * writes) and legacy rows that predate the related_break_request_id column,
 * matched by relatedEmployeeId + the request date embedded in the message
 * ("… ليوم <date> من …"). Only one pending request per employee+date can
 * exist, so the fallback is unambiguous.
 */
export async function resolveBreakRequestNotifications(requestId: string, employeeId: string, date: string): Promise<number> {
  await ensureReady();
  const reqId = clean(requestId);
  const empId = clean(employeeId);
  const day = clean(date);
  if (!reqId || !empId || !day) return 0;
  const rows = await db.select({ id: schema.notifications.id })
    .from(schema.notifications)
    .where(or(
      eq(schema.notifications.relatedBreakRequestId, reqId),
      and(
        eq(schema.notifications.type, 'break_request_requested'),
        eq(schema.notifications.relatedEmployeeId, empId),
        like(schema.notifications.message, `%ليوم ${day} من%`),
      ),
    )) as any[];
  if (!rows.length) return 0;
  await db.delete(schema.notifications).where(inArray(schema.notifications.id, rows.map((row: any) => String(row.id))));
  return rows.length;
}

export function registerNotificationSystemV2(app: Express) {
  app.get('/api/notifications', async (req, res) => {
    try {
      const notifications = await listForUser(clean(req.query.userId));
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.json({ success: true, notifications });
    } catch (error) {
      console.error('[Notifications v2] GET failed', error);
      res.status(500).json({ success: false, notifications: [], error: 'notifications_unavailable' });
    }
  });
  app.put('/api/notifications/mark-all-read', async (req, res) => {
    try {
      const userId = clean(bodyOf(req).userId || req.query.userId);
      const count = await markAllRead(userId);
      const notifications = await listForUser(userId);
      res.setHeader('Cache-Control', 'no-store');
      res.json({ success: true, count, notifications });
    } catch (error) {
      console.error('[Notifications v2] mark-all-read failed', error);
      res.status(500).json({ success: false, count: 0 });
    }
  });
  app.put('/api/notifications/:id/mark-read', async (req, res) => {
    try {
      const userId = clean(bodyOf(req).userId || req.query.userId);
      const updated = await markRead(req.params.id, userId);
      const notifications = await listForUser(userId);
      res.setHeader('Cache-Control', 'no-store');
      res.json({ success: updated, updated, notifications });
    } catch (error) {
      console.error('[Notifications v2] mark-read failed', error);
      res.status(500).json({ success: false, updated: false });
    }
  });
  app.post('/api/notifications/emit', async (req, res) => {
    try {
      const notification = await saveOne(bodyOf(req).notification || bodyOf(req));
      if (!notification) return res.status(400).json({ success: false, error: 'invalid_notification' });
      publishNotification(notification);
      res.setHeader('Cache-Control', 'no-store');
      res.json({ success: true, notification });
    } catch (error) {
      console.error('[Notifications v2] emit failed', error);
      res.status(500).json({ success: false });
    }
  });
}

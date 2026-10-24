import { eq } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import * as schema from '../src/db/schema.js';

/**
 * Shared "mark notification as read" logic used by BOTH the Express server
 * (server.ts) and the dedicated static-path Vercel functions
 * (api/notifications-read.ts, api/notifications-read-all.ts).
 *
 * Why a static path? Some production Vercel deployments never route dynamic
 * multi-segment /api paths (e.g. PUT /api/notifications/:id/mark-read) to the
 * catch-all function — the platform answers them with its own
 * {"error":{"code":"404","message":"The page could not be found"}} JSON
 * before any application code runs. Static single-segment paths
 * (/api/login, /api/companies, /api/push/register …) are always routed, so
 * the frontend now calls POST /api/notifications-read and
 * POST /api/notifications-read-all instead.
 *
 * The response shapes intentionally match the legacy catch-all handlers
 * (directMarkRead / directMarkAllRead / directNotifications) so old and new
 * clients stay compatible.
 */

type NotificationRow = Record<string, any>;

function relatedIdOf(row: NotificationRow): string {
  return String(row.relatedLeaveId || row.relatedOvertimeId || row.relatedShiftSwapId || '').trim();
}

function semanticKey(row: NotificationRow): string {
  const relatedId = relatedIdOf(row);
  return relatedId
    ? `${String(row.recipientId)}|${String(row.type)}|${relatedId}`
    : `${String(row.recipientId)}|${String(row.type)}|${String(row.title || '').trim()}|${String(row.message || '').trim()}`;
}

/** Same merge + link + ordering behavior as the legacy directNotifications handler. */
export async function listNotificationsForUser(userId: string): Promise<NotificationRow[]> {
  if (!userId) return [];
  const rows = (await db.select().from(schema.notifications).where(eq(schema.notifications.recipientId, userId))) as any[];
  const bySemantic = new Map<string, NotificationRow>();
  for (const row of rows) {
    const key = semanticKey(row);
    const existing = bySemantic.get(key);
    if (!existing) { bySemantic.set(key, row); continue; }
    bySemantic.set(key, {
      ...existing,
      ...row,
      id: String(row.id || existing.id),
      isRead: Boolean(existing.isRead || row.isRead),
      createdAt: new Date(existing.createdAt || row.createdAt || 0).getTime() <= new Date(row.createdAt || existing.createdAt || 0).getTime() ? existing.createdAt : row.createdAt,
    });
  }
  return Array.from(bySemantic.values())
    .map((row) => ({
      ...row,
      id: String(row.id),
      recipientId: String(row.recipientId),
      link: row.relatedLeaveId
        ? `/leaves?leaveId=${encodeURIComponent(String(row.relatedLeaveId))}`
        : row.relatedOvertimeId
          ? `/overtime?overtimeId=${encodeURIComponent(String(row.relatedOvertimeId))}`
          : row.relatedShiftSwapId
            ? `/schedule?shiftSwapId=${encodeURIComponent(String(row.relatedShiftSwapId))}`
            : '/notifications',
    }))
    .sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
}

/**
 * Marks a notification (and every semantically-identical duplicate) as read.
 * Mirrors the legacy PUT /api/notifications/:id/mark-read handler.
 */
export async function markNotificationRead(userId: string, id: string): Promise<{ ok: boolean; status?: number }> {
  const cleanUserId = String(userId ?? '').trim();
  const cleanId = String(id ?? '').trim();
  if (!cleanUserId || !cleanId) return { ok: false, status: 400 };
  const rows = (await db.select().from(schema.notifications).where(eq(schema.notifications.recipientId, cleanUserId))) as any[];
  const target = rows.find((row) => String(row.id) === cleanId);
  if (!target) return { ok: false, status: 404 };
  const relatedId = relatedIdOf(target);
  const sameNotification = (row: NotificationRow) => {
    if (relatedId) return String(row.type || '') === String(target.type || '') && relatedIdOf(row) === relatedId;
    return String(row.type || '') === String(target.type || '')
      && String(row.title || '').trim() === String(target.title || '').trim()
      && String(row.message || '').trim() === String(target.message || '').trim();
  };
  const matchingIds = rows.filter(sameNotification).map((row) => String(row.id)).filter(Boolean);
  await Promise.all(matchingIds.map((notificationId) =>
    db.update(schema.notifications).set({ isRead: true, updatedAt: new Date().toISOString() } as any).where(eq(schema.notifications.id, notificationId))));
  return { ok: true };
}

/** Marks every notification of the user as read. Mirrors the legacy mark-all-read handler. */
export async function markAllNotificationsRead(userId: string): Promise<{ ok: boolean; unread?: number }> {
  const cleanUserId = String(userId ?? '').trim();
  if (!cleanUserId) return { ok: false };
  const rows = (await db.select({ isRead: schema.notifications.isRead }).from(schema.notifications).where(eq(schema.notifications.recipientId, cleanUserId))) as any[];
  const unread = rows.filter((row) => !Boolean(row.isRead)).length;
  await db.update(schema.notifications).set({ isRead: true, updatedAt: new Date().toISOString() } as any).where(eq(schema.notifications.recipientId, cleanUserId));
  return { ok: true, unread };
}

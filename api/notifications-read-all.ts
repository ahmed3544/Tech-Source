import { ensureSchema } from "../server/ensure-schema.js";
import { listNotificationsForUser, markAllNotificationsRead } from "../server/notification-reads.js";

/**
 * Static-path alias for PUT /api/notifications/mark-all-read (see
 * api/employees-update.ts for why dynamic multi-segment /api paths cannot be
 * trusted on all Vercel deployments). The frontend calls
 * POST /api/notifications-read-all { userId }.
 *
 * Response shapes match the legacy catch-all handlers exactly.
 */
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'METHOD_NOT_ALLOWED' });
  }
  try { await ensureSchema(); } catch { /* logged inside ensureSchema */ }

  try {
    let body: any = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body || '{}'); } catch { body = {}; } }
    const userId = String(body?.userId ?? req.query?.userId ?? '').trim();
    if (!userId) return res.status(400).json({ success: false, count: 0 });

    const result = await markAllNotificationsRead(userId);
    if (!result.ok) return res.status(400).json({ success: false, count: 0 });
    return res.json({ success: true, notifications: await listNotificationsForUser(userId) });
  } catch (error: any) {
    console.error('[notifications-read-all] failed:', error?.message || error);
    return res.status(500).json({ success: false, error: 'database_unavailable' });
  }
}

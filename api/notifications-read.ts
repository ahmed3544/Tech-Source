import { ensureSchema } from "../server/ensure-schema.js";
import { listNotificationsForUser, markNotificationRead } from "../server/notification-reads.js";

/**
 * Static-path alias for PUT /api/notifications/:id/mark-read (see
 * api/employees-update.ts for why dynamic multi-segment /api paths cannot be
 * trusted on all Vercel deployments). The frontend calls
 * POST /api/notifications-read { userId, id }.
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
    const id = String(body?.id ?? '').trim();
    if (!userId || !id) return res.status(400).json({ success: false, updated: false });

    const result = await markNotificationRead(userId, id);
    if (!result.ok) return res.status(result.status ?? 400).json({ success: false, updated: false });
    return res.json({ success: true, notifications: await listNotificationsForUser(userId) });
  } catch (error: any) {
    console.error('[notifications-read] failed:', error?.message || error);
    return res.status(500).json({ success: false, error: 'database_unavailable' });
  }
}

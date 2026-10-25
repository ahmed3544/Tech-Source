import { and, desc, gte, like, lte, eq } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import * as schema from '../src/db/schema.js';
import { authenticateRequest, isManagerRole, requireManager } from './auth.js';

/**
 * Activity log (audit trail) — "who changed what".
 *
 * Every meaningful mutation in the app writes one row here:
 *   employee.create / employee.update / employee.delete
 *   schedule.update / schedule.import_excel
 *   breaks.update
 *   break_request.submit / break_request.approve / break_request.reject
 *   swap.submit / swap.accept / swap.reject / swap.approve  (reported by the client)
 *   auth.login
 *
 * Writing is fire-and-forget: a logging failure must NEVER break the user's
 * actual operation, so logActivity() swallows and only logs to the console.
 *
 * Endpoints (registered for both the Express server and the Vercel catch-all
 * because both bundle the same app):
 *   GET  /api/activity-logs — leaders/admins only, newest first, filters.
 *   POST /api/activity-log  — any authenticated employee; whitelist of
 *                             client-side actions (shift swap flow).
 */

export type ActivityAction =
  | 'employee.create' | 'employee.update' | 'employee.delete'
  | 'schedule.update' | 'schedule.import_excel'
  | 'breaks.update'
  | 'break_request.submit' | 'break_request.approve' | 'break_request.reject'
  | 'swap.submit' | 'swap.accept' | 'swap.reject' | 'swap.approve' | 'swap.cancel'
  | 'auth.login';

/** Actions the client may self-report (shift swap flow has no dedicated endpoint). */
const CLIENT_ACTIONS = new Set<string>(['swap.submit', 'swap.accept', 'swap.reject', 'swap.approve', 'swap.cancel']);

const MAX_DETAILS_LENGTH = 4000;

export interface ActivityEntry {
  actorId: string;
  actorName?: string | null;
  actorRole?: string | null;
  action: ActivityAction | string;
  entityType?: string | null;
  entityId?: string | null;
  entityLabel?: string | null;
  details?: unknown;
  companyId?: string | null;
}

/** Never awaits: insert the row in the background, swallow every error. */
export function logActivity(entry: ActivityEntry): void {
  void (async () => {
    try {
      let details: string | null = null;
      if (entry.details !== undefined && entry.details !== null) {
        details = typeof entry.details === 'string' ? entry.details : JSON.stringify(entry.details);
        if (details.length > MAX_DETAILS_LENGTH) details = details.slice(0, MAX_DETAILS_LENGTH);
      }
      await db.insert(schema.activityLogs).values({
        id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        companyId: entry.companyId ?? 'tech-source',
        actorId: String(entry.actorId ?? '').slice(0, 255),
        actorName: entry.actorName ? String(entry.actorName).slice(0, 255) : null,
        actorRole: entry.actorRole ? String(entry.actorRole).slice(0, 64) : null,
        action: String(entry.action ?? '').slice(0, 64),
        entityType: entry.entityType ? String(entry.entityType).slice(0, 64) : null,
        entityId: entry.entityId ? String(entry.entityId).slice(0, 255) : null,
        entityLabel: entry.entityLabel ? String(entry.entityLabel).slice(0, 512) : null,
        details,
        createdAt: new Date().toISOString(),
      } as any);
    } catch (error: any) {
      console.warn('[activity-log] write failed (ignored):', error?.message || error);
    }
  })();
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function registerActivityLogs(app: any) {
  // GET /api/activity-logs?limit=200&action=employee&actorId=..&from=YYYY-MM-DD&to=YYYY-MM-DD
  app.get('/api/activity-logs', async (req: any, res: any) => {
    try {
      const manager = await requireManager(req, (status: number, body: unknown) => res.status(status).json(body));
      if (!manager) return;

      const limitRaw = Number(req.query?.limit ?? 200);
      const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), 500) : 200;
      const action = String(req.query?.action ?? '').trim().toLowerCase();
      const actorId = String(req.query?.actorId ?? '').trim();
      const from = String(req.query?.from ?? '').trim();
      const to = String(req.query?.to ?? '').trim();

      const filters: any[] = [];
      if (action) filters.push(like(schema.activityLogs.action, `${action}%`));
      if (actorId) filters.push(eq(schema.activityLogs.actorId, actorId));
      // createdAt is an ISO string, so lexicographic comparison works for dates.
      if (DATE_RE.test(from)) filters.push(gte(schema.activityLogs.createdAt, `${from}T00:00:00.000Z`));
      if (DATE_RE.test(to)) filters.push(lte(schema.activityLogs.createdAt, `${to}T23:59:59.999Z`));

      const rows = await db
        .select()
        .from(schema.activityLogs)
        .where(filters.length ? and(...filters) : undefined)
        .orderBy(desc(schema.activityLogs.createdAt))
        .limit(limit);

      res.setHeader('Cache-Control', 'no-store');
      return res.json({ success: true, logs: rows, lastUpdated: Date.now() });
    } catch (error: any) {
      console.error('[activity-log] GET failed:', error?.message || error);
      return res.status(500).json({ success: false, error: 'Could not load the activity log.' });
    }
  });

  // POST /api/activity-log — client-reported actions (shift swap flow).
  // The actor is always the AUTHENTICATED employee; the body can never
  // impersonate someone else. Only whitelisted swap.* actions are accepted.
  app.post('/api/activity-log', async (req: any, res: any) => {
    try {
      const auth = await authenticateRequest(req);
      if (auth.ok === false) return res.status(auth.status).json({ success: false, error: auth.error });

      const body = req.body ?? {};
      const action = String(body.action ?? '').trim();
      if (!CLIENT_ACTIONS.has(action)) {
        return res.status(400).json({ success: false, error: 'Unsupported activity action.' });
      }
      const entity = body.entityType && typeof body.entityType === 'string' ? body.entityType : 'swap';
      logActivity({
        actorId: auth.employee.id,
        actorRole: isManagerRole(auth.employee.role) ? 'leader' : 'employee',
        action,
        entityType: entity.slice(0, 64),
        entityId: typeof body.entityId === 'string' ? body.entityId : null,
        entityLabel: typeof body.entityLabel === 'string' ? body.entityLabel.slice(0, 512) : null,
        details: body.details ?? null,
        companyId: (auth.employee as any).companyId ?? 'tech-source',
      });
      return res.json({ success: true });
    } catch (error: any) {
      console.error('[activity-log] POST failed:', error?.message || error);
      return res.status(500).json({ success: false, error: 'Could not record the activity.' });
    }
  });
}

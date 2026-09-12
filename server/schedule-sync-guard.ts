import { eq } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import * as schema from '../src/db/schema.js';

const isSyncPath = (req:any) => ['/api/sync','/sync'].includes(String(req.path || req.url || '').split('?')[0].replace(/\/+$/,'') || '/');

async function upsertSetting(key:string, value:any) {
  await db.insert(schema.settings).values({ key, value } as any).onConflictDoUpdate({
    target: schema.settings.key,
    set: { value } as any,
  });
}

export function registerScheduleSyncGuard(app:any) {
  app.use(async (req:any, res:any, next:any) => {
    if (req.method !== 'POST' || !isSyncPath(req)) return next();
    const body = req.body || {};
    let handled = false;
    try {
      for (const key of ['dailyShiftAssignments', 'shiftSwapRequests']) {
        if (!Array.isArray(body[key])) continue;
        await upsertSetting(key, body[key]);
        await upsertSetting(`__sync_updated_at:${key}`, new Date().toISOString());
        delete body[key];
        handled = true;
      }
      if (handled) req.body = body;
      return next();
    } catch (error) {
      console.error('[schedule-sync-guard]', error);
      return res.status(500).json({ success:false, error:'SCHEDULE_SYNC_FAILED' });
    }
  });
}

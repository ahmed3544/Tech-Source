import { eq } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import * as schema from '../src/db/schema.js';

export function registerDirectScheduleSync(app:any) {
  app.post('/api/schedule-sync', async (req:any, res:any) => {
    try {
      const assignments = Array.isArray(req.body?.dailyShiftAssignments)
        ? req.body.dailyShiftAssignments
        : null;
      if (!assignments) {
        return res.status(400).json({ success:false, error:'dailyShiftAssignments must be an array' });
      }

      const existing = await db.select().from(schema.settings).where(eq(schema.settings.key, 'dailyShiftAssignments'));
      if (existing[0]) {
        await db.update(schema.settings)
          .set({ value: assignments } as any)
          .where(eq(schema.settings.key, 'dailyShiftAssignments'));
      } else {
        await db.insert(schema.settings).values({ key:'dailyShiftAssignments', value:assignments } as any);
      }

      const stamp = new Date().toISOString();
      const stampKey = '__sync_updated_at:dailyShiftAssignments';
      const stampRow = await db.select().from(schema.settings).where(eq(schema.settings.key, stampKey));
      if (stampRow[0]) {
        await db.update(schema.settings).set({ value:stamp } as any).where(eq(schema.settings.key, stampKey));
      } else {
        await db.insert(schema.settings).values({ key:stampKey, value:stamp } as any);
      }

      return res.json({ success:true, dailyShiftAssignments:assignments, lastUpdated:Date.now() });
    } catch (error) {
      console.error('[direct-schedule-sync]', error);
      return res.status(500).json({ success:false, error:'DIRECT_SCHEDULE_SYNC_FAILED' });
    }
  });
}

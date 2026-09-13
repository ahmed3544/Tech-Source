import { eq } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import * as schema from '../src/db/schema.js';

const normalizeAssignment = (item:any) => {
  const employeeId = String(item?.employeeId ?? item?.employee_id ?? '').trim();
  const date = String(item?.date ?? item?.scheduleDate ?? item?.schedule_date ?? '').slice(0, 10);
  const isOffDay = Boolean(item?.isOffDay ?? item?.is_off_day ?? String(item?.status ?? '').toUpperCase() === 'OFF');
  const shiftId = isOffDay ? '' : String(item?.shiftId ?? item?.shift_id ?? '').trim();
  return { employeeId, date, shiftId, isOffDay, assignedBy: item?.assignedBy ?? item?.assigned_by, updatedAt: item?.updatedAt ?? item?.updated_at };
};

export function registerDirectScheduleSync(app:any) {
  app.post('/api/schedule-sync', async (req:any, res:any) => {
    try {
      if (!Array.isArray(req.body?.dailyShiftAssignments)) {
        return res.status(400).json({ success:false, error:'dailyShiftAssignments must be an array' });
      }

      const received = req.body.dailyShiftAssignments.map(normalizeAssignment).filter((x:any) => x.employeeId && /^\d{4}-\d{2}-\d{2}$/.test(x.date));
      const stamp = new Date().toISOString();
      const assignments = received.map((x:any) => ({ ...x, updatedAt: x.updatedAt || stamp }));

      const existing = await db.select().from(schema.settings).where(eq(schema.settings.key, 'dailyShiftAssignments'));
      if (existing[0]) {
        await db.update(schema.settings)
          .set({ value: assignments } as any)
          .where(eq(schema.settings.key, 'dailyShiftAssignments'));
      } else {
        await db.insert(schema.settings).values({ key:'dailyShiftAssignments', value:assignments } as any);
      }

      const stampKey = '__sync_updated_at:dailyShiftAssignments';
      const stampRow = await db.select().from(schema.settings).where(eq(schema.settings.key, stampKey));
      if (stampRow[0]) {
        await db.update(schema.settings).set({ value:stamp } as any).where(eq(schema.settings.key, stampKey));
      } else {
        await db.insert(schema.settings).values({ key:stampKey,value:stamp } as any);
      }

      return res.json({ success:true, dailyShiftAssignments:assignments, lastUpdated:Date.now(), updatedAt:stamp });
    } catch (error) {
      console.error('[direct-schedule-sync]', error);
      return res.status(500).json({ success:false, error:'DIRECT_SCHEDULE_SYNC_FAILED' });
    }
  });
}

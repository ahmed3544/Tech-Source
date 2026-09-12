import { eq } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import * as schema from '../src/db/schema.js';

const isSyncPath = (req:any) => String(req.path || req.url || '').split('?')[0].replace(/\/+$/,'') === '/api/sync';
const ms = (v:any) => {
  const n = new Date(String(v ?? '')).getTime();
  return Number.isFinite(n) ? n : 0;
};

function mergeAssignments(existing:any, incoming:any) {
  const oldItems = Array.isArray(existing) ? existing : [];
  const newItems = Array.isArray(incoming) ? incoming : [];
  const key = (x:any) => `${String(x?.employeeId ?? '')}:${String(x?.date ?? '')}`;
  const map = new Map<string, any>();
  for (const x of oldItems) map.set(key(x), x);
  for (const x of newItems) {
    const k = key(x);
    const old = map.get(k);
    if (!old || ms(x?.updatedAt) >= ms(old?.updatedAt)) map.set(k, x);
  }
  return Array.from(map.values()).filter((x:any) => x?.employeeId && x?.date);
}

async function writeSetting(key:string, value:any) {
  const rows = await db.select().from(schema.settings).where(eq(schema.settings.key, key));
  if (rows[0]) {
    await db.update(schema.settings).set({ value } as any).where(eq(schema.settings.key, key));
    return;
  }
  try {
    await db.insert(schema.settings).values({ key, value } as any);
  } catch {
    const retry = await db.select().from(schema.settings).where(eq(schema.settings.key, key));
    if (retry[0]) await db.update(schema.settings).set({ value } as any).where(eq(schema.settings.key, key));
    else throw new Error(`SETTINGS_WRITE_FAILED:${key}`);
  }
}

export function registerSafeScheduleSync(app:any) {
  app.use(async (req:any, res:any, next:any) => {
    if (!isSyncPath(req) || req.method !== 'POST') return next();
    const body = req.body || {};
    if (!Array.isArray(body.dailyShiftAssignments)) return next();
    if (!(process.env.DATABASE_URL || process.env.SUPABASE_DB_URL)) return next();

    try {
      const key = 'dailyShiftAssignments';
      const rows = await db.select().from(schema.settings).where(eq(schema.settings.key, key));
      const merged = mergeAssignments(rows[0]?.value, body.dailyShiftAssignments);
      await writeSetting(key, merged);
      await writeSetting('__sync_updated_at:dailyShiftAssignments', new Date().toISOString());
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      return res.status(200).json({ success:true, synced:true, dailyShiftAssignments:merged, lastUpdated:Date.now() });
    } catch (error) {
      console.error('[safe-schedule-sync]', error);
      return res.status(500).json({ success:false, error:'SCHEDULE_SYNC_FAILED', message:'تعذر حفظ جدول الموظفين على السيرفر.' });
    }
  });
}

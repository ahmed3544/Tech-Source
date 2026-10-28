import { eq, inArray } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import * as schema from '../src/db/schema.js';
import { canManageEmployee, isPlatformAdmin, requireManager } from './auth.js';
import { logActivity } from './activity-logs.js';

const asBoolean = (value:any) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'off';
};

const HHMM = /^(\d{1,2}):(\d{2})$/;
const minutesOf = (value:any): number => {
  const m = HHMM.exec(String(value ?? '').trim());
  if (!m) return NaN;
  const h = Number(m[1]); const mins = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(mins) || h > 23 || mins > 59) return NaN;
  return h * 60 + mins;
};
/** Parses + validates an optional shadowing (training) window. Invalid shapes
 *  are dropped (null) instead of failing the whole schedule write. Same-day
 *  window only: end must be strictly after start.
 *  TRI-STATE: 'shadowing' key ABSENT → undefined (keep whatever is stored),
 *  null/invalid → null (remove), object → set. Absent-key preservation stops
 *  older clients and bulk importers from accidentally wiping sessions. */
const normalizeShadowing = (raw:any): { traineeId?: string; startTime: string; endTime: string } | null | undefined => {
  if (raw === undefined) return undefined;
  if (!raw || typeof raw !== 'object') return null;
  const start = minutesOf(raw.startTime ?? raw.start_time ?? raw.start);
  const end = minutesOf(raw.endTime ?? raw.end_time ?? raw.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  const traineeId = String(raw.traineeId ?? raw.trainee_id ?? '').trim();
  return {
    ...(traineeId ? { traineeId } : {}),
    startTime: String(raw.startTime ?? raw.start_time ?? raw.start).trim().slice(0, 5).padStart(5, '0'),
    endTime: String(raw.endTime ?? raw.end_time ?? raw.end).trim().slice(0, 5).padStart(5, '0'),
  };
};
const sameShadowing = (a:any, b:any) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

const normalizeAssignment = (item:any) => {
  const employeeId = String(item?.employeeId ?? item?.employee_id ?? '').trim();
  const date = String(item?.date ?? item?.scheduleDate ?? item?.schedule_date ?? '').slice(0, 10);
  const rawShiftId = String(item?.shiftId ?? item?.shift_id ?? '').trim();
  const status = String(item?.status ?? '').trim().toUpperCase();
  const clear = Boolean(item?.clear || item?.isClear || item?.is_clear || status === 'CLEAR');
  const isOffDay = !clear && !rawShiftId && (asBoolean(item?.isOffDay ?? item?.is_off_day) || status === 'OFF');
  const shiftId = clear || isOffDay ? '' : rawShiftId;
  return { employeeId, date, shiftId, isOffDay, clear, shadowing: item && typeof item === 'object' && 'shadowing' in item ? normalizeShadowing(item.shadowing) : undefined, assignedBy: item?.assignedBy ?? item?.assigned_by, updatedAt: item?.updatedAt ?? item?.updated_at };
};

const normalizePattern = (item:any) => ({
  id: String(item?.id ?? '').trim(), name: String(item?.name ?? '').trim(),
  shiftIds: Array.isArray(item?.shiftIds) ? item.shiftIds.map((x:any)=>String(x)).filter(Boolean) : [],
  createdAt: String(item?.createdAt ?? item?.created_at ?? new Date().toISOString()),
  updatedAt: String(item?.updatedAt ?? item?.updated_at ?? new Date().toISOString()),
});
const normalizePatternItem = (item:any) => ({ id:String(item?.id ?? '').trim(), patternId:String(item?.patternId ?? item?.pattern_id ?? '').trim(), shiftId:String(item?.shiftId ?? item?.shift_id ?? '').trim(), sequence:Number(item?.sequence ?? 0) });
async function persistRotationPatterns(patterns:any[], items:any[]) {
  for (const raw of patterns) { const p=normalizePattern(raw); if(!p.id||!p.name)continue; const existing=await db.select().from(schema.rotationPatterns).where(eq(schema.rotationPatterns.id,p.id)); if(existing[0]) await db.update(schema.rotationPatterns).set(p as any).where(eq(schema.rotationPatterns.id,p.id)); else await db.insert(schema.rotationPatterns).values(p as any); }
  for (const raw of items) { const item=normalizePatternItem(raw); if(!item.id||!item.patternId||!item.shiftId)continue; const existing=await db.select().from(schema.rotationPatternItems).where(eq(schema.rotationPatternItems.id,item.id)); if(existing[0]) await db.update(schema.rotationPatternItems).set(item as any).where(eq(schema.rotationPatternItems.id,item.id)); else await db.insert(schema.rotationPatternItems).values(item as any); }
}
async function deleteRotationRows(patternIds:any[], itemIds:any[]) {
  for(const id of(Array.isArray(itemIds)?itemIds:[]).map(String).filter(Boolean)) await db.delete(schema.rotationPatternItems).where(eq(schema.rotationPatternItems.id,id));
  for(const id of(Array.isArray(patternIds)?patternIds:[]).map(String).filter(Boolean)){await db.delete(schema.rotationPatternItems).where(eq(schema.rotationPatternItems.patternId,id));await db.delete(schema.rotationPatterns).where(eq(schema.rotationPatterns.id,id));}
}
async function rotationSnapshot(){const [patterns,items]=await Promise.all([db.select().from(schema.rotationPatterns),db.select().from(schema.rotationPatternItems)]);return{rotationPatterns:patterns,rotationPatternItems:items};}

export function registerDirectScheduleSync(app:any) {
  app.get('/api/rotation-patterns',async(_req:any,res:any)=>{try{return res.json({success:true,...(await rotationSnapshot())});}catch(error){console.error('[rotation-patterns] GET failed',error);return res.status(500).json({success:false,error:'ROTATION_PATTERNS_READ_FAILED'});}});
  app.post('/api/rotation-patterns',async(req:any,res:any)=>{try{await persistRotationPatterns(Array.isArray(req.body?.rotationPatterns)?req.body.rotationPatterns:(req.body?.pattern?[req.body.pattern]:[]),Array.isArray(req.body?.rotationPatternItems)?req.body.rotationPatternItems:[]);await deleteRotationRows(req.body?.deletedRotationPatternIds,req.body?.deletedRotationPatternItemIds);return res.json({success:true,...(await rotationSnapshot())});}catch(error){console.error('[rotation-patterns] POST failed',error);return res.status(500).json({success:false,error:'ROTATION_PATTERNS_SAVE_FAILED'});}});
  app.use(async(req:any,res:any,next:any)=>{const pathName=String(req.path||'').split('?')[0];if(req.method!=='POST'||!['/api/sync','/sync'].includes(pathName))return next();const body=req.body||{};const hasRotationPayload=Array.isArray(body.rotationPatterns)||Array.isArray(body.rotationPatternItems)||Array.isArray(body.deletedRotationPatternIds)||Array.isArray(body.deletedRotationPatternItemIds);if(!hasRotationPayload)return next();try{await persistRotationPatterns(body.rotationPatterns||[],body.rotationPatternItems||[]);await deleteRotationRows(body.deletedRotationPatternIds,body.deletedRotationPatternItemIds);return next();}catch(error){console.error('[rotation-sync] persistence failed',error);return res.status(500).json({success:false,error:'Rotation sync failed'});}});

  app.get('/api/schedule-sync', async (_req:any, res:any) => {
    try {
      const rows = await db.select().from(schema.settings).where(eq(schema.settings.key, 'dailyShiftAssignments'));
      const assignments = Array.isArray(rows[0]?.value)
        ? rows[0].value
            .map(normalizeAssignment)
            .filter((x:any) => x.employeeId && /^\d{4}-\d{2}-\d{2}$/.test(x.date))
            .map((x:any) => ({
              employeeId: x.employeeId,
              date: x.date,
              shiftId: x.shiftId || '',
              isOffDay: Boolean(x.isOffDay),
              shadowing: x.shadowing ?? null,
              assignedBy: x.assignedBy,
              updatedAt: x.updatedAt,
            }))
        : [];
      return res.json({ success: true, dailyShiftAssignments: assignments });
    } catch (error) {
      console.error('[schedule-sync] GET failed', error);
      return res.status(500).json({ success: false, error: 'DIRECT_SCHEDULE_READ_FAILED' });
    }
  });

  app.post('/api/schedule-sync',async(req:any,res:any)=>{
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    try {
      // Server-side permission check: only admins and team leaders may edit
      // schedules, and leaders are scoped to their own team.
      const manager = await requireManager(req, (status, body) => res.status(status).json(body));
      if (!manager) return;
      if(!Array.isArray(req.body?.dailyShiftAssignments)) return res.status(400).json({success:false,error:'dailyShiftAssignments must be an array'});
      const receivedRaw=req.body.dailyShiftAssignments.map(normalizeAssignment).filter((x:any)=>x.employeeId&&/^\d{4}-\d{2}-\d{2}$/.test(x.date));
      if (!isPlatformAdmin(manager.role) && receivedRaw.length) {
        const targetIds: string[] = Array.from(new Set<string>(receivedRaw.map((x:any)=>String(x.employeeId))));
        const targets = await db.select().from(schema.employees).where(inArray(schema.employees.id, targetIds));
        const byId = new Map<string, any>(targets.map((t:any)=>[String(t.id), t] as [string, any]));
        const denied = targetIds.filter((tid) => !canManageEmployee(manager, byId.get(tid)));
        if (denied.length) {
          console.warn(`[schedule-sync] ${requestId} denied for team scoping`, { managerId: manager.id, denied });
          return res.status(403).json({ success:false, error:'You can only edit schedules for employees in your own team.', deniedEmployeeIds: denied });
        }
      }
      const received=receivedRaw;
      const stamp=new Date().toISOString();
      const incoming=received.map((x:any)=>({...x,updatedAt:x.updatedAt||stamp}));
      const existingRows=await db.select().from(schema.settings).where(eq(schema.settings.key,'dailyShiftAssignments'));
      const existing=Array.isArray(existingRows[0]?.value)?existingRows[0].value.map(normalizeAssignment):[];
      const merged=new Map<string,any>();
      const previousShadowingByRow=new Map<string, any>();
      for(const row of existing) if(row.employeeId&&row.date) { merged.set(`${row.employeeId}|${row.date}`,row); previousShadowingByRow.set(`${row.employeeId}|${row.date}`,row.shadowing??null); }
      for(const row of incoming){
        const key=`${row.employeeId}|${row.date}`; const previous=merged.get(key);
        const previousTime=Date.parse(String(previous?.updatedAt||'')); const incomingTime=Date.parse(String(row.updatedAt||stamp));
        if(!previous||!Number.isFinite(previousTime)||!Number.isFinite(incomingTime)||incomingTime>=previousTime) {
          if(row.clear) merged.delete(key); else merged.set(key,row);
        }
      }
      // Absent shadowing key → carry the previously stored window forward.
      const assignments=Array.from(merged.values()).map(row=>({employeeId:row.employeeId,date:row.date,shiftId:row.shiftId||'',isOffDay:Boolean(row.isOffDay),shadowing:(row.shadowing===undefined?(previousShadowingByRow.get(`${row.employeeId}|${row.date}`)):row.shadowing)??null,assignedBy:row.assignedBy,updatedAt:row.updatedAt||stamp}));
      if(existingRows[0]) await db.update(schema.settings).set({value:assignments} as any).where(eq(schema.settings.key,'dailyShiftAssignments')); else await db.insert(schema.settings).values({key:'dailyShiftAssignments',value:assignments} as any);
      const stampKey='__sync_updated_at:dailyShiftAssignments'; const stampRow=await db.select().from(schema.settings).where(eq(schema.settings.key,stampKey));
      if(stampRow[0]) await db.update(schema.settings).set({value:stamp} as any).where(eq(schema.settings.key,stampKey)); else await db.insert(schema.settings).values({key:stampKey,value:stamp} as any);
      // Activity log: one summary entry per successful schedule write. The
      // Excel import reports itself with body.source='excel-import' so the
      // audit trail can distinguish bulk imports from manual edits.
      {
        const isImport = String(req.body?.source ?? '') === 'excel-import';
        const existingByKey = new Map<string, any>();
        for (const row of existing) existingByKey.set(`${row.employeeId}|${row.date}`, row);
        const changedItems: any[] = [];
        for (const row of received) {
          const prev = existingByKey.get(`${row.employeeId}|${row.date}`);
          const from = prev ? (prev.isOffDay ? 'OFF' : (prev.shiftId || 'WORKING')) : null;
          const to = row.clear ? null : (row.isOffDay ? 'OFF' : (row.shiftId || 'WORKING'));
          // Shadowing window changes are audited alongside the shift/status change.
          // undefined = payload left the key out (keep) → not a change by itself.
          const shadowChanged = row.shadowing !== undefined && (!prev ? Boolean(row.shadowing) : !sameShadowing(prev.shadowing, row.shadowing));
          const shadowLabel = (s: any) => (s ? `Shadowing ${s.startTime}-${s.endTime}${s.traineeId ? ` w/${s.traineeId}` : ''}` : null);
          if (row.clear) { if (prev) changedItems.push({ employeeId: row.employeeId, date: row.date, from, to, ...(shadowChanged ? { shadowingFrom: shadowLabel(prev?.shadowing), shadowingTo: null } : {}) }); continue; }
          if (!prev || String(prev.shiftId || '') !== String(row.shiftId || '') || Boolean(prev.isOffDay) !== Boolean(row.isOffDay) || shadowChanged) {
            changedItems.push({ employeeId: row.employeeId, date: row.date, from, to, ...(shadowChanged ? { shadowingFrom: shadowLabel(prev?.shadowing), shadowingTo: shadowLabel(row.shadowing) } : {}) });
          }
        }
        if (changedItems.length || isImport) {
          const dates = received.map((x: any) => String(x.date)).sort();
          logActivity({
            actorId: manager.id,
            actorName: (manager as any).nameAr || (manager as any).nameEn || manager.id,
            actorRole: manager.role,
            action: isImport ? 'schedule.import_excel' : 'schedule.update',
            entityType: 'schedule',
            entityLabel: dates.length ? `${dates[0]} → ${dates[dates.length - 1]}` : null,
            details: {
              changes: changedItems.length,
              received: received.length,
              ...(isImport ? { breakDays: Math.max(0, Number(req.body?.breaksCount ?? 0) || 0) } : {}),
              items: changedItems.slice(0, 40),
            },
          });
        }
      }
      console.log(`[schedule-sync] ${requestId} saved`, { received: received.length, total: assignments.length });
      return res.json({success:true,dailyShiftAssignments:assignments,lastUpdated:Date.now(),updatedAt:stamp,syncRequestId:requestId});
    } catch(error){console.error(`[direct-schedule-sync] ${requestId} failed`,error);return res.status(500).json({success:false,error:'DIRECT_SCHEDULE_SYNC_FAILED',syncRequestId:requestId});}
  });
}
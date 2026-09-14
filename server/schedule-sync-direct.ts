import { eq } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import * as schema from '../src/db/schema.js';

const asBoolean = (value:any) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'off';
};

const normalizeAssignment = (item:any) => {
  const employeeId = String(item?.employeeId ?? item?.employee_id ?? '').trim();
  const date = String(item?.date ?? item?.scheduleDate ?? item?.schedule_date ?? '').slice(0, 10);
  const rawShiftId = String(item?.shiftId ?? item?.shift_id ?? '').trim();
  const status = String(item?.status ?? '').trim().toUpperCase();
  const clear = Boolean(item?.clear || item?.isClear || item?.is_clear || status === 'CLEAR');
  const isOffDay = !clear && !rawShiftId && (asBoolean(item?.isOffDay ?? item?.is_off_day) || status === 'OFF');
  const shiftId = clear || isOffDay ? '' : rawShiftId;
  return { employeeId, date, shiftId, isOffDay, clear, assignedBy: item?.assignedBy ?? item?.assigned_by, updatedAt: item?.updatedAt ?? item?.updated_at };
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

  app.post('/api/schedule-sync',async(req:any,res:any)=>{
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    try {
      console.log(`[schedule-sync] ${requestId} POST received`, { count: Array.isArray(req.body?.dailyShiftAssignments) ? req.body.dailyShiftAssignments.length : -1 });
      if(!Array.isArray(req.body?.dailyShiftAssignments)) return res.status(400).json({success:false,error:'dailyShiftAssignments must be an array'});
      const received=req.body.dailyShiftAssignments.map(normalizeAssignment).filter((x:any)=>x.employeeId&&/^\d{4}-\d{2}-\d{2}$/.test(x.date));
      const stamp=new Date().toISOString();
      const incoming=received.map((x:any)=>({...x,updatedAt:x.updatedAt||stamp}));
      const existingRows=await db.select().from(schema.settings).where(eq(schema.settings.key,'dailyShiftAssignments'));
      const existing=Array.isArray(existingRows[0]?.value)?existingRows[0].value.map(normalizeAssignment):[];
      const merged=new Map<string,any>();
      for(const row of existing) if(row.employeeId&&row.date) merged.set(`${row.employeeId}|${row.date}`,row);
      for(const row of incoming){
        const key=`${row.employeeId}|${row.date}`; const previous=merged.get(key);
        const previousTime=Date.parse(String(previous?.updatedAt||'')); const incomingTime=Date.parse(String(row.updatedAt||stamp));
        if(!previous||!Number.isFinite(previousTime)||!Number.isFinite(incomingTime)||incomingTime>=previousTime) {
          if(row.clear) merged.delete(key); else merged.set(key,row);
        }
      }
      const assignments=Array.from(merged.values()).map(row=>({employeeId:row.employeeId,date:row.date,shiftId:row.shiftId||'',isOffDay:Boolean(row.isOffDay),assignedBy:row.assignedBy,updatedAt:row.updatedAt||stamp}));
      if(existingRows[0]) await db.update(schema.settings).set({value:assignments} as any).where(eq(schema.settings.key,'dailyShiftAssignments')); else await db.insert(schema.settings).values({key:'dailyShiftAssignments',value:assignments} as any);
      const stampKey='__sync_updated_at:dailyShiftAssignments'; const stampRow=await db.select().from(schema.settings).where(eq(schema.settings.key,stampKey));
      if(stampRow[0]) await db.update(schema.settings).set({value:stamp} as any).where(eq(schema.settings.key,stampKey)); else await db.insert(schema.settings).values({key:stampKey,value:stamp} as any);
      console.log(`[schedule-sync] ${requestId} saved`, { received: received.length, total: assignments.length });
      return res.json({success:true,dailyShiftAssignments:assignments,lastUpdated:Date.now(),updatedAt:stamp,syncRequestId:requestId});
    } catch(error){console.error(`[direct-schedule-sync] ${requestId} failed`,error);return res.status(500).json({success:false,error:'DIRECT_SCHEDULE_SYNC_FAILED',syncRequestId:requestId});}
  });
}
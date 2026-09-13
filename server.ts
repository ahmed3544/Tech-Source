import "dotenv/config";
import crypto from "crypto";
import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { sql, eq } from "drizzle-orm";
import { db } from "./src/db/index.js";
import * as schema from "./src/db/schema.js";
import { registerFcmRoutes } from "./server/fcm.js";
import { registerNotificationSystemV2 } from "./server/notification-system-v2.js";
import { registerRequestNotificationTriggers } from "./server/request-notification-triggers.js";
import { registerAttendanceRealtime } from "./server/attendance-realtime.js";
import { registerDeviceSyncV2 } from "./server/device-sync-v2.js";
import { registerScheduleSyncGuard } from "./server/schedule-sync-guard.js";
import { registerDirectScheduleSync } from "./server/schedule-sync-direct.js";
import { recoverMissingLegacyData } from "./server/legacy-data-recovery.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
registerFcmRoutes(app);
const PORT = Number(process.env.PORT || 3000);
const TZ = process.env.SERVER_TIME_ZONE || "Africa/Cairo";
const DATA_FILE = path.join(process.cwd(), "server_data.json");
const BACKUP_DIR = path.join(process.cwd(), "backups");
const USE_DATABASE = Boolean(process.env.DATABASE_URL);

type State = { employees:any[]; attendanceRecords:any[]; leaveRequests:any[]; overtimeRequests:any[]; shifts:any[]; notifications:any[]; dailyShiftAssignments:any[]; shiftSwapRequests:any[]; companyNameAr?:any; companyNameEn?:any; urgentNotice?:any; lastUpdated:number; };
const emptyState = ():State => ({employees:[],attendanceRecords:[],leaveRequests:[],overtimeRequests:[],shifts:[],notifications:[],dailyShiftAssignments:[],shiftSwapRequests:[],companyNameAr:null,companyNameEn:null,urgentNotice:null,lastUpdated:Date.now()});
function clock(){const now=new Date();return{date:now.toISOString().slice(0,10),time:now.toTimeString().slice(0,8),iso:now.toISOString(),timeZone:TZ};}
const norm=(x:any)=>String(x??"").trim().toLowerCase();
function mins(x:any){if(!x)return 0;const t=String(x).trim(),a=t.split(":");let h=Number(a[0]||0),m=Number(a[1]||0);if(/PM/i.test(t)&&h<12)h+=12;if(/AM/i.test(t)&&h===12)h=0;return h*60+m;}
function shiftFor(e:any,date?:string){const daily=localState.dailyShiftAssignments.find((a:any)=>norm(a.employeeId)===norm(e?.id)&&String(a.date)===String(date||""));const isOffDay=Boolean(daily?.isOffDay);if(isOffDay)return{id:"__OFF_DAY__",startTime:null,endTime:null,durationMinutes:0,gracePeriodMinutes:0,workDays:[],isOffDay:true};return localState.shifts.find((s:any)=>String(s.id)===String(daily?.shiftId||e?.shiftId))||{startTime:"09:00",endTime:"17:00",durationMinutes:480,gracePeriodMinutes:10,workDays:[]};}
function sanitize(r:any){const e=localState.employees.find((x:any)=>norm(x.id)===norm(r.employeeId));const sh=shiftFor(e,r.date);if(sh?.isOffDay)return{...r,lateMinutes:0,earlyLeaveMinutes:0,workHours:0,overtimeHours:0,minusHours:0,status:"weekend"};let work=0;if(r.checkIn&&r.checkOut){let a=mins(r.checkIn),b=mins(r.checkOut);if(b<a)b+=1440;work=Math.max(0,b-a);if(r.breakStart){let c=mins(r.breakStart),d=r.breakEnd?mins(r.breakEnd):b;if(d<c)d+=1440;work=Math.max(0,work-(d-c));}}const duration=Number(sh.durationMinutes||480);const early=r.checkOut&&!r.isExplicitCancelCheckOut?Math.max(0,duration-work):0;let status=r.status||"in_progress";if(r.checkIn&&r.checkOut)status=early>0?"early_leave":"on_time";else if(r.checkIn)status="in_progress";return{...r,lateMinutes:0,earlyLeaveMinutes:early,workHours:r.isExplicitCancelCheckOut?0:Math.round(work/60*100)/100,overtimeHours:r.isExplicitCancelCheckOut?0:Math.round(Math.max(0,work-duration)/60*100)/100,minusHours:r.isExcused?0:Math.round(Math.max(0,duration-work)/60*100)/100,status,updatedAt:r.updatedAt||new Date().toISOString()};}
function loadState():State{return emptyState();}
function saveLocalState(){}
async function setting(key:string,value:any){await db.insert(schema.settings).values({key,value} as any).onConflictDoUpdate({target:schema.settings.key,set:{value} as any});}
async function dbSnapshot(){const [employees,attendanceRecords,leaveRequests,overtimeRequests,shifts,notifications,settings,employeeShiftAssignments]=await Promise.all([db.select().from(schema.employees),db.select().from(schema.attendanceRecords),db.select().from(schema.leaveRequests),db.select().from(schema.overtimeRequests),db.select().from(schema.shifts),db.select().from(schema.notifications),db.select().from(schema.settings),db.select().from(schema.employeeShiftAssignments)]);const m=new Map(settings.map((s:any)=>[String(s.key),s.value]));return{success:true,employees,attendanceRecords,leaveRequests,overtimeRequests,shifts,notifications,employeeShiftAssignments,dailyShiftAssignments:Array.isArray(m.get("dailyShiftAssignments"))?m.get("dailyShiftAssignments"):[],shiftSwapRequests:Array.isArray(m.get("shiftSwapRequests"))?m.get("shiftSwapRequests"):[],companyNameAr:m.get("companyNameAr")??null,companyNameEn:m.get("companyNameEn")??null,urgentNotice:m.get("urgentNotice")??null,lastUpdated:Date.now()};}

registerNotificationSystemV2(app);

// Legacy recovery is a one-time safety net. It must never block or replace the
// authoritative /api/data or /api/sync response from the current database.
app.use((req:any,res:any,next:any)=>{
  if (process.env.DATABASE_URL && (req.path === '/api/data' || req.path === '/api/sync')) {
    void recoverMissingLegacyData().catch((e:any)=>console.error('[legacy-recovery]',e));
  }
  next();
});

registerRequestNotificationTriggers(app);
registerAttendanceRealtime(app);
registerScheduleSyncGuard(app);

// Leave sync bridge: leave_requests currently has no updated_at column in the
// production schema. Persist leave mutations here using only real columns, then
// remove them from the downstream device-sync payload so an extra updatedAt key
// can never make the /api/sync request fail.
app.use(async (req:any,res:any,next:any)=>{
  const pathName = String(req.path || '').split('?')[0];
  if (req.method !== 'POST' || !['/api/sync','/sync'].includes(pathName)) return next();
  const body = req.body || {};
  const incoming = Array.isArray(body.leaveRequests) ? body.leaveRequests : [];
  const deleted = Array.isArray(body.deletedLeaveIds) ? body.deletedLeaveIds : [];
  if (!incoming.length && !deleted.length) return next();
  try {
    for (const item of incoming) {
      if (!item?.id || !item?.employeeId) continue;
      const id = String(item.id);
      const values:any = {};
      for (const key of ['id','employeeId','type','startDate','endDate','reason','status','createdAt','hours','permissionSlot','attachmentUrl','attachmentName','reviewedBy','reviewNotes']) {
        if (item[key] !== undefined) values[key] = item[key];
      }
      const existing = await db.select().from(schema.leaveRequests).where(eq(schema.leaveRequests.id, id));
      if (!existing[0]) await db.insert(schema.leaveRequests).values(values as any);
      else await db.update(schema.leaveRequests).set(values as any).where(eq(schema.leaveRequests.id, id));
      await setting(`__sync_updated_at:leave:${id}`, Date.now());
    }
    for (const rawId of deleted) {
      const id = String(rawId || '').trim();
      if (!id) continue;
      await db.delete(schema.leaveRequests).where(eq(schema.leaveRequests.id, id));
      const rows = await db.select().from(schema.settings).where(eq(schema.settings.key,'__sync_deleted_ids:leave'));
      const oldIds = Array.isArray(rows[0]?.value) ? rows[0].value.map(String) : [];
      const nextIds = Array.from(new Set([...oldIds, id])).slice(-5000);
      await setting('__sync_deleted_ids:leave', nextIds);
    }
    req.body = { ...body, leaveRequests: undefined, deletedLeaveIds: undefined };
    return next();
  } catch (error:any) {
    console.error('[leave-sync-bridge] persistence failed:', error);
    return res.status(500).json({ success:false, error:'Leave sync failed' });
  }
});

// Sync bridge: /api/sync accepts notifications from the client, but the
// device-sync handler historically did not persist that collection. Persist it
// here and continue to the authoritative Neon sync pipeline for every other
// collection. No attendance or leave calculations are changed.
app.use(async (req:any,res:any,next:any)=>{
  if (req.method !== 'POST' || !['/api/sync','/sync'].includes(String(req.path || '').split('?')[0])) return next();
  const items = Array.isArray(req.body?.notifications) ? req.body.notifications : [];
  if (!items.length) return next();
  try {
    for (const item of items) {
      if (!item?.id || !item?.recipientId) continue;
      const id = String(item.id);
      const values:any = {};
      for (const key of ['id','recipientId','type','title','message','relatedEmployeeId','relatedLeaveId','relatedOvertimeId','relatedShiftSwapId','isRead','createdAt','updatedAt']) {
        if (item[key] !== undefined) values[key] = item[key];
      }
      const existing = await db.select().from(schema.notifications).where(eq(schema.notifications.id,id));
      if (!existing[0]) await db.insert(schema.notifications).values(values as any);
      else {
        const incoming = new Date(String(values.updatedAt || values.createdAt || '')).getTime();
        const current = new Date(String((existing[0] as any).updatedAt || (existing[0] as any).createdAt || '')).getTime();
        if (Number.isFinite(incoming) && (!Number.isFinite(current) || incoming >= current)) {
          await db.update(schema.notifications).set(values as any).where(eq(schema.notifications.id,id));
        }
      }
    }
  } catch (error:any) {
    console.error('[sync-bridge] notification persistence failed:', error);
    return res.status(500).json({success:false,error:'Notification sync failed'});
  }
  return next();
});

registerDirectScheduleSync(app);
registerDeviceSyncV2(app);

export default app;
export { app };

if (process.env.VERCEL !== '1') app.listen(PORT,()=>console.log(`Server running on port ${PORT} | Database: ${USE_DATABASE?'NEON':'LOCAL'}`));
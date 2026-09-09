import "dotenv/config";
import crypto from "crypto";
import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { sql } from "drizzle-orm";
import { db } from "./src/db/index.js";
import * as schema from "./src/db/schema.js";
import { registerFcmRoutes } from "./server/fcm.js";
import { registerNotificationSystemV2 } from "./server/notification-system-v2.js";
import { registerDeviceSyncV2 } from "./server/device-sync-v2.js";
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
const USE_DATABASE = Boolean(process.env.DATABASE_URL || process.env.SUPABASE_DB_URL);

type State = { employees:any[]; attendanceRecords:any[]; leaveRequests:any[]; overtimeRequests:any[]; shifts:any[]; notifications:any[]; dailyShiftAssignments:any[]; shiftSwapRequests:any[]; companyNameAr?:any; companyNameEn?:any; urgentNotice?:any; lastUpdated:number; };
const emptyState = ():State => ({employees:[],attendanceRecords:[],leaveRequests:[],overtimeRequests:[],shifts:[],notifications:[],dailyShiftAssignments:[],shiftSwapRequests:[],companyNameAr:null,companyNameEn:null,urgentNotice:null,lastUpdated:Date.now()});
let localState = emptyState();
function clock(){const now=new Date();return{date:now.toISOString().slice(0,10),time:now.toTimeString().slice(0,8),iso:now.toISOString(),timeZone:TZ};}
const norm=(x:any)=>String(x??"").trim().toLowerCase();
function mins(x:any){if(!x)return 0;const t=String(x).trim(),a=t.split(":");let h=Number(a[0]||0),m=Number(a[1]||0);if(/PM/i.test(t)&&h<12)h+=12;if(/AM/i.test(t)&&h===12)h=0;return h*60+m;}
function shiftFor(e:any,date?:string){const daily=localState.dailyShiftAssignments.find((a:any)=>norm(a.employeeId)===norm(e?.id)&&String(a.date)===String(date||""));const isOffDay=Boolean(daily?.isOffDay);if(isOffDay)return{id:"__OFF_DAY__",startTime:null,endTime:null,durationMinutes:0,gracePeriodMinutes:0,workDays:[],isOffDay:true};return localState.shifts.find((s:any)=>String(s.id)===String(daily?.shiftId||e?.shiftId))||{startTime:"09:00",endTime:"17:00",durationMinutes:480,gracePeriodMinutes:10};}
function sanitize(r:any){const e=localState.employees.find((x:any)=>norm(x.id)===norm(r.employeeId));const sh=shiftFor(e,r.date);if(sh?.isOffDay)return{...r,lateMinutes:0,earlyLeaveMinutes:0,workHours:0,overtimeHours:0,minusHours:0,status:"weekend"};let work=0;if(r.checkIn&&r.checkOut){let a=mins(r.checkIn),b=mins(r.checkOut);if(b<a)b+=1440;work=Math.max(0,b-a);if(r.breakStart){let c=mins(r.breakStart),d=r.breakEnd?mins(r.breakEnd):b;if(d<c)d+=1440;work=Math.max(0,work-(d-c));}}const duration=Number(sh.durationMinutes||480);const early=r.checkOut&&!r.isExplicitCancelCheckOut?Math.max(0,duration-work):0;let status=r.status||"in_progress";if(r.checkIn&&r.checkOut)status=early>0?"early_leave":"on_time";else if(r.checkIn)status="in_progress";return{...r,lateMinutes:0,earlyLeaveMinutes:early,workHours:r.isExplicitCancelCheckOut?0:Math.round(work/60*100)/100,overtimeHours:r.isExplicitCancelCheckOut?0:Math.round(Math.max(0,work-duration)/60*100)/100,minusHours:r.isExcused?0:Math.round(Math.max(0,duration-work)/60*100)/100,status,updatedAt:r.updatedAt||new Date().toISOString()};}
function loadState():State{return emptyState();}
function saveLocalState(){}
async function setting(key:string,value:any){await db.insert(schema.settings).values({key,value} as any).onConflictDoUpdate({target:schema.settings.key,set:{value} as any});}
async function dbSnapshot(){const [employees,attendanceRecords,leaveRequests,overtimeRequests,shifts,notifications,settings,employeeShiftAssignments]=await Promise.all([db.select().from(schema.employees),db.select().from(schema.attendanceRecords),db.select().from(schema.leaveRequests),db.select().from(schema.overtimeRequests),db.select().from(schema.shifts),db.select().from(schema.notifications),db.select().from(schema.settings),db.select().from(schema.employeeShiftAssignments)]);const m=new Map(settings.map((s:any)=>[String(s.key),s.value]));return{success:true,employees,attendanceRecords,leaveRequests,overtimeRequests,shifts,notifications,employeeShiftAssignments,dailyShiftAssignments:Array.isArray(m.get("dailyShiftAssignments"))?m.get("dailyShiftAssignments"):[],shiftSwapRequests:Array.isArray(m.get("shiftSwapRequests"))?m.get("shiftSwapRequests"):[],companyNameAr:m.get("companyNameAr")??null,companyNameEn:m.get("companyNameEn")??null,urgentNotice:m.get("urgentNotice")??null,lastUpdated:Date.now()};}

// These registrations are kept in the source so the Vercel serverless entrypoint
// always exports the same Express app, even when prebuild patch scripts are skipped.
registerNotificationSystemV2(app);
app.use(async (req:any,res:any,next:any)=>{if((process.env.DATABASE_URL||process.env.SUPABASE_DB_URL)&&(req.path==='/api/data'||req.path==='/api/sync')){try{await recoverMissingLegacyData();}catch(e){console.error('[legacy-recovery]',e);}}next();});
registerDeviceSyncV2(app);

export default app;
export { app };

if (process.env.VERCEL !== '1') app.listen(PORT,()=>console.log(`Server running on port ${PORT} | Database: ${USE_DATABASE?'SUPABASE/NEON':'LOCAL'}`));

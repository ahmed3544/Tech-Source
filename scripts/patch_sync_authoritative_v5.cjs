const fs = require('fs');

const path = 'server/device-sync-v2.ts';
let code = fs.readFileSync(path, 'utf8');
const marker = '/* SYNC_AUTHORITATIVE_SERVER_V5 */';

if (!code.includes(marker)) {
  // Preserve the authoritative ordering rule without rejecting legitimate
  // legacy/client mutations that only have createdAt. Fall back to syncTime
  // only when neither mutation timestamp exists.
  code = code.replace(
    /const newestStamp = \(item:any,syncTime:any\) => \{[^\n]*\};/,
    "const newestStamp = (item:any,syncTime:any) => { const itemTime=ms(item?.updatedAt||item?.createdAt); return itemTime?stamp(itemTime):stamp(syncTime); };"
  );

  code = code.replace(
    /async function upsertAttendance\([\s\S]*?\nasync function upsertLeave/,
    `async function upsertAttendance(r:any,syncTime:any,tombs:Set<string>){if(!r?.employeeId||!r?.date)return;const employeeId=String(r.employeeId),date=String(r.date).slice(0,10),v=pick(r,['id','employeeId','date','checkIn','checkOut','breakStart','breakEnd','breaks','totalBreakSeconds','location','deviceInfo','lateMinutes','lateSeconds','earlyLeaveMinutes','workHours','overtimeHours','minusHours','status','leaveType','notes','verifiedByFace','isExcused','excusedBy','excusedReason','updatedAt','isExplicitCancelCheckOut']);if(v.id&&tombs.has(String(v.id)))return;v.employeeId=employeeId;v.date=date;v.updatedAt=newestStamp(r,syncTime);const incoming=ms(v.updatedAt);const a=await db.select().from(schema.attendanceRecords).where(and(eq(schema.attendanceRecords.employeeId,employeeId),eq(schema.attendanceRecords.date,date)));if(!a[0]){if(!incoming)return;await db.insert(schema.attendanceRecords).values(v as any);return;}const current=ms((a[0] as any).updatedAt||(a[0] as any).createdAt);if(!incoming)return;if(current&&incoming<current)return;await db.update(schema.attendanceRecords).set(v as any).where(eq(schema.attendanceRecords.id,(a[0] as any).id));}
async function upsertLeave`
  );

  code = code.replace(
    /async function upsertLeave\([\s\S]*?\nasync function upsertOvertime/,
    `async function upsertLeave(r:any,syncTime:any,tombs:Set<string>){if(!r?.id||!r?.employeeId)return;const id=String(r.id);if(tombs.has(id))return;const v=pick(r,['id','employeeId','type','startDate','endDate','reason','status','createdAt','updatedAt','hours','permissionSlot','attachmentUrl','attachmentName','reviewedBy','reviewNotes']);v.updatedAt=newestStamp(r,syncTime);const incoming=ms(v.updatedAt);if(!incoming)return;const a=await db.select().from(schema.leaveRequests).where(eq(schema.leaveRequests.id,id));if(!a[0]){await db.insert(schema.leaveRequests).values(v as any);return;}const current=ms((a[0] as any).updatedAt||(a[0] as any).createdAt);if(current&&incoming<current)return;await db.update(schema.leaveRequests).set(v as any).where(eq(schema.leaveRequests.id,id));}
async function upsertOvertime`
  );

  code = code.replace(/if\(!a\[0\]\)\{await db\.insert\(schema\.employees\.values\(v as any\);return;\}\n?/, '');

  code += `\n${marker}\n`;
  fs.writeFileSync(path, code, 'utf8');
  console.log('[patch_sync_authoritative_v5] applied');
}

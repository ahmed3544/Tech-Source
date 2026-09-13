const fs = require('fs');

const file = 'server/device-sync-v2.ts';
const marker = '/* DAILY_SCHEDULE_NORMALIZATION_V2 */';
let code = fs.readFileSync(file, 'utf8');

if (code.includes(marker)) {
  console.log('[daily-schedule-normalization] Patch already applied.');
  process.exit(0);
}

const collectionOld = "function collectionKey(x:any,index:number){if(x?.id!=null)return `id:${String(x.id)}`;if(x?.employeeId!=null&&x?.date!=null)return `employee-date:${String(x.employeeId)}:${String(x.date)}`;if(x?.employeeId!=null&&x?.scheduleDate!=null)return `employee-schedule:${String(x.employeeId)}:${String(x.scheduleDate)}`;return `index:${index}`;}";
const collectionNew = `/* DAILY_SCHEDULE_NORMALIZATION_V2 */\nfunction collectionKey(x:any,index:number){if(x?.id!=null)return \`id:\${String(x.id)}\`;const employeeId=x?.employeeId??x?.employee_id;const date=x?.date??x?.scheduleDate??x?.schedule_date;if(employeeId!=null&&date!=null)return \`employee-date:\${String(employeeId)}:\${String(date)}\`;return \`index:\${index}\`;}\nfunction normalizeDailyShiftAssignment(x:any){if(!x||typeof x!=='object')return x;return { ...x, employeeId:String(x.employeeId??x.employee_id??''), date:String(x.date??x.scheduleDate??x.schedule_date??''), shiftId:x.shiftId??x.shift_id??null, isOffDay:Boolean(x.isOffDay??x.is_off_day??String(x.status??'').toUpperCase()==='OFF'), assignedBy:x.assignedBy??x.assigned_by??null, updatedAt:x.updatedAt??x.updated_at??null };}`;
if (!code.includes(collectionOld)) throw new Error('daily schedule collectionKey target not found');
code = code.replace(collectionOld, collectionNew);

const snapshotOld = "dailyShiftAssignments:Array.isArray(m.get('dailyShiftAssignments'))?m.get('dailyShiftAssignments'):[],";
const snapshotNew = "dailyShiftAssignments:Array.isArray(m.get('dailyShiftAssignments'))?m.get('dailyShiftAssignments').map(normalizeDailyShiftAssignment):[],";
if (!code.includes(snapshotOld)) throw new Error('daily schedule snapshot target not found');
code = code.replace(snapshotOld, snapshotNew);

fs.writeFileSync(file, code, 'utf8');
console.log('[daily-schedule-normalization] Applied.');

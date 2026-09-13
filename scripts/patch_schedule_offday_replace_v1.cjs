const fs = require('fs');
const path = 'server/device-sync-v2.ts';
let s = fs.readFileSync(path, 'utf8');
const marker = '/* SCHEDULE_OFFDAY_REPLACE_V1 */';

if (s.includes(marker)) {
  console.log('Already patched.');
  process.exit(0);
}

const replacement = marker + '\n' +
  "function collectionKey(x:any,index:number){const employeeId=x?.employeeId??x?.employee_id;const date=x?.date??x?.scheduleDate??x?.schedule_date;if(x?.id!=null)return `id:${String(x.id)}`;if(employeeId!=null&&date!=null)return `employee-date:${String(employeeId)}:${String(date).slice(0,10)}`;return `index:${index}`;}";

const collectionRegex = /function collectionKey\(x:any,index:number\)\{[\\s\\S]*?\}\n(?=function normalizeDailyShiftAssignment)/;
if (collectionRegex.test(s)) {
  s = s.replace(collectionRegex, replacement + '\n');
} else {
  const legacy = /function collectionKey\(x:any,index:number\)\{[\\s\\S]*?\}/;
  if (!legacy.test(s)) throw new Error('collectionKey target not found');
  s = s.replace(legacy, replacement);
}

const rawSetting = "if(Array.isArray(b.dailyShiftAssignments))await setting('dailyShiftAssignments',b.dailyShiftAssignments,syncTime);";
const normalizedSetting = "if(Array.isArray(b.dailyShiftAssignments))await setting('dailyShiftAssignments',b.dailyShiftAssignments.map(normalizeDailyShiftAssignment),syncTime);";
if (s.includes(rawSetting)) s = s.replace(rawSetting, normalizedSetting);

const rawSnapshot = "dailyShiftAssignments:Array.isArray(m.get('dailyShiftAssignments'))?m.get('dailyShiftAssignments'):[],";
const normalizedSnapshot = "dailyShiftAssignments:Array.isArray(m.get('dailyShiftAssignments'))?m.get('dailyShiftAssignments').map(normalizeDailyShiftAssignment):[],";
if (s.includes(rawSnapshot)) s = s.replace(rawSnapshot, normalizedSnapshot);

fs.writeFileSync(path, s, 'utf8');
console.log('Applied schedule off-day replacement fix.');

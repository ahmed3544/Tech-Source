const fs = require('fs');
const path = 'server/device-sync-v2.ts';
let s = fs.readFileSync(path, 'utf8');
const marker = '/* SCHEDULE_OFFDAY_REPLACE_V1 */';

if (s.includes(marker)) {
  console.log('Already patched.');
  process.exit(0);
}

const start = s.indexOf('function collectionKey(');
if (start < 0) throw new Error('collectionKey target not found');
const open = s.indexOf('{', start);
if (open < 0) throw new Error('collectionKey opening brace not found');
let depth = 0;
let end = -1;
for (let i = open; i < s.length; i++) {
  if (s[i] === '{') depth++;
  else if (s[i] === '}') {
    depth--;
    if (depth === 0) { end = i + 1; break; }
  }
}
if (end < 0) throw new Error('collectionKey closing brace not found');

const collectionReplacement = "function collectionKey(x:any,index:number){const employeeId=x?.employeeId??x?.employee_id;const date=x?.date??x?.scheduleDate??x?.schedule_date;if(x?.id!=null)return `id:${String(x.id)}`;if(employeeId!=null&&date!=null)return `employee-date:${String(employeeId)}:${String(date).slice(0,10)}`;return `index:${index}`;}";

const hasNormalizer = s.includes('function normalizeDailyShiftAssignment(');
const replacement = marker + '\n' + collectionReplacement + (hasNormalizer ? '' : "\nfunction normalizeDailyShiftAssignment(x:any){return {employeeId:String(x?.employeeId??x?.employee_id??''),date:String(x?.date??x?.scheduleDate??x?.schedule_date??'').slice(0,10),shiftId:(x?.shiftId??x?.shift_id??null)||null,isOffDay:Boolean(x?.isOffDay??x?.is_off_day??String(x?.status||'').toUpperCase()==='OFF'),assignedBy:x?.assignedBy??x?.assigned_by,updatedAt:x?.updatedAt??x?.updated_at};}");

s = s.slice(0, start) + replacement + s.slice(end);

const rawSetting = "if(Array.isArray(b.dailyShiftAssignments))await setting('dailyShiftAssignments',b.dailyShiftAssignments,syncTime);";
const normalizedSetting = "if(Array.isArray(b.dailyShiftAssignments))await setting('dailyShiftAssignments',b.dailyShiftAssignments.map(normalizeDailyShiftAssignment),syncTime);";
if (s.includes(rawSetting)) s = s.replace(rawSetting, normalizedSetting);

const rawSnapshot = "dailyShiftAssignments:Array.isArray(m.get('dailyShiftAssignments'))?m.get('dailyShiftAssignments'):[],";
const normalizedSnapshot = "dailyShiftAssignments:Array.isArray(m.get('dailyShiftAssignments'))?m.get('dailyShiftAssignments').map(normalizeDailyShiftAssignment):[],";
if (s.includes(rawSnapshot)) s = s.replace(rawSnapshot, normalizedSnapshot);

fs.writeFileSync(path, s, 'utf8');
console.log(`Applied schedule off-day replacement fix (normalizer ${hasNormalizer ? 'reused' : 'added'}).`);

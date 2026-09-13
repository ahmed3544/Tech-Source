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
const normalizer = "function normalizeDailyShiftAssignment(x:any){return {employeeId:String(x?.employeeId??x?.employee_id??''),date:String(x?.date??x?.scheduleDate??x?.schedule_date??'').slice(0,10),shiftId:(x?.shiftId??x?.shift_id??null)||null,isOffDay:Boolean(x?.isOffDay??x?.is_off_day??String(x?.status||'').toUpperCase()==='OFF'),assignedBy:x?.assignedBy??x?.assigned_by,updatedAt:x?.updatedAt??x?.updated_at};}";
const replacement = marker + '\n' + collectionReplacement + (hasNormalizer ? '' : '\n' + normalizer);
s = s.slice(0, start) + replacement + s.slice(end);

// Weekly daily schedules are sent as the authoritative full collection from the editor.
// Replace the collection instead of mergeCollection so removing an OFF day can actually remove the old row.
const settingMarker = '/* SCHEDULE_OFFDAY_REPLACE_SETTING_V1 */';
if (!s.includes(settingMarker)) {
  const anchor = 'async function setting(';
  const settingStart = s.indexOf(anchor);
  if (settingStart < 0) throw new Error('setting target not found');
  const settingOpen = s.indexOf('{', settingStart);
  let settingDepth = 0;
  let settingEnd = -1;
  for (let i = settingOpen; i < s.length; i++) {
    if (s[i] === '{') settingDepth++;
    else if (s[i] === '}') {
      settingDepth--;
      if (settingDepth === 0) { settingEnd = i + 1; break; }
    }
  }
  if (settingEnd < 0) throw new Error('setting closing brace not found');
  const settingFn = s.slice(settingStart, settingEnd);
  const replaceSettingFn = "/* SCHEDULE_OFFDAY_REPLACE_SETTING_V1 */\nasync function replaceDailyShiftAssignments(v:any,updatedAt?:any){const k='dailyShiftAssignments',rows=await db.select().from(schema.settings).where(eq(schema.settings.key,k)),value=Array.isArray(v)?v:[],stampKey=`__sync_updated_at:${k}`,next=stamp(updatedAt);if(rows[0])await db.update(schema.settings).set({value} as any).where(eq(schema.settings.key,k));else await db.insert(schema.settings).values({key:k,value} as any);const t=await db.select().from(schema.settings).where(eq(schema.settings.key,stampKey));if(!t[0])await db.insert(schema.settings).values({key:stampKey,value:next} as any);else await db.update(schema.settings).set({value:next} as any).where(eq(schema.settings.key,stampKey));}";
  s = s.slice(0, settingStart) + settingFn + '\n' + replaceSettingFn + s.slice(settingEnd);
}

const rawSetting = "if(Array.isArray(b.dailyShiftAssignments))await setting('dailyShiftAssignments',b.dailyShiftAssignments,syncTime);";
const normalizedSetting = "if(Array.isArray(b.dailyShiftAssignments))await replaceDailyShiftAssignments(b.dailyShiftAssignments.map(normalizeDailyShiftAssignment),syncTime);";
if (s.includes(rawSetting)) s = s.replace(rawSetting, normalizedSetting);

const rawSnapshot = "dailyShiftAssignments:Array.isArray(m.get('dailyShiftAssignments'))?m.get('dailyShiftAssignments'):[],";
const normalizedSnapshot = "dailyShiftAssignments:Array.isArray(m.get('dailyShiftAssignments'))?m.get('dailyShiftAssignments').map(normalizeDailyShiftAssignment):[],";
if (s.includes(rawSnapshot)) s = s.replace(rawSnapshot, normalizedSnapshot);

fs.writeFileSync(path, s, 'utf8');
console.log(`Applied schedule off-day replacement fix (normalizer ${hasNormalizer ? 'reused' : 'added'}).`);

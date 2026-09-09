import fs from 'fs';

const serverPath = 'server.ts';
let server = fs.readFileSync(serverPath, 'utf8');

const shiftStart = server.indexOf('function shiftFor(');
const sanitizeStart = server.indexOf('function sanitize(');
if (shiftStart < 0 || sanitizeStart < 0 || sanitizeStart <= shiftStart) {
  throw new Error('Could not locate shiftFor()/sanitize() boundaries in server.ts');
}

// Replace the complete shiftFor() function by boundary, instead of relying on
// whitespace/minified formatting. This is safe for both pretty and compact server.ts.
if (!server.includes('const isOffDay=Boolean(daily?.isOffDay);')) {
  const newShiftFor = `function shiftFor(e:any,date?:string){const daily=localState.dailyShiftAssignments.find((a:any)=>norm(a.employeeId)===norm(e?.id)&&String(a.date)===String(date||""));const isOffDay=Boolean(daily?.isOffDay);if(isOffDay)return{id:"__OFF_DAY__",startTime:null,endTime:null,durationMinutes:0,gracePeriodMinutes:0,workDays:[],isOffDay:true};return localState.shifts.find((s:any)=>String(s.id)===String(daily?.shiftId||e?.shiftId))||{startTime:"09:00",endTime:"17:00",durationMinutes:480,gracePeriodMinutes:10};}\n`;
  server = server.slice(0, shiftStart) + newShiftFor + server.slice(sanitizeStart);
}

// Re-read positions after the shiftFor replacement and add the Off Day guard
// to sanitize() if it is not already present.
if (!server.includes('if(sh?.isOffDay)')) {
  const shNeedle = 'const sh=shiftFor(e,r.date);';
  const shIndex = server.indexOf(shNeedle);
  if (shIndex < 0) {
    throw new Error('Could not find sanitize shift resolution in server.ts');
  }
  const insertAt = shIndex + shNeedle.length;
  const guard = `if(sh?.isOffDay)return{...r,lateMinutes:0,earlyLeaveMinutes:0,workHours:0,overtimeHours:0,minusHours:0,status:"weekend"};`;
  server = server.slice(0, insertAt) + guard + server.slice(insertAt);
}

fs.writeFileSync(serverPath, server);

const portalPath = 'src/components/EmployeePortal.tsx';
let portal = fs.readFileSync(portalPath, 'utf8');

if (!portal.includes('if (assignment?.isOffDay)')) {
  const portalRegex = /(const getShiftForDate = \(employeeId: string, date: string\) => \{\s*const assignment = dailyShiftAssignments\.find\(item => item\.employeeId === employeeId && item\.date === date\);)/;
  if (portalRegex.test(portal)) {
    portal = portal.replace(portalRegex, `$1\n    if (assignment?.isOffDay) return undefined;`);
  } else {
    console.warn('getShiftForDate() anchor not found; leaving EmployeePortal.tsx unchanged.');
  }
}

fs.writeFileSync(portalPath, portal);
console.log('Off-day logic patched successfully.');

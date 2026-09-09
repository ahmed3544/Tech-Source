import fs from 'fs';

const serverPath = 'server.ts';
let server = fs.readFileSync(serverPath, 'utf8');

if (!server.includes('function shiftFor(')) {
  throw new Error('Could not find shiftFor() function in server.ts');
}

// Support both normal and compact/minified formatting of shiftFor().
if (!server.includes('const isOffDay = Boolean(daily?.isOffDay);')) {
  const shiftForCompact = /function shiftFor\(e: any, date\?: string\)\{(.*?)return localState\.shifts\.find\((.*?)\}\}\);/s;
  const compactMatch = server.match(shiftForCompact);

  if (compactMatch) {
    const replacement = compactMatch[0].replace(
      'return localState.shifts.find(',
      `const isOffDay = Boolean(daily?.isOffDay);if (isOffDay) {return {id:'__OFF_DAY__',startTime:null,endTime:null,durationMinutes:0,gracePeriodMinutes:0,workDays:[],isOffDay:true};}return localState.shifts.find(`
    );
    server = server.replace(compactMatch[0], replacement);
  } else {
    const shiftForStart = 'function shiftFor(e: any, date?: string) {';
    const shiftForStartCompact = 'function shiftFor(e: any, date?: string){';
    const start = server.includes(shiftForStart) ? shiftForStart : shiftForStartCompact;
    const startIndex = server.indexOf(start);
    const returnIndex = server.indexOf('return localState.shifts.find', startIndex);
    if (startIndex < 0 || returnIndex < 0) {
      throw new Error('Could not find shiftFor() return anchor in server.ts');
    }
    const guard = `const isOffDay = Boolean(daily?.isOffDay);if (isOffDay) {return {id:'__OFF_DAY__',startTime:null,endTime:null,durationMinutes:0,gracePeriodMinutes:0,workDays:[],isOffDay:true};}`;
    server = server.slice(0, returnIndex) + guard + server.slice(returnIndex);
  }
}

if (!server.includes('if (sh?.isOffDay)')) {
  const shNeedle = 'const sh = shiftFor(e, r.date);';
  const shIndex = server.indexOf(shNeedle);
  if (shIndex < 0) {
    throw new Error('Could not find sanitize shift resolution in server.ts');
  }
  const insertAt = shIndex + shNeedle.length;
  const guard = `if (sh?.isOffDay) {return {...r,lateMinutes:0,earlyLeaveMinutes:0,workHours:0,overtimeHours:0,minusHours:0,status:'weekend'};}`;
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

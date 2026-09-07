import fs from 'fs';

const serverPath = 'server.ts';
let server = fs.readFileSync(serverPath, 'utf8');

const oldShiftFor = `function shiftFor(e: any, date?: string) {
  const daily = localState.dailyShiftAssignments.find(
    (assignment: any) =>
      norm(assignment.employeeId) === norm(e?.id) &&
      String(assignment.date) === String(date || "")
  );

  return (`;

if (!server.includes('const isOffDay = Boolean(daily?.isOffDay);')) {
  if (!server.includes(oldShiftFor)) {
    throw new Error('Could not find shiftFor() anchor in server.ts');
  }
  server = server.replace(
    oldShiftFor,
    `function shiftFor(e: any, date?: string) {
  const daily = localState.dailyShiftAssignments.find(
    (assignment: any) =>
      norm(assignment.employeeId) === norm(e?.id) &&
      String(assignment.date) === String(date || "")
  );

  const isOffDay = Boolean(daily?.isOffDay);
  if (isOffDay) {
    return {
      id: '__OFF_DAY__',
      startTime: null,
      endTime: null,
      durationMinutes: 0,
      gracePeriodMinutes: 0,
      workDays: [],
      isOffDay: true,
    };
  }

  return (`
  );
}

const sanitizeAnchor = `function sanitize(r: any) {
  const e = localState.employees.find(`;
if (!server.includes('if (sh?.isOffDay)')) {
  if (!server.includes(sanitizeAnchor)) {
    throw new Error('Could not find sanitize() anchor in server.ts');
  }
  server = server.replace(
    sanitizeAnchor,
    `function sanitize(r: any) {
  const e = localState.employees.find(`
  );
}

// Add an explicit early-return guard after shift resolution. This makes an
// Off Day a zero-hour planned day and prevents short-hours validation/penalties.
const shLine = `  const sh = shiftFor(e, r.date);\n\n  let work = 0;`;
if (!server.includes('if (sh?.isOffDay)')) {
  if (!server.includes(shLine)) {
    throw new Error('Could not find sanitize shift anchor in server.ts');
  }
  server = server.replace(
    shLine,
    `  const sh = shiftFor(e, r.date);\n\n  if (sh?.isOffDay) {\n    return {\n      ...r,\n      lateMinutes: 0,\n      earlyLeaveMinutes: 0,\n      workHours: 0,\n      overtimeHours: 0,\n      status: 'weekend',\n    };\n  }\n\n  let work = 0;`
  );
}

fs.writeFileSync(serverPath, server);

const portalPath = 'src/components/EmployeePortal.tsx';
let portal = fs.readFileSync(portalPath, 'utf8');
const portalAnchor = `  const getShiftForDate = (employeeId: string, date: string) => {\n    const assignment = dailyShiftAssignments.find(item => item.employeeId === employeeId && item.date === date);\n    return shifts.find(shift => shift.id === (assignment?.shiftId || emp?.shiftId)) || shifts[0] || { id: 'fallback-shift', nameAr: 'الدوام الموحد', nameEn: 'Standard Shift', startTime: '09:00', endTime: '17:00', gracePeriodMinutes: 0, workDays: [0, 1, 2, 3, 4], breaks: [] };\n  };`;
if (!portal.includes('if (assignment?.isOffDay)')) {
  if (!portal.includes(portalAnchor)) {
    throw new Error('Could not find getShiftForDate() anchor in EmployeePortal.tsx');
  }
  portal = portal.replace(
    portalAnchor,
    `  const getShiftForDate = (employeeId: string, date: string) => {\n    const assignment = dailyShiftAssignments.find(item => item.employeeId === employeeId && item.date === date);\n    if (assignment?.isOffDay) return undefined;\n    return shifts.find(shift => shift.id === (assignment?.shiftId || emp?.shiftId)) || shifts[0] || { id: 'fallback-shift', nameAr: 'الدوام الموحد', nameEn: 'Standard Shift', startTime: '09:00', endTime: '17:00', gracePeriodMinutes: 0, workDays: [0, 1, 2, 3, 4], breaks: [] };\n  };`
  );
}
fs.writeFileSync(portalPath, portal);

console.log('Off-day logic patched: assignments use isOffDay, backend skips required hours, and employee portal does not fall back to a shift.');

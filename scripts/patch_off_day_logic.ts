import fs from 'fs';

const serverPath = 'server.ts';
let server = fs.readFileSync(serverPath, 'utf8');

// The server file may be formatted/minified differently after previous patches.
// Do not depend on one exact multi-line formatting shape.
if (!server.includes('function shiftFor(')) {
  throw new Error('Could not find shiftFor() function in server.ts');
}

// Make shiftFor() recognize an explicitly assigned Off Day.
if (!server.includes('const isOffDay = Boolean(daily?.isOffDay);')) {
  const shiftForPattern = /function shiftFor\(e: any, date\?: string\)\s*\{([\s\S]*?)\n\}/;
  const match = server.match(shiftForPattern);
  if (!match) {
    throw new Error('Could not parse shiftFor() in server.ts');
  }

  const body = match[1];
  const dailyLine = 'const daily = localState.dailyShiftAssignments.find';
  if (!body.includes(dailyLine)) {
    throw new Error('Could not find daily assignment lookup inside shiftFor()');
  }

  const guard = `\n  const isOffDay = Boolean(daily?.isOffDay);\n  if (isOffDay) {\n    return {\n      id: '__OFF_DAY__',\n      startTime: null,\n      endTime: null,\n      durationMinutes: 0,\n      gracePeriodMinutes: 0,\n      workDays: [],\n      isOffDay: true,\n    };\n  }`;

  const returnIndex = body.indexOf('return ');
  if (returnIndex < 0) {
    throw new Error('Could not find shiftFor() return statement');
  }

  const newBody = body.slice(0, returnIndex) + guard + '\n  ' + body.slice(returnIndex);
  server = server.replace(match[0], `function shiftFor(e: any, date?: string) {${newBody}\n}`);
}

// Make sanitize() treat Off Day as a zero-hour planned day.
if (!server.includes('if (sh?.isOffDay)')) {
  const sanitizeNeedle = /const sh = shiftFor\(e, r\.date\);\s*/;
  if (!sanitizeNeedle.test(server)) {
    throw new Error('Could not find sanitize shift resolution in server.ts');
  }

  const offDayGuard = `const sh = shiftFor(e, r.date);\n  if (sh?.isOffDay) {\n    return {\n      ...r,\n      lateMinutes: 0,\n      earlyLeaveMinutes: 0,\n      workHours: 0,\n      overtimeHours: 0,\n      minusHours: 0,\n      status: 'weekend',\n    };\n  }\n  `;

  server = server.replace(sanitizeNeedle, offDayGuard);
}

fs.writeFileSync(serverPath, server);

const portalPath = 'src/components/EmployeePortal.tsx';
let portal = fs.readFileSync(portalPath, 'utf8');
const portalAnchor = `  const getShiftForDate = (employeeId: string, date: string) => {\n    const assignment = dailyShiftAssignments.find(item => item.employeeId === employeeId && item.date === date);\n    return shifts.find(shift => shift.id === (assignment?.shiftId || emp?.shiftId)) || shifts[0] || { id: 'fallback-shift', nameAr: 'الدوام الموحد', nameEn: 'Standard Shift', startTime: '09:00', endTime: '17:00', gracePeriodMinutes: 0, workDays: [0, 1, 2, 3, 4], breaks: [] };\n  };`;
if (!portal.includes('if (assignment?.isOffDay)')) {
  if (portal.includes(portalAnchor)) {
    portal = portal.replace(
      portalAnchor,
      `  const getShiftForDate = (employeeId: string, date: string) => {\n    const assignment = dailyShiftAssignments.find(item => item.employeeId === employeeId && item.date === date);\n    if (assignment?.isOffDay) return undefined;\n    return shifts.find(shift => shift.id === (assignment?.shiftId || emp?.shiftId)) || shifts[0] || { id: 'fallback-shift', nameAr: 'الدوام الموحد', nameEn: 'Standard Shift', startTime: '09:00', endTime: '17:00', gracePeriodMinutes: 0, workDays: [0, 1, 2, 3, 4], breaks: [] };\n  };`
    );
  }
}
fs.writeFileSync(portalPath, portal);

console.log('Off-day logic patched successfully.');

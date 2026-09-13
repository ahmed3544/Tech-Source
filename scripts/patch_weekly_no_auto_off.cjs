const fs = require('fs');

const path = 'src/components/WeeklyShiftSchedule.tsx';
let s = fs.readFileSync(path, 'utf8');

const oldGetValue = `    const baseShift = employee?.shiftId ? shifts.find(s => s.id === employee.shiftId) : undefined;\n    const dow = new Date(\`${date}T00:00:00\`).getDay();\n    if (baseShift && Array.isArray(baseShift.workDays) && baseShift.workDays.includes(dow)) return baseShift.id;\n    return baseShift ? OFF_DAY_SHIFT_ID : '';`;
const newGetValue = `    const baseShift = employee?.shiftId ? shifts.find(s => s.id === employee.shiftId) : undefined;\n    const dow = new Date(\`${date}T00:00:00\`).getDay();\n    if (baseShift && Array.isArray(baseShift.workDays) && baseShift.workDays.includes(dow)) return baseShift.id;\n    // Empty means no assignment. OFF is only shown when explicitly saved as OFF.\n    return '';`;

const oldBuild = `      } else if (baseShift?.id && works) {\n        shiftId = baseShift.id;\n        isOffDay = false;\n      } else {\n        shiftId = '';\n        isOffDay = true;\n      }\n      const index = next.findIndex(a => String(a.employeeId ?? (a as any).employee_id) === String(employeeId) && a.date === day.key);\n      const assignment: DailyShiftAssignment = { employeeId, date:day.key, shiftId, isOffDay, assignedBy:currentUser?.id, updatedAt };\n      if (index >= 0) next[index] = assignment; else next.push(assignment);`;
const newBuild = `      } else if (baseShift?.id && works) {\n        shiftId = baseShift.id;\n        isOffDay = false;\n      } else {\n        // Do not manufacture an OFF assignment. An empty day stays unassigned.\n        const index = next.findIndex(a => String(a.employeeId ?? (a as any).employee_id) === String(employeeId) && a.date === day.key);\n        if (index >= 0) next.splice(index, 1);\n        continue;\n      }\n      const index = next.findIndex(a => String(a.employeeId ?? (a as any).employee_id) === String(employeeId) && a.date === day.key);\n      const assignment: DailyShiftAssignment = { employeeId, date:day.key, shiftId, isOffDay, assignedBy:currentUser?.id, updatedAt };\n      if (index >= 0) next[index] = assignment; else next.push(assignment);`;

let changed = false;
if (s.includes(oldGetValue)) { s = s.replace(oldGetValue, newGetValue); changed = true; }
if (s.includes(oldBuild)) { s = s.replace(oldBuild, newBuild); changed = true; }
if (!changed) process.exit(0);
fs.writeFileSync(path, s);

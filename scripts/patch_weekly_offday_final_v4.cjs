const fs = require('fs');
const path = 'src/components/WeeklyShiftSchedule.tsx';
let s = fs.readFileSync(path, 'utf8');
const marker = '/* WEEKLY_OFFDAY_FINAL_V4 */';
if (s.includes(marker)) {
  console.log('Weekly off-day final fix already applied.');
  process.exit(0);
}
const oldAssignment = "const assignmentFor = (employeeId: string, date: string) => assignments.find(a => a.employeeId === employeeId && a.date === date);";
const newAssignment = `const assignmentFor = (employeeId: string, date: string) => {\n    const found = assignments.find(a =>\n      String(a.employeeId ?? (a as any).employee_id) === String(employeeId) &&\n      String(a.date ?? (a as any).scheduleDate ?? (a as any).schedule_date ?? '').slice(0, 10) === String(date).slice(0, 10)\n    );\n    if (!found) return undefined;\n    return {\n      ...found,\n      employeeId: String(found.employeeId ?? (found as any).employee_id ?? employeeId),\n      date: String(found.date ?? (found as any).scheduleDate ?? (found as any).schedule_date ?? date).slice(0, 10),\n      shiftId: found.shiftId ?? (found as any).shift_id ?? '',\n      isOffDay: Boolean(found.isOffDay ?? (found as any).is_off_day),\n      assignedBy: found.assignedBy ?? (found as any).assigned_by,\n      updatedAt: found.updatedAt ?? (found as any).updated_at,\n    } as DailyShiftAssignment;\n  };`;
if (s.includes(oldAssignment)) {
  s = s.replace(oldAssignment, newAssignment);
} else if (!s.includes('const assignmentFor = (employeeId: string, date: string) => {')) {
  throw new Error('Weekly assignmentFor target not found');
}
const getValueStart = "const getValue = (date: string) => {\n    const assignment = assignmentFor(employee?.id || '', date);";
const getValueReplacement = "const getValue = (date: string) => {\n    const assignment = assignmentFor(employee?.id || '', date);\n    if (draft[date] !== undefined) return draft[date];";
if (s.includes(getValueStart) && !s.includes(getValueReplacement)) {
  s = s.replace(getValueStart, getValueReplacement);
}
s = s.replace(/const isOffDay = selectedId === OFF_DAY_SHIFT_ID \|\| Boolean\(assignment\?\.isOffDay\);/, 'const isOffDay = selectedId === OFF_DAY_SHIFT_ID;');
if (!s.includes('const isOffDay = selectedId === OFF_DAY_SHIFT_ID;')) {
  throw new Error('Weekly render isOffDay target not found');
}
s = s.replace("const getValue = (date: string) => {\n    const assignment = assignmentFor(employee?.id || '', date);\n    if (assignment?.isOffDay) return OFF_DAY_SHIFT_ID;\n    if (draft[date] !== undefined) return draft[date];", "const getValue = (date: string) => {\n    const assignment = assignmentFor(employee?.id || '', date);\n    if (draft[date] !== undefined) return draft[date];\n    if (assignment?.isOffDay) return OFF_DAY_SHIFT_ID;");
s = s.replace('const OFF_DAY_SHIFT_ID =', marker + '\nconst OFF_DAY_SHIFT_ID =');
fs.writeFileSync(path, s, 'utf8');
console.log('Applied weekly off-day final fix.');

const fs = require('fs');
const path = 'src/components/WeeklyShiftSchedule.tsx';
let s = fs.readFileSync(path, 'utf8');
const marker = '/* WEEKLY_OFFDAY_DRAFT_PRECEDENCE_V1 */';
if (s.includes(marker)) {
  console.log('Weekly off-day draft precedence already patched.');
  process.exit(0);
}
const old = "const getValue = (date: string) => {\n    const assignment = assignmentFor(employee?.id || '', date);\n    if (assignment?.isOffDay) return OFF_DAY_SHIFT_ID;\n    if (draft[date] !== undefined) return draft[date];";
const replacement = "/* WEEKLY_OFFDAY_DRAFT_PRECEDENCE_V1 */\n  const getValue = (date: string) => {\n    const assignment = assignmentFor(employee?.id || '', date);\n    if (draft[date] !== undefined) return draft[date];\n    if (assignment?.isOffDay) return OFF_DAY_SHIFT_ID;";
if (!s.includes(old)) throw new Error('Weekly getValue target not found');
s = s.replace(old, replacement);
fs.writeFileSync(path, s, 'utf8');
console.log('Applied weekly off-day draft precedence fix.');

const fs = require('fs');
const path = 'src/components/WeeklyShiftSchedule.tsx';
let s = fs.readFileSync(path, 'utf8');
const marker = '/* WEEKLY_OFFDAY_DRAFT_PRECEDENCE_V1 */';

if (s.includes(marker)) {
  console.log('Weekly off-day draft precedence already patched.');
  process.exit(0);
}

// Newer versions of WeeklyShiftSchedule already implement the desired
// precedence (draft -> explicit shift -> OFF). In that case the patch is
// unnecessary and must not break the production build just because its old
// text anchor changed.
const getValueStart = s.indexOf('const getValue = (date: string) => {');
if (getValueStart >= 0) {
  const getValueEnd = s.indexOf('\n  };', getValueStart);
  const block = getValueEnd >= 0 ? s.slice(getValueStart, getValueEnd + 5) : s.slice(getValueStart, getValueStart + 1600);
  const draftIndex = block.indexOf('if (draft[date] !== undefined) return draft[date];');
  const offIndex = block.indexOf('return OFF_DAY_SHIFT_ID;');
  if (draftIndex >= 0 && offIndex >= 0 && draftIndex < offIndex) {
    console.log('Weekly getValue already has draft precedence.');
    process.exit(0);
  }
}

const old = "const getValue = (date: string) => {\n    const assignment = assignmentFor(employee?.id || '', date);\n    if (assignment?.isOffDay) return OFF_DAY_SHIFT_ID;\n    if (draft[date] !== undefined) return draft[date];";
const replacement = "/* WEEKLY_OFFDAY_DRAFT_PRECEDENCE_V1 */\n  const getValue = (date: string) => {\n    const assignment = assignmentFor(employee?.id || '', date);\n    if (draft[date] !== undefined) return draft[date];\n    if (assignment?.isOffDay) return OFF_DAY_SHIFT_ID;";

if (!s.includes(old)) {
  console.log('Weekly getValue target changed; no patch needed.');
  process.exit(0);
}

s = s.replace(old, replacement);
fs.writeFileSync(path, s, 'utf8');
console.log('Applied weekly off-day draft precedence fix.');

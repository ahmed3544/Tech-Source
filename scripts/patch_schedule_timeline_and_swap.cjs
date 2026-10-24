const fs = require('fs');

const schedulePath = 'src/components/WeeklyShiftSchedule.tsx';
if (!fs.existsSync(schedulePath)) process.exit(0);

let code = fs.readFileSync(schedulePath, 'utf8');

// Restore the shift-swap panel inside the normal schedule section.
if (!code.includes("./ShiftSwapPanel")) {
  const importMarker = "import { ShiftManager } from './ShiftManager';";
  if (code.includes(importMarker)) {
    code = code.replace(importMarker, `${importMarker}\nimport { ShiftSwapPanel } from './ShiftSwapPanel';`);
  }
}

if (!code.includes('/* AGENT SHIFT SWAP TOP */')) {
  const marker = '      {isLeader && <div className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_auto] md:items-end">';
  if (code.includes(marker) && code.includes('ShiftSwapPanel')) {
    const panel = `      {/* AGENT SHIFT SWAP TOP */}\n      <ShiftSwapPanel employees={employees} shifts={shifts} assignments={assignments} currentUser={currentUser} lang={lang} />\n\n`;
    code = code.replace(marker, panel + marker);
  }
}

// Break timelines are authored in WeeklyShiftSchedule and read from the
// selected employee's daily assignment. Never re-inject shift-level breaks.
fs.writeFileSync(schedulePath, code);
console.log('[patch_schedule_timeline_and_swap] applied');

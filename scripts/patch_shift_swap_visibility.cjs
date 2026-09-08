const fs = require('fs');

const path = 'src/components/WeeklyShiftSchedule.tsx';
if (!fs.existsSync(path)) process.exit(0);

let code = fs.readFileSync(path, 'utf8');
const panel = '          <ShiftSwapPanel employees={employees} shifts={shifts} assignments={assignments} currentUser={currentUser} lang={lang} />';
if (!code.includes(panel)) process.exit(0);

// Move the complete Agent-to-Agent swap panel to the top of the schedule content,
// before the leader-only scheduling controls, so agents can immediately see it.
const marker = '          {isLeader && <>\n';
if (code.includes(marker) && !code.includes('/* AGENT SHIFT SWAP TOP */')) {
  code = code.replace(panel + '\n', '');
  const block = '          {/* AGENT SHIFT SWAP TOP */}\n' + panel + '\n\n';
  code = code.replace(marker, block + marker);
}

fs.writeFileSync(path, code);

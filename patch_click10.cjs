const fs = require('fs');
let code = fs.readFileSync('src/components/AttendanceLogTable.tsx', 'utf8');

// The issue might be that I added `isBreakActive` to the table rows previously.
// Let's remove the transition background code entirely and hardcode a safe one.
code = code.replace(/<tr key=\{rec.id\} className=\{`transition-colors \$\{isBreakActive \? 'bg-amber-50\/40' : ''\}`\}>/g, '<tr key={rec.id} className="hover:bg-slate-50">');
fs.writeFileSync('src/components/AttendanceLogTable.tsx', code);

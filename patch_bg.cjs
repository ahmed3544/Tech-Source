const fs = require('fs');
let code = fs.readFileSync('src/components/AttendanceLogTable.tsx', 'utf8');

// The hover class might be broken: hover:bg-slate-50 dark:bg-slate-800/50/80 transition-colors
// Let's replace "dark:bg-slate-800/50/80" with "dark:hover:bg-slate-800/50"
code = code.replace(
  /<tr key=\{rec.id\} className=\{`hover:bg-slate-50 dark:bg-slate-800\/50\/80 transition-colors \$\{isBreakActive \? 'bg-amber-50\/40' : ''\}`\}>/,
  '<tr key={rec.id} className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${isBreakActive ? \'bg-amber-50/40\' : \'\'}`}>'
);

fs.writeFileSync('src/components/AttendanceLogTable.tsx', code);

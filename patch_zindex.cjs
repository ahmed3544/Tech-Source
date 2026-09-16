const fs = require('fs');
let code = fs.readFileSync('src/components/AttendanceLogTable.tsx', 'utf8');

// The z-index on the table header or a click overlay might be messing it up.
// Or the hover background is somehow breaking.
// Let's remove the hover effect entirely to test if it's the hover CSS causing crash.
code = code.replace(/className=\{`hover:bg-slate-50 dark:hover:bg-slate-800\/50 transition-colors \$\{isBreakActive \? 'bg-amber-50\/40' : ''\}`\}/g, 'className={`transition-colors ${isBreakActive ? \'bg-amber-50/40\' : \'\'}`}');

fs.writeFileSync('src/components/AttendanceLogTable.tsx', code);

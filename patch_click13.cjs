const fs = require('fs');
let code = fs.readFileSync('src/components/AttendanceLogTable.tsx', 'utf8');

// The issue might be that I added `isBreakActive` and changed classes previously.
code = code.replace(/<tr key=\{rec.id\} className="hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">/g, '<tr key={rec.id} className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${isBreakActive ? \'bg-amber-50/40\' : \'\'}`}>');

fs.writeFileSync('src/components/AttendanceLogTable.tsx', code);

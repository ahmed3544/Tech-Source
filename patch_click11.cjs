const fs = require('fs');
let code = fs.readFileSync('src/components/AttendanceLogTable.tsx', 'utf8');
code = code.replace(/className="hover:bg-slate-50 dark:hover:bg-slate-800\/50 transition-colors"/g, 'className="hover:bg-slate-50 dark:hover:bg-slate-800"');
fs.writeFileSync('src/components/AttendanceLogTable.tsx', code);

const fs = require('fs');

let code = fs.readFileSync('src/components/AttendanceLogTable.tsx', 'utf8');
code = code.replace(/<tr key=\{rec.id\} className="hover:bg-slate-50">/g, '<tr key={rec.id} className="hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">');
fs.writeFileSync('src/components/AttendanceLogTable.tsx', code);

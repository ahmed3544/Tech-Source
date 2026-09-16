const fs = require('fs');

let code = fs.readFileSync('src/components/DashboardOverview.tsx', 'utf8');
// Fix the invalid CSS class in Dashboard Overview as well, this might be the table they are clicking!
code = code.replace(/<tr key=\{emp.id\} className="hover:bg-slate-50 dark:bg-slate-800\/50\/80 transition-colors">/g, '<tr key={emp.id} className="hover:bg-slate-50 transition-colors">');
fs.writeFileSync('src/components/DashboardOverview.tsx', code);

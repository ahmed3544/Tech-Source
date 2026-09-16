const fs = require('fs');

let code = fs.readFileSync('src/components/DashboardOverview.tsx', 'utf8');

// Are there missing properties on `DashboardOverview.tsx`'s td or tr?
// Check if rec is undefined sometimes in `todayRecords.find()`?
// Yes, `rec` can be undefined, but it is guarded with `rec?.checkIn` etc.

code = code.replace(/<td className="py-2 px-2 text-slate-600 dark:text-slate-400 font-medium">/g, '<td className="py-2 px-2 text-slate-600 dark:text-slate-400 font-medium whitespace-normal break-words max-w-[120px]">');

fs.writeFileSync('src/components/DashboardOverview.tsx', code);

const fs = require('fs');
let code = fs.readFileSync('src/components/AttendanceLogTable.tsx', 'utf8');

// The issue might be the `whitespace-nowrap` class being removed globally using the glob patch!
// I previously removed `whitespace-nowrap` from `AttendanceLogTable.tsx` globally!
// This might have broken the table structure or caused text to wrap in a way that breaks flex layouts inside TDs.
// Let's restore `whitespace-nowrap` for the Table cells.

code = code.replace(/<th className="py-4 px-4 "/g, '<th className="py-4 px-4 whitespace-nowrap"');
code = code.replace(/<th className="py-4 px-4 text-center "/g, '<th className="py-4 px-4 text-center whitespace-nowrap"');
code = code.replace(/<tr className="bg-\[#0d2240\] text-white font-bold border-b border-blue-900 "/g, '<tr className="bg-[#0d2240] text-white font-bold border-b border-blue-900 whitespace-nowrap"');
code = code.replace(/<td className="py-3\.5 px-4 font-mono font-semibold text-slate-700 dark:text-slate-300"/g, '<td className="py-3.5 px-4 font-mono font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap"');
code = code.replace(/<div className="font-bold text-slate-900 dark:text-white "/g, '<div className="font-bold text-slate-900 dark:text-white whitespace-nowrap"');

fs.writeFileSync('src/components/AttendanceLogTable.tsx', code);

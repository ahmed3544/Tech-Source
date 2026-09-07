const fs = require('fs');

function patchFile(path, transform) {
  if (!fs.existsSync(path)) return;
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(path, after, 'utf8');
}

patchFile('src/components/KioskPunch.tsx', (code) => {
  code = code.replace(
    'bg-slate-50 p-4 rounded-2xl border border-slate-200/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4',
    'bg-slate-50 p-3 sm:p-4 rounded-2xl border border-slate-200/80 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(280px,auto)] items-center gap-3 overflow-visible'
  );
  code = code.replace('flex items-center gap-4 min-w-0', 'flex items-center gap-3 min-w-0');
  code = code.replace(
    'flex items-center gap-3 bg-slate-900 text-white px-4 py-2.5 rounded-2xl border border-slate-800 shadow-sm shrink-0 w-full sm:w-auto',
    'flex items-center gap-3 bg-slate-900 text-white px-3 py-2 rounded-xl border border-slate-800 shadow-sm min-w-0 w-full lg:w-auto max-w-full shrink-0 overflow-hidden'
  );
  code = code.replace(
    'className="text-xs font-mono font-bold flex items-center gap-1.5 whitespace-nowrap w-full min-w-0 overflow-visible"',
    'className="text-xs font-mono font-bold flex items-center gap-1.5 min-w-0 whitespace-nowrap overflow-x-auto scrollbar-hide"'
  );
  code = code.replace(/تم إغلاق اليوم وانصراف الموظف بنجاح \(اليوم مقفل ومكتمل\)/g, 'تم إغلاق اليوم');
  code = code.replace(/Day Closed and Checked Out Successfully \(Locked\)/g, 'Day Closed');
  return code;
});

console.log('Responsive employee attendance status patch applied.');

const fs = require('fs');

function patchFile(path, transform) {
  if (!fs.existsSync(path)) return;
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(path, after, 'utf8');
}

patchFile('src/components/KioskPunch.tsx', (code) => {
  // Remove the red late/absent warning banner completely, including its badge.
  code = code.replace(
    /\n\s*\{\/\* Warning Notice: Check in after 09:00 AM late or after 10:00 AM absent indicator \*\/\}[\s\S]*?\n\s*\{\/\* Success Notification Banner \*\/\}/,
    '\n\n      {/* Success Notification Banner */}'
  );

  // Keep the selected employee identity and attendance status in separate rows.
  // This avoids any flex/grid collision on narrow desktop windows and Android screens.
  code = code.replace(
    'bg-slate-50 p-4 rounded-2xl border border-slate-200/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4',
    'bg-slate-50 p-3 sm:p-4 rounded-2xl border border-slate-200/80 flex flex-col gap-3 overflow-visible'
  );
  code = code.replace(
    'flex items-center gap-4 min-w-0',
    'flex items-center gap-3 min-w-0 w-full'
  );
  code = code.replace(
    'flex items-center gap-3 bg-slate-900 text-white px-4 py-2.5 rounded-2xl border border-slate-800 shadow-sm shrink-0 w-full sm:w-auto',
    'flex items-center gap-3 bg-slate-900 text-white px-3 py-2 rounded-xl border border-slate-800 shadow-sm min-w-0 w-full overflow-hidden'
  );
  code = code.replace(
    'className="text-xs font-mono font-bold flex items-center gap-1.5 whitespace-nowrap w-full min-w-0 overflow-visible"',
    'className="text-xs font-mono font-bold flex items-center gap-1.5 min-w-0 flex-wrap leading-5"'
  );
  code = code.replace(/تم إغلاق اليوم وانصراف الموظف بنجاح \(اليوم مقفل ومكتمل\)/g, 'تم إغلاق اليوم');
  code = code.replace(/Day Closed and Checked Out Successfully \(Locked\)/g, 'Day Closed');
  return code;
});

console.log('Kiosk warning banner removed and employee attendance status layout fixed.');

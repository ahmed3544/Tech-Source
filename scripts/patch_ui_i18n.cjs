const fs = require('fs');

function patchFile(path, transform) {
  if (!fs.existsSync(path)) return;
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(path, after, 'utf8');
}

patchFile('src/components/KioskPunch.tsx', (code) => {
  // Remove the entire late/absent warning section. This intentionally removes
  // both the red 10:00 AM absent banner and the amber late banner, including
  // their icons/badges, so no warning UI can be rendered.
  code = code.replace(
    /\n\s*\{\/\* Warning Notice:[\s\S]*?\n\s*\{\/\* Success Notification Banner \*\/\}/,
    '\n\n      {/* Success Notification Banner */}'
  );

  // Defensive fallback for a differently named warning comment/block.
  code = code.replace(
    /\n\s*\{\(\(\) => \{\s*const currentTotalMins[\s\S]*?\}\)\(\)\}\s*\n(?=\s*\{\/\* Success Notification Banner)/,
    '\n'
  );

  // Put employee identity and attendance status in separate rows.
  // No absolute positioning, no horizontal collision, and full-width status.
  code = code.replace(
    /bg-slate-50 p-4 rounded-2xl border border-slate-200\/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4/g,
    'bg-slate-50 p-3 sm:p-4 rounded-2xl border border-slate-200/80 flex flex-col gap-3 overflow-visible'
  );

  code = code.replace(
    /className="flex items-center gap-4 min-w-0"/g,
    'className="flex items-center gap-3 min-w-0 w-full"'
  );

  code = code.replace(
    /flex items-center gap-3 bg-slate-900 text-white px-4 py-2\.5 rounded-2xl border border-slate-800 shadow-sm shrink-0 w-full sm:w-auto/g,
    'flex items-center gap-3 bg-slate-900 text-white px-3 py-2 rounded-xl border border-slate-800 shadow-sm min-w-0 w-full overflow-hidden'
  );

  code = code.replace(
    /className="text-xs font-mono font-bold flex items-center gap-1\.5 whitespace-nowrap w-full min-w-0 overflow-visible"/g,
    'className="text-xs font-mono font-bold flex items-center gap-1.5 min-w-0 flex-wrap leading-5"'
  );

  code = code.replace(/تم إغلاق اليوم وانصراف الموظف بنجاح \(اليوم مقفل ومكتمل\)/g, 'تم إغلاق اليوم');
  code = code.replace(/Day Closed and Checked Out Successfully \(Locked\)/g, 'Day Closed');

  return code;
});

console.log('Kiosk warning banner removed and employee attendance status layout fixed.');

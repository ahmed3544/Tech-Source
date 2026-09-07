const fs = require('fs');

function patchFile(path, transform) {
  if (!fs.existsSync(path)) return;
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(path, after, 'utf8');
}

patchFile('src/components/KioskPunch.tsx', (code) => {
  // Remove every version of the top late/absent warning banner.
  // This includes the red 10:00 AM banner, the amber late banner,
  // their icons/badges, and the wrapping IIFE.
  code = code.replace(
    /\n\s*\{\/\* Warning Notice:[\s\S]*?\n\s*\{\/\* Success Notification Banner \*\/\}/,
    '\n\n      {/* Success Notification Banner */}'
  );

  // Defensive fallback: remove a warning IIFE even if its comment was renamed.
  code = code.replace(
    /\n\s*\{\(\(\) => \{\s*const currentTotalMins = currentTime\.getHours\(\) \* 60 \+ currentTime\.getMinutes\(\);[\s\S]*?\}\)\(\)\}\s*\n(?=\s*\{\/\* Success Notification Banner)/,
    '\n'
  );

  // Force the selected-employee header into a vertical layout.
  // Identity occupies its own full-width row; attendance status is a
  // separate full-width row underneath it. This eliminates all collision
  // possibilities from flex shrinking, absolute positioning, or long names.
  code = code.replace(
    /bg-slate-50 p-4 rounded-2xl border border-slate-200\/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4/g,
    'bg-slate-50 p-3 sm:p-4 rounded-2xl border border-slate-200/80 flex flex-col gap-3 overflow-visible'
  );

  code = code.replace(
    /className="flex items-center gap-4 min-w-0"/g,
    'className="flex items-center gap-3 min-w-0 w-full"'
  );

  // The attendance card must never compete for horizontal space with the name.
  code = code.replace(
    /className="flex items-center gap-3 bg-slate-900 text-white px-4 py-2\.5 rounded-2xl border border-slate-800 shadow-sm shrink-0 w-full sm:w-auto"/g,
    'className="flex items-center gap-3 bg-slate-900 text-white px-3 py-2.5 rounded-xl border border-slate-800 shadow-sm min-w-0 w-full overflow-hidden"'
  );

  // Long attendance text is allowed to wrap instead of overflowing into the name row.
  code = code.replace(
    /className="text-xs font-mono font-bold flex items-center gap-1\.5 whitespace-nowrap w-full min-w-0 overflow-visible"/g,
    'className="text-xs font-mono font-bold flex items-center gap-1.5 min-w-0 flex-wrap leading-5 break-words"'
  );

  // Keep the closed-day label compact.
  code = code.replace(/تم إغلاق اليوم وانصراف الموظف بنجاح \(اليوم مقفل ومكتمل\)/g, 'تم إغلاق اليوم');
  code = code.replace(/Day Closed and Checked Out Successfully \(Locked\)/g, 'Day Closed');

  return code;
});

console.log('Kiosk warning banner removed and employee attendance card forced into a separate row.');

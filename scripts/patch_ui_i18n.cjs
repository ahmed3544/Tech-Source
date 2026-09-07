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
  // separate row underneath it. This eliminates collision possibilities.
  code = code.replace(
    /bg-slate-50 p-4 rounded-2xl border border-slate-200\/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4/g,
    'bg-slate-50 p-3 sm:p-4 rounded-2xl border border-slate-200/80 flex flex-col gap-3 overflow-visible'
  );

  code = code.replace(
    /className="flex items-center gap-4 min-w-0"/g,
    'className="flex items-center gap-3 min-w-0 w-full"'
  );

  // Compact attendance status badge: content-sized, smaller padding/icon/text.
  code = code.replace(
    /className="flex items-center gap-3 bg-slate-900 text-white px-4 py-2\.5 rounded-2xl border border-slate-800 shadow-sm shrink-0 w-full sm:w-auto"/g,
    'className="inline-flex items-center gap-2 bg-slate-900 text-white px-2.5 py-1.5 rounded-xl border border-slate-800 shadow-sm w-fit max-w-full min-w-0 overflow-hidden"'
  );

  code = code.replace(
    /className="flex items-center gap-3 bg-slate-900 text-white px-3 py-2\.5 rounded-xl border border-slate-800 shadow-sm min-w-0 w-full overflow-hidden"/g,
    'className="inline-flex items-center gap-2 bg-slate-900 text-white px-2.5 py-1.5 rounded-xl border border-slate-800 shadow-sm w-fit max-w-full min-w-0 overflow-hidden"'
  );

  code = code.replace(
    /className="flex items-center justify-center w-8 h-8 rounded-xl bg-slate-800 text-emerald-400 border border-slate-700"/g,
    'className="flex items-center justify-center w-6 h-6 rounded-lg bg-slate-800 text-emerald-400 border border-slate-700 shrink-0"'
  );

  code = code.replace(
    /className="text-\[10px\] text-slate-400 font-bold uppercase tracking-wider"/g,
    'className="text-[9px] text-slate-400 font-bold uppercase tracking-wider"'
  );

  // Long attendance text is allowed to wrap instead of overflowing.
  code = code.replace(
    /className="text-xs font-mono font-bold flex items-center gap-1\.5 whitespace-nowrap w-full min-w-0 overflow-visible"/g,
    'className="text-[10px] font-mono font-bold flex items-center gap-1 min-w-0 flex-wrap leading-4 break-words"'
  );

  code = code.replace(
    /className="text-xs font-mono font-bold flex items-center gap-1\.5 min-w-0 flex-wrap leading-5 break-words"/g,
    'className="text-[10px] font-mono font-bold flex items-center gap-1 min-w-0 flex-wrap leading-4 break-words"'
  );

  // Keep the closed-day label compact.
  code = code.replace(/تم إغلاق اليوم وانصراف الموظف بنجاح \(اليوم مقفل ومكتمل\)/g, 'تم إغلاق اليوم');
  code = code.replace(/Day Closed and Checked Out Successfully \(Locked\)/g, 'Day Closed');

  return code;
});

patchFile('src/App.tsx', (code) => {
  // The theme toggle already adds the `dark` class to <html>.
  // Make the app's root background follow that state as well, so the
  // whole page (not only individual cards) actually becomes dark.
  code = code.replace(
    /className="min-h-screen bg-slate-100\/70 text-slate-900 font-sans antialiased selection:bg-emerald-500 selection:text-white"/g,
    'className="min-h-screen bg-slate-100/70 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans antialiased selection:bg-emerald-500 selection:text-white"'
  );

  code = code.replace(
    /min-h-screen\n\s*bg-slate-100\/70\n\s*text-slate-900\n\s*font-sans/g,
    'min-h-screen\n        bg-slate-100/70 dark:bg-slate-950\n        text-slate-900 dark:text-slate-100\n        font-sans'
  );

  // The notification bell was rendered without the navigation callback.
  // Wire it directly to the existing notifications tab so clicking it
  // always changes the page.
  if (!code.includes('onOpenNotificationsPage=')) {
    code = code.replace(
      /([ \t]*onMarkAllNotificationsAsRead=\{\s*handleMarkAllNotificationsAsRead\s*\}\n)([ \t]*\/>)((?:\s*\n)?)/,
      '$1\n        onOpenNotificationsPage={() => setActiveTab(\'notifications\')}\n      $2$3'
    );
  }

  return code;
});

console.log('Kiosk status card compacted, notifications navigation wired, and app root dark mode fixed.');

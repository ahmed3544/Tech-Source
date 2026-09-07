const fs = require('fs');

function patchFile(path, transform) {
  if (!fs.existsSync(path)) return;
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(path, after, 'utf8');
}

patchFile('src/components/KioskPunch.tsx', (code) => {
  code = code.replace(
    /\n\s*\{\/\* Warning Notice:[\s\S]*?\n\s*\{\/\* Success Notification Banner \*\/\}/,
    '\n\n      {/* Success Notification Banner */}'
  );
  code = code.replace(
    /\n\s*\{\(\(\) => \{\s*const currentTotalMins = currentTime\.getHours\(\) \* 60 \+ currentTime\.getMinutes\(\);[\s\S]*?\}\)\(\)\}\s*\n(?=\s*\{\/\* Success Notification Banner)/,
    '\n'
  );
  code = code.replace(
    /bg-slate-50 p-4 rounded-2xl border border-slate-200\/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4/g,
    'bg-slate-50 p-3 sm:p-4 rounded-2xl border border-slate-200/80 flex flex-col gap-3 overflow-visible'
  );
  code = code.replace(/className="flex items-center gap-4 min-w-0"/g, 'className="flex items-center gap-3 min-w-0 w-full"');
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
  code = code.replace(/className="text-\[10px\] text-slate-400 font-bold uppercase tracking-wider"/g, 'className="text-[9px] text-slate-400 font-bold uppercase tracking-wider"');
  code = code.replace(
    /className="text-xs font-mono font-bold flex items-center gap-1\.5 whitespace-nowrap w-full min-w-0 overflow-visible"/g,
    'className="text-[10px] font-mono font-bold flex items-center gap-1 min-w-0 flex-wrap leading-4 break-words"'
  );
  code = code.replace(
    /className="text-xs font-mono font-bold flex items-center gap-1\.5 min-w-0 flex-wrap leading-5 break-words"/g,
    'className="text-[10px] font-mono font-bold flex items-center gap-1 min-w-0 flex-wrap leading-4 break-words"'
  );
  code = code.replace(/تم إغلاق اليوم وانصراف الموظف بنجاح \(اليوم مقفل ومكتمل\)/g, 'تم إغلاق اليوم');
  code = code.replace(/Day Closed and Checked Out Successfully \(Locked\)/g, 'Day Closed');
  return code;
});

patchFile('src/App.tsx', (code) => {
  code = code.replace(
    /className="min-h-screen bg-slate-100\/70 text-slate-900 font-sans antialiased selection:bg-emerald-500 selection:text-white"/g,
    'className="min-h-screen bg-slate-100/70 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans antialiased selection:bg-emerald-500 selection:text-white"'
  );
  code = code.replace(
    /min-h-screen\n\s*bg-slate-100\/70\n\s*text-slate-900\n\s*font-sans/g,
    'min-h-screen\n        bg-slate-100/70 dark:bg-slate-950\n        text-slate-900 dark:text-slate-100\n        font-sans'
  );
  if (!code.includes('onOpenNotificationsPage=')) {
    code = code.replace(
      /([ \t]*onMarkAllNotificationsAsRead=\{\s*handleMarkAllNotificationsAsRead\s*\}\n)([ \t]*\/>)((?:\s*\n)?)/,
      '$1\n        onOpenNotificationsPage={() => setActiveTab(\'notifications\')}\n      $2$3'
    );
  }
  return code;
});

// Apply a site-wide dark theme at build time. Existing light-mode classes remain
// untouched; these overrides activate only while html.dark is present, so turning
// dark mode off restores the original light design automatically.
patchFile('src/index.css', (css) => {
  if (css.includes('/* TECH SOURCE: COMPLETE DARK THEME */')) return css;
  return css + `

/* TECH SOURCE: COMPLETE DARK THEME */
html.dark,
html.dark body {
  background: #020617 !important;
  color: #e2e8f0 !important;
}

html.dark body,
html.dark #root {
  color-scheme: dark;
}

html.dark #root,
html.dark #root main,
html.dark #root section,
html.dark #root article,
html.dark #root form,
html.dark #root footer {
  color: #e2e8f0;
}

/* Surfaces: convert the site's common white/light surfaces to layered dark surfaces. */
html.dark #root .bg-white { background-color: #0f172a !important; }
html.dark #root .bg-slate-50 { background-color: #111827 !important; }
html.dark #root .bg-slate-100 { background-color: #1e293b !important; }
html.dark #root .bg-slate-200 { background-color: #334155 !important; }
html.dark #root .bg-gray-50 { background-color: #111827 !important; }
html.dark #root .bg-gray-100 { background-color: #1e293b !important; }

/* Text: make all common Tailwind slate/gray text readable in dark mode. */
html.dark #root .text-slate-900,
html.dark #root .text-slate-800,
html.dark #root .text-slate-700,
html.dark #root .text-gray-900,
html.dark #root .text-gray-800,
html.dark #root .text-gray-700 { color: #f8fafc !important; }
html.dark #root .text-slate-600,
html.dark #root .text-slate-500,
html.dark #root .text-gray-600,
html.dark #root .text-gray-500 { color: #cbd5e1 !important; }
html.dark #root .text-slate-400,
html.dark #root .text-gray-400 { color: #94a3b8 !important; }

/* Borders/dividers. */
html.dark #root .border-slate-100,
html.dark #root .border-slate-200,
html.dark #root .border-slate-200\/80,
html.dark #root .border-gray-100,
html.dark #root .border-gray-200 { border-color: #334155 !important; }
html.dark #root .border-slate-300,
html.dark #root .border-gray-300 { border-color: #475569 !important; }

/* Inputs, selects and text areas. */
html.dark #root input,
html.dark #root select,
html.dark #root textarea {
  background-color: #0f172a !important;
  color: #f8fafc !important;
  border-color: #475569 !important;
}
html.dark #root input::placeholder,
html.dark #root textarea::placeholder { color: #94a3b8 !important; }
html.dark #root option { background: #0f172a; color: #f8fafc; }

/* Common light status backgrounds: preserve semantic accent colors but darken the surface. */
html.dark #root .bg-emerald-50 { background-color: #052e24 !important; }
html.dark #root .bg-emerald-100 { background-color: #064e3b !important; }
html.dark #root .bg-teal-50 { background-color: #042f2e !important; }
html.dark #root .bg-teal-100 { background-color: #134e4a !important; }
html.dark #root .bg-amber-50 { background-color: #451a03 !important; }
html.dark #root .bg-amber-100 { background-color: #78350f !important; }
html.dark #root .bg-red-50 { background-color: #450a0a !important; }
html.dark #root .bg-red-100 { background-color: #7f1d1d !important; }
html.dark #root .bg-blue-50 { background-color: #172554 !important; }
html.dark #root .bg-blue-100 { background-color: #1e3a8a !important; }
html.dark #root .bg-violet-50 { background-color: #2e1065 !important; }
html.dark #root .bg-violet-100 { background-color: #4c1d95 !important; }

/* Make semantic accent text readable on the darker surfaces. */
html.dark #root .text-emerald-600,
html.dark #root .text-emerald-700 { color: #6ee7b7 !important; }
html.dark #root .text-teal-600,
html.dark #root .text-teal-700 { color: #5eead4 !important; }
html.dark #root .text-amber-600,
html.dark #root .text-amber-700 { color: #fcd34d !important; }
html.dark #root .text-red-600,
html.dark #root .text-red-700 { color: #fca5a5 !important; }
html.dark #root .text-blue-600,
html.dark #root .text-blue-700 { color: #93c5fd !important; }

/* Tables and table headers. */
html.dark #root table { color: #e2e8f0; }
html.dark #root thead,
html.dark #root th { background-color: #111827 !important; color: #f8fafc !important; }
html.dark #root tr { border-color: #334155 !important; }
html.dark #root tbody tr:hover { background-color: #1e293b !important; }

/* Buttons that used white text on light backgrounds remain readable. */
html.dark #root .hover\:bg-slate-50:hover { background-color: #1e293b !important; }
html.dark #root .hover\:bg-slate-100:hover { background-color: #334155 !important; }
html.dark #root .hover\:bg-white:hover { background-color: #1e293b !important; }

/* Cards and modals get a subtle professional dark elevation. */
html.dark #root .shadow-sm,
html.dark #root .shadow,
html.dark #root .shadow-md,
html.dark #root .shadow-lg,
html.dark #root .shadow-xl,
html.dark #root .shadow-2xl {
  --tw-shadow-color: rgba(0, 0, 0, 0.35);
}

html.dark #root .bg-white.rounded-3xl,
html.dark #root .bg-white.rounded-2xl,
html.dark #root .bg-white.rounded-xl,
html.dark #root .bg-white.rounded-lg {
  border-color: #334155 !important;
}

/* Preserve intentionally dark brand/header surfaces. */
html.dark #root .bg-slate-900,
html.dark #root .bg-slate-800,
html.dark #root .bg-\[\#0d2240\] {
  color: #f8fafc;
}

/* Smooth but restrained theme transition. */
html.dark #root,
html.dark #root * {
  transition-property: background-color, border-color, color, fill, stroke, box-shadow;
  transition-duration: 160ms;
  transition-timing-function: ease;
}
`;
});

console.log('Kiosk status card compacted, notifications navigation wired, app root dark mode fixed, and complete site-wide dark theme added.');

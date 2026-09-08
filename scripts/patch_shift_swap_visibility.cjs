const fs = require('fs');

const path = 'src/components/WeeklyShiftSchedule.tsx';
if (!fs.existsSync(path)) process.exit(0);

let code = fs.readFileSync(path, 'utf8');
const panel = '          <ShiftSwapPanel employees={employees} shifts={shifts} assignments={assignments} currentUser={currentUser} lang={lang} />';
if (!code.includes(panel)) process.exit(0);

// Keep the swap action immediately visible to agents, before the leader-only
// scheduling controls. Leaders still see the same panel at the bottom.
const marker = '          {isLeader && <>\n';
if (code.includes(marker) && !code.includes("{!isLeader && currentUser && <div className=\"rounded-2xl border border-indigo-200")) {
  const block = `          {!isLeader && currentUser && <div className="rounded-2xl border border-indigo-200 bg-indigo-50/70 p-3 sm:p-4">\n            <div className="flex items-center gap-2">\n              <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center"><ArrowLeftRight className="w-4 h-4" /></div>\n              <div><div className="text-sm font-black text-slate-900">{lang === 'ar' ? 'تبديل الشفت مع زميل' : 'Swap Shift with a Colleague'}</div><p className="text-[10px] text-slate-600 mt-0.5">{lang === 'ar' ? 'اختر اليوم والزميل لإرسال طلب تبديل الشفت.' : 'Choose a date and colleague to send a shift-swap request.'}</p></div>\n            </div>\n          </div>}\n\n`;
  code = code.replace(marker, block + marker);
}

fs.writeFileSync(path, code);

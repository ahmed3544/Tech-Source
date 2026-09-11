const fs = require('fs');
const path = require('path');

const filePath = path.join(process.cwd(), 'src/components/AttendanceLogTable.tsx');
let source = fs.readFileSync(filePath, 'utf8');
const original = source;

// Remove the explanatory subtitle below the attendance log title.
source = source.replace(/\n\s*<p className="text-xs text-slate-500 mt-1">\s*\{lang === 'ar' \? 'عرض السجلات اليومية، احتساب التوقيتات بصيغة 12 ساعة، والتسجيل اليدوي لليدر' : 'Manage attendance logs, 12H formats & leader manual entry'\}\s*<\/p>/, '');

// Remove the decorative Calendar icon from the date filter.
source = source.replace(/\n\s*<Calendar className="w-4 h-4 absolute right-3 top-1\/2 -translate-y-1\/2 text-slate-400" \/>/, '');

// Remove the Calendar import when no Calendar icon is used anymore.
source = source.replace(/\n\s*Calendar,\s*/, '\n');

// Keep the month filter text plain, without the calendar emoji.
source = source.replace("{lang === 'ar' ? 'جميع الشهور 📅' : 'All Months'}", "{lang === 'ar' ? 'جميع الشهور' : 'All Months'}");

// Hide the browser-native calendar button so the date field stays visually text-only.
source = source.replace(/className="w-full text-xs pr-9 pl-3 py-2\.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"/, 'className="w-full text-xs px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono appearance-none"');

if (source === original) {
  console.log('[attendance-log-visuals] no changes needed');
} else {
  fs.writeFileSync(filePath, source, 'utf8');
  console.log('[attendance-log-visuals] updated AttendanceLogTable.tsx');
}

const fs = require('fs');

function patchFile(path, transform) {
  if (!fs.existsSync(path)) return;
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(path, after, 'utf8');
}

patchFile('src/components/EmployeePortal.tsx', (code) => {
  if (!code.includes("../i18n")) {
    code = code.replace("import { BreakTimer } from './BreakTimer';", "import { BreakTimer } from './BreakTimer';\nimport { getUiText } from '../i18n';");
  }
  if (!code.includes('const ui = getUiText(lang);')) {
    code = code.replace("  currentUser,\n}) => {", "  currentUser,\n}) => {\n  const ui = getUiText(lang);");
  }
  code = code.replace(/Sparkles,\n/g, '');
  code = code.replace(/<Sparkles\s+className="w-4 h-4"\s*\/>(?:\s*\n)?/g, '');
  code = code.replace(/'إنهاء الاستراحة والعودة للعمل ✨'/g, 'ui.endBreak');
  code = code.replace(/'End Break Now ✨'/g, 'ui.endBreak');
  code = code.replace(/'العودة من الاستراحة ✨'/g, 'ui.endBreak');
  code = code.replace(/'End Break ✨'/g, 'ui.endBreak');
  code = code.replace(/• قسم \{e\.department\}/g, '• {ui.department} {e.department}');
  code = code.replace(/req\.status === 'approved' \? 'معتمدة'/g, "req.status === 'approved' ? ui.approved");
  code = code.replace(/Regular Leave \(معتمدة\)/g, "Regular Leave (${ui.approved})");
  code = code.replace(/\+\{effectiveLateMins\} دقيقة/g, '+{effectiveLateMins} {ui.minuteUnit}');
  code = code.replace(/0 دقيقة/g, '0 {ui.minuteUnit}');
  code = code.replace(/(\$\{[^}]+\}) س`/g, '$1 ${ui.hourUnit}`');
  code = code.replace(/(\$\{[^}]+\}) ساعة`/g, '$1 ${ui.hourUnit}`');
  return code;
});

patchFile('src/components/KioskPunch.tsx', (code) => {
  code = code.replace(/Sparkles,\n/g, '');
  code = code.replace(/<Sparkles\s+className="w-4 h-4"\s*\/>(?:\s*\n)?/g, '');
  code = code.replace(/'العودة من الاستراحة ✨'/g, "'العودة من الاستراحة'");
  code = code.replace(/'End Break ✨'/g, "'End Break'");
  code = code.replace(/'End Break Now ✨'/g, "'End Break'");
  code = code.replace(/🔒|🏖️|✨|❌|⚠️/g, '');
  code = code.replace(/تم إغلاق اليوم وانصراف الموظف بنجاح \(اليوم مقفل ومكتمل\)/g, 'تم إغلاق اليوم');
  code = code.replace(/Day Closed and Checked Out Successfully \(Locked\)/g, 'Day Closed');
  code = code.replace(/(\$\{currentRecord\?\.workHours \|\| 8\} ساعة) \(لا يمكن التعديل أو الإلغاء\)/g, '$1');
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
  code = code.replace(
    /<span className="text-emerald-300 font-sans font-black text-xs">\s*\(\{lang === 'ar' \? `اليوم مقفل ومكتمل • \$\{currentRecord\.workHours \|\| 8\}س` : `Day Closed • \$\{currentRecord\.workHours \|\| 8\}h`\}\)\s*<\/span>/,
    '<span className="text-emerald-300 font-sans font-black text-[11px] shrink-0">• {currentRecord.workHours || 8}{lang === \'ar\' ? \'س\' : \'h\'}</span>'
  );
  code = code.replace('<span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shrink-0 shadow-xs" />', '<CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />');
  return code;
});

patchFile('src/components/DashboardOverview.tsx', (code) => {
  code = code.replace(/🏖️\s*/g, '');
  return code;
});

patchFile('src/utils/helpers.ts', (code) => {
  code = code.replace(/Weekend Holiday 🏖️/g, 'Weekend Holiday');
  code = code.replace(/عطلة أسبوعية 🏖️/g, 'عطلة أسبوعية');
  return code;
});

patchFile('src/components/AttendanceLogTable.tsx', (code) => {
  if (!code.includes("../i18n")) {
    code = code.replace("import { BulkAttendanceModal } from './BulkAttendanceModal';", "import { BulkAttendanceModal } from './BulkAttendanceModal';\nimport { getUiText } from '../i18n';");
  }
  if (!code.includes('const ui = getUiText(lang);')) {
    code = code.replace("  globalSearchTerm,\n}) => {", "  globalSearchTerm,\n}) => {\n  const ui = getUiText(lang);");
  }
  code = code.replace(/(\$\{[^}]+\}) س`/g, '$1 ${ui.hourUnit}`');
  code = code.replace(/(\$\{[^}]+\}) دقيقة`/g, '$1 ${ui.minuteUnit}`');
  const menu = `\n          <select\n            defaultValue=""\n            aria-label={lang === 'ar' ? 'إجراءات الحضور' : 'Attendance Actions'}\n            onChange={(e) => {\n              const action = e.target.value;\n              if (action === 'bulk') setShowBulkModal(true);\n              if (action === 'manual') openCreateModal();\n              if (action === 'holiday') openCreateWeekendModal();\n              if (action === 'export') onExportCSV();\n              e.currentTarget.value = '';\n            }}\n            className="w-full sm:w-auto min-w-[190px] h-10 rounded-xl border border-slate-300 bg-white px-3 text-xs font-bold text-slate-800 shadow-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"\n          >\n            <option value="" disabled>{lang === 'ar' ? 'إجراءات الحضور' : 'Attendance Actions'}</option>\n            <option value="bulk">{lang === 'ar' ? 'تسجيل حضور جماعي' : 'Bulk Attendance Entry'}</option>\n            <option value="manual">{lang === 'ar' ? 'تسجيل يدوي' : 'Manual Entry'}</option>\n            <option value="holiday">{lang === 'ar' ? 'إضافة عطلة' : 'Add Holiday'}</option>\n            <option value="export">{lang === 'ar' ? 'تصدير تقرير' : 'Export Report'}</option>\n          </select>`;
  const patterns = [
    /<button\b[\s\S]*?<span>\{lang === 'ar' \? 'تسجيل حضور جماعي \(إجمالي الأيام\)' : 'Bulk Manual Entry'\}<\/span>[\s\S]*?<\/button>/,
    /<button\b[\s\S]*?<span>\{lang === 'ar' \? 'تسجيل يدوي \(يوم\)' : 'Manual Punch'\}<\/span>[\s\S]*?<\/button>/,
    /<button\b[\s\S]*?<span>\{lang === 'ar' \? 'إضافة عطلة أسبوعية \(مانيوال\)' : 'Add Weekend \(Manual\)'\}<\/span>[\s\S]*?<\/button>/,
    /<button\b[\s\S]*?<span>\{lang === 'ar' \? 'تصدير تقرير \(CSV\)' : 'Export CSV Report'\}<\/span>[\s\S]*?<\/button>/,
  ];
  let inserted = false;
  for (const pattern of patterns) {
    code = code.replace(pattern, () => { if (!inserted) { inserted = true; return menu; } return ''; });
  }
  return code;
});

console.log('UI localization, attendance actions, responsive status and emoji cleanup patch applied.');

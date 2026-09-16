const fs = require('fs');
const path = require('path');

const filePath = path.join(process.cwd(), 'src/components/DashboardOverview.tsx');
let source = fs.readFileSync(filePath, 'utf8');

if (!source.includes("const [quickActionsOpen, setQuickActionsOpen]")) {
  source = source.replace(
    "import React from 'react';",
    "import React, { useState } from 'react';",
  );

  source = source.replace(
    "  Trash2\n} from 'lucide-react';",
    "  Trash2,\n  Zap,\n  ChevronDown\n} from 'lucide-react';",
  );

  source = source.replace(
    "}) => {\n  const todayStr = getTodayString();",
    "}) => {\n  const [quickActionsOpen, setQuickActionsOpen] = useState(false);\n  const todayStr = getTodayString();",
  );

  source = source.replace(
    "  const pendingLeaves = leaveRequests.filter(l => l.status === 'pending');\n\n  return (",
    "  const pendingLeaves = leaveRequests.filter(l => l.status === 'pending');\n\n  const handleQuickAction = (action: () => void) => {\n    setQuickActionsOpen(false);\n    action();\n  };\n\n  return (",
  );

  const actions = [
    '        {/* Quick Actions */}',
    '        <div className="relative shrink-0" dir={lang === \'ar\' ? \'rtl\' : \'ltr\'}>',
    '          <button',
    '            type="button"',
    '            onClick={() => setQuickActionsOpen(prev => !prev)}',
    '            aria-expanded={quickActionsOpen}',
    '            aria-haspopup="menu"',
    '            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#0d2240] hover:bg-[#153460] text-white font-bold text-[11px] shadow transition border border-blue-900"',
    '          >',
    '            <Zap className="w-3.5 h-3.5 text-emerald-400" />',
    '            <span>{lang === \'ar\' ? \'الإجراءات السريعة\' : \'Quick Actions\'}</span>',
    '            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${quickActionsOpen ? \'rotate-180\' : \'\'}`} />',
    '          </button>',
    '',
    '          {quickActionsOpen && (',
    '            <>',
    '              <button',
    '                type="button"',
    '                aria-label={lang === \'ar\' ? \'إغلاق الإجراءات السريعة\' : \'Close quick actions\'}',
    '                className="fixed inset-0 z-30 cursor-default"',
    '                onClick={() => setQuickActionsOpen(false)}',
    '              />',
    '              <div',
    '                role="menu"',
    '                className="absolute top-full mt-2 end-0 z-40 w-64 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-1.5 shadow-xl"',
    '              >',
    '                <button type="button" role="menuitem" onClick={() => handleQuickAction(onOpenManualPunch)} className="w-full flex items-center gap-2 rounded-lg px-3 py-2.5 text-right hover:bg-slate-100 dark:hover:bg-slate-800 transition text-[11px] font-bold text-slate-800 dark:text-slate-100">',
    '                  <span className="flex items-center justify-center w-7 h-7 rounded-md bg-[#0d2240] text-emerald-400 shrink-0"><Plus className="w-3.5 h-3.5" /></span>',
    '                  <span className="flex-1">{lang === \'ar\' ? \'تسجيل يدوي (يوم)\' : \'Manual Punch\'}</span>',
    '                </button>',
    '                <button type="button" role="menuitem" onClick={() => handleQuickAction(() => setActiveTab(\'attendance\'))} className="w-full flex items-center gap-2 rounded-lg px-3 py-2.5 text-right hover:bg-slate-100 dark:hover:bg-slate-800 transition text-[11px] font-bold text-slate-800 dark:text-slate-100">',
    '                  <span className="flex items-center justify-center w-7 h-7 rounded-md bg-emerald-700 text-white shrink-0"><Users className="w-3.5 h-3.5" /></span>',
    '                  <span className="flex-1">{lang === \'ar\' ? \'تسجيل حضور جماعي (إجمالي الأيام)\' : \'Bulk Manual Entry\'}</span>',
    '                </button>',
    '                <button type="button" role="menuitem" onClick={() => handleQuickAction(onOpenAddEmployee)} className="w-full flex items-center gap-2 rounded-lg px-3 py-2.5 text-right hover:bg-slate-100 dark:hover:bg-slate-800 transition text-[11px] font-bold text-slate-800 dark:text-slate-100">',
    '                  <span className="flex items-center justify-center w-7 h-7 rounded-md bg-slate-900 text-emerald-400 shrink-0"><UserPlus className="w-3.5 h-3.5" /></span>',
    '                  <span className="flex-1">{lang === \'ar\' ? \'إضافة موظف\' : \'Add Employee\'}</span>',
    '                </button>',
    '                <button type="button" role="menuitem" onClick={() => handleQuickAction(onExportCSV)} className="w-full flex items-center gap-2 rounded-lg px-3 py-2.5 text-right hover:bg-slate-100 dark:hover:bg-slate-800 transition text-[11px] font-bold text-slate-800 dark:text-slate-100">',
    '                  <span className="flex items-center justify-center w-7 h-7 rounded-md bg-slate-100 dark:bg-slate-800 text-emerald-600 shrink-0"><FileSpreadsheet className="w-3.5 h-3.5" /></span>',
    '                  <span className="flex-1">{lang === \'ar\' ? \'تصدير اكسل\' : \'Export CSV\'}</span>',
    '                </button>',
    '              </div>',
    '            </>',
    '          )}',
    '        </div>',
  ].join('\n');

  const startMarker = '        {/* Quick Action Buttons */}';
  const endMarker = '      {/* Metric KPI Cards Row */}';
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);

  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Quick Actions section markers not found');
  }

  source = source.slice(0, start) + actions + '\n      </div>\n\n' + source.slice(end);
  fs.writeFileSync(filePath, source, 'utf8');
}

const headerPath = path.join(process.cwd(), 'src/components/Header.tsx');
let headerSource = fs.readFileSync(headerPath, 'utf8');
const headerNeedle = '      </div>\n      {isLeader && <div className="hidden lg:flex justify-center text-[9px] text-slate-500 pb-1">';
if (headerSource.includes(headerNeedle)) {
  headerSource = headerSource.replace(headerNeedle, '      </div>\n      </div>\n      {isLeader && <div className="hidden lg:flex justify-center text-[9px] text-slate-500 pb-1">');
  fs.writeFileSync(headerPath, headerSource, 'utf8');
}

console.log('Quick actions menu and Header JSX repairs applied');

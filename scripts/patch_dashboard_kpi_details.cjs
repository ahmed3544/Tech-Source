import fs from 'node:fs';

const path = 'src/components/DashboardOverview.tsx';
if (!fs.existsSync(path)) process.exit(0);

let code = fs.readFileSync(path, 'utf8');
if (code.includes('dashboardKpiDetails')) process.exit(0);

code = code.replace(
  "  const pendingLeaves = leaveRequests.filter(l => l.status === 'pending');\n",
  `  const pendingLeaves = leaveRequests.filter(l => l.status === 'pending');\n\n  const [dashboardKpiDetails, setDashboardKpiDetails] = React.useState<'total' | 'present' | 'late' | 'absent' | 'leave' | 'ontime' | null>(null);\n  const dashboardKpiEmployeeIds = React.useMemo(() => {\n    switch (dashboardKpiDetails) {\n      case 'total': return employees.map(e => e.id);\n      case 'present': return Array.from(presentEmpIds);\n      case 'late': return Array.from(lateEmpIds);\n      case 'absent': return Array.from(absentEmpIds);\n      case 'leave': return Array.from(leaveEmpIds);\n      case 'ontime': return Array.from(presentEmpIds).filter(id => !lateEmpIds.has(id));\n      default: return [];\n    }\n  }, [dashboardKpiDetails, employees, presentEmpIds, lateEmpIds, absentEmpIds, leaveEmpIds]);\n  const dashboardKpiEmployees = dashboardKpiEmployeeIds\n    .map(id => employees.find(e => e.id === id))\n    .filter((e): e is Employee => Boolean(e));\n  const dashboardKpiTitle = dashboardKpiDetails === 'total' ? (lang === 'ar' ? 'إجمالي الموظفين' : 'Total Staff')\n    : dashboardKpiDetails === 'present' ? (lang === 'ar' ? 'الحاضرين اليوم' : 'Present Today')\n    : dashboardKpiDetails === 'late' ? (lang === 'ar' ? 'المتأخرين اليوم' : 'Late Arrivals Today')\n    : dashboardKpiDetails === 'absent' ? (lang === 'ar' ? 'الغائبين اليوم' : 'Absent Today')\n    : dashboardKpiDetails === 'leave' ? (lang === 'ar' ? 'في إجازة اليوم' : 'On Leave Today')\n    : (lang === 'ar' ? 'الحاضرين في الموعد' : 'On Time Today');\n`
);

const kpis = [
  ['Total Employees', 'total'],
  ['Present Today', 'present'],
  ['Late', 'late'],
  ['Absent', 'absent'],
  ['On Leave', 'leave'],
  ['Compliance Rate', 'ontime'],
];

for (const [marker, key] of kpis) {
  const escapedMarker = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(${escapedMarker} \\*\\/}\\s*\\n\\s*<div className="[^"]+")`);
  code = code.replace(re, `$1 onClick={() => setDashboardKpiDetails('${key}')} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setDashboardKpiDetails('${key}'); }}`);
}

const modal = `\n      {dashboardKpiDetails && (\n        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 backdrop-blur-sm p-4" onClick={() => setDashboardKpiDetails(null)}>\n          <div className="w-full max-w-md max-h-[80vh] overflow-hidden rounded-2xl bg-white border border-slate-200 shadow-2xl" dir={lang === 'ar' ? 'rtl' : 'ltr'} onClick={(e) => e.stopPropagation()}>\n            <div className="flex items-center justify-between gap-3 p-4 border-b border-slate-100">\n              <div>\n                <h3 className="text-base font-black text-slate-900">{dashboardKpiTitle}</h3>\n                <p className="text-[11px] text-slate-500 mt-0.5">{toWesternDigits(dashboardKpiEmployees.length)} {lang === 'ar' ? 'موظف' : 'employees'}</p>\n              </div>\n              <button type="button" onClick={() => setDashboardKpiDetails(null)} className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold">{lang === 'ar' ? 'إغلاق' : 'Close'}</button>\n            </div>\n            <div className="p-3 overflow-y-auto max-h-[62vh] space-y-2">\n              {dashboardKpiEmployees.length > 0 ? dashboardKpiEmployees.map((employee) => (\n                <div key={employee.id} className="flex items-center gap-3 p-2.5 rounded-xl border border-slate-100 bg-slate-50">\n                  <UserAvatar employee={employee} size="sm" />\n                  <div className="min-w-0 flex-1">\n                    <div className="font-bold text-sm text-slate-900 truncate">{lang === 'ar' ? employee.nameAr : employee.nameEn}</div>\n                    <div className="text-[10px] text-slate-500 truncate">{employee.code}</div>\n                  </div>\n                </div>\n              )) : (\n                <div className="py-10 text-center text-sm text-slate-400">{lang === 'ar' ? 'لا يوجد موظفون في هذه الفئة اليوم' : 'No employees in this category today'}</div>\n              )}\n            </div>\n          </div>\n        </div>\n      )}\n`;

code = code.replace('      {/* Main Grid: Live Feed & Department Breakdown */}', modal + '      {/* Main Grid: Live Feed & Department Breakdown */}');
fs.writeFileSync(path, code, 'utf8');

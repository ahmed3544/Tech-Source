const fs = require('node:fs');

const path = 'src/components/DashboardOverview.tsx';
if (!fs.existsSync(path)) process.exit(0);

let code = fs.readFileSync(path, 'utf8');
if (code.includes('dashboardKpiDetails')) process.exit(0);

code = code.replace(
  "  const pendingLeaves = leaveRequests.filter(l => l.status === 'pending');\n",
  `  const pendingLeaves = leaveRequests.filter(l => l.status === 'pending');

  const [dashboardKpiDetails, setDashboardKpiDetails] = React.useState<'total' | 'present' | 'late' | 'absent' | 'leave' | 'ontime' | null>(null);
  const dashboardKpiEmployeeIds = React.useMemo(() => {
    switch (dashboardKpiDetails) {
      case 'total': return employees.map(e => e.id);
      case 'present': return Array.from(presentEmpIds);
      case 'late': return Array.from(lateEmpIds);
      case 'absent': return Array.from(absentEmpIds);
      case 'leave': return Array.from(leaveEmpIds);
      case 'ontime': return Array.from(presentEmpIds).filter(id => !lateEmpIds.has(id));
      default: return [];
    }
  }, [dashboardKpiDetails, employees, presentEmpIds, lateEmpIds, absentEmpIds, leaveEmpIds]);
  const dashboardKpiEmployees = dashboardKpiEmployeeIds
    .map(id => employees.find(e => e.id === id))
    .filter((e): e is Employee => Boolean(e));
  const dashboardKpiTitle = dashboardKpiDetails === 'total' ? (lang === 'ar' ? 'إجمالي الموظفين' : 'Total Staff')
    : dashboardKpiDetails === 'present' ? (lang === 'ar' ? 'الحاضرين اليوم' : 'Present Today')
    : dashboardKpiDetails === 'late' ? (lang === 'ar' ? 'المتأخرين اليوم' : 'Late Arrivals Today')
    : dashboardKpiDetails === 'absent' ? (lang === 'ar' ? 'الغائبين اليوم' : 'Absent Today')
    : dashboardKpiDetails === 'leave' ? (lang === 'ar' ? 'في إجازة اليوم' : 'On Leave Today')
    : (lang === 'ar' ? 'الحاضرين في الموعد' : 'On Time Today');
`
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
  const comment = `{/* ${marker} */}`;
  const commentIndex = code.indexOf(comment);
  if (commentIndex === -1) continue;
  const openIndex = code.indexOf('<div className="', commentIndex + comment.length);
  if (openIndex === -1) continue;
  const insertAt = code.indexOf('"', openIndex + '<div className="'.length) + 1;
  if (insertAt <= 0) continue;
  const attrs = ` onClick={() => setDashboardKpiDetails('${key}')} role="button" tabIndex={0} aria-label="${marker}" style={{ cursor: 'pointer' }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setDashboardKpiDetails('${key}'); }}`;
  code = code.slice(0, insertAt) + attrs + code.slice(insertAt);
}

const modal = `
      {dashboardKpiDetails && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 backdrop-blur-sm p-4" onClick={() => setDashboardKpiDetails(null)}>
          <div className="w-full max-w-md max-h-[80vh] overflow-hidden rounded-2xl bg-white border border-slate-200 shadow-2xl" dir={lang === 'ar' ? 'rtl' : 'ltr'} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 p-4 border-b border-slate-100">
              <div>
                <h3 className="text-base font-black text-slate-900">{dashboardKpiTitle}</h3>
                <p className="text-[11px] text-slate-500 mt-0.5">{toWesternDigits(dashboardKpiEmployees.length)} {lang === 'ar' ? 'موظف' : 'employees'}</p>
              </div>
              <button type="button" onClick={() => setDashboardKpiDetails(null)} className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold">{lang === 'ar' ? 'إغلاق' : 'Close'}</button>
            </div>
            <div className="p-3 overflow-y-auto max-h-[62vh] space-y-2">
              {dashboardKpiEmployees.length > 0 ? dashboardKpiEmployees.map((employee) => (
                <div key={employee.id} className="flex items-center gap-3 p-2.5 rounded-xl border border-slate-100 bg-slate-50">
                  <UserAvatar employee={employee} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-sm text-slate-900 truncate">{lang === 'ar' ? employee.nameAr : employee.nameEn}</div>
                    <div className="text-[10px] text-slate-500 truncate">{employee.code}</div>
                  </div>
                </div>
              )) : (
                <div className="py-10 text-center text-sm text-slate-400">{lang === 'ar' ? 'لا يوجد موظفون في هذه الفئة اليوم' : 'No employees in this category today'}</div>
              )}
            </div>
          </div>
        </div>
      )}
`;

code = code.replace('      {/* Main Grid: Live Feed & Department Breakdown */}', modal + '      {/* Main Grid: Live Feed & Department Breakdown */}');
fs.writeFileSync(path, code, 'utf8');

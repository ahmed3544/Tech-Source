const fs = require('fs');

const typesPath = 'src/types.ts';
const schedulePath = 'src/components/WeeklyShiftSchedule.tsx';

let types = fs.readFileSync(typesPath, 'utf8');
if (!types.includes('isOffDay?: boolean;')) {
  types = types.replace(
    /export interface DailyShiftAssignment \{([\s\S]*?shiftId: string;)/,
    'export interface DailyShiftAssignment {$1\n  isOffDay?: boolean; // true when this employee has a scheduled weekly off day'
  );
  fs.writeFileSync(typesPath, types);
}

let code = fs.readFileSync(schedulePath, 'utf8');

if (!code.includes("const OFF_DAY_SHIFT_ID = '__OFF_DAY__';")) {
  code = code.replace(
    "const timeToMinutes = (value: string) => {",
    "const OFF_DAY_SHIFT_ID = '__OFF_DAY__';\n\nconst timeToMinutes = (value: string) => {"
  );
}

code = code.replace(
  "  const getValue = (date: string) => draft[date] ?? assignmentFor(employee?.id || '', date)?.shiftId ?? '';",
  "  const getValue = (date: string) => {\n    const assignment = assignmentFor(employee?.id || '', date);\n    if (assignment?.isOffDay) return OFF_DAY_SHIFT_ID;\n    return draft[date] ?? assignment?.shiftId ?? '';\n  };"
);

code = code.replace(
  "      const existing = assignmentFor(employee.id, day.key);\n      const shiftId = draftValue !== undefined ? draftValue : existing?.shiftId || '';\n      const existingIndex = next.findIndex(a => a.employeeId === employee.id && a.date === day.key);\n      if (!shiftId) {",
  "      const existing = assignmentFor(employee.id, day.key);\n      const isOffDay = draftValue !== undefined ? draftValue === OFF_DAY_SHIFT_ID : Boolean(existing?.isOffDay);\n      const shiftId = isOffDay ? '' : (draftValue !== undefined ? draftValue : existing?.shiftId || '');\n      const existingIndex = next.findIndex(a => a.employeeId === employee.id && a.date === day.key);\n      if (!shiftId && !isOffDay) {"
);

code = code.replace(
  "      const assignment: DailyShiftAssignment = { employeeId: employee.id, date: day.key, shiftId, assignedBy: currentUser?.id, updatedAt };",
  "      const assignment: DailyShiftAssignment = { employeeId: employee.id, date: day.key, shiftId, isOffDay, assignedBy: currentUser?.id, updatedAt };"
);

code = code.replace(
  "                  const selectedId = getValue(day.key);\n                  const selectedShift = shiftFor(employee.id, day.key);\n                  const timeline = selectedShift ? shiftTimeline(selectedShift) : null;\n                  const isWeekend = day.date.getDay() === 5 || day.date.getDay() === 6;",
  "                  const selectedId = getValue(day.key);\n                  const selectedAssignment = assignmentFor(employee.id, day.key);\n                  const selectedShift = shiftFor(employee.id, day.key);\n                  const isOffDay = selectedId === OFF_DAY_SHIFT_ID || Boolean(selectedAssignment?.isOffDay);\n                  const timeline = selectedShift && !isOffDay ? shiftTimeline(selectedShift) : null;\n                  const isWeekend = isOffDay || day.date.getDay() === 5 || day.date.getDay() === 6;"
);

const cardMarker = "                  return <div key={day.key} className={`min-w-0 overflow-hidden rounded-2xl border p-3 ${isWeekend ? 'bg-slate-50 border-slate-200' : 'bg-white border-slate-200'}`}>";
const cardReplacement = `${cardMarker}\n                    <div className="flex items-center justify-between gap-2 mb-3">\n                      <label className="inline-flex items-center gap-2 text-xs font-black text-slate-700 cursor-pointer select-none">\n                        <input\n                          type="checkbox"\n                          checked={isOffDay}\n                          disabled={!isLeader}\n                          onChange={(e) => setDraft(prev => ({ ...prev, [day.key]: e.target.checked ? OFF_DAY_SHIFT_ID : '' }))}\n                          className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"\n                        />\n                        {lang === 'ar' ? 'عطلة أسبوعية' : 'Off Day'}\n                      </label>\n                      {isOffDay && <span className="rounded-lg bg-slate-200 px-2 py-1 text-[10px] font-black text-slate-700">{lang === 'ar' ? 'عطلة أسبوعية' : 'Weekend'}</span>}\n                    </div>`;
if (!code.includes('className="h-4 w-4 rounded border-slate-300 text-emerald-600')) {
  code = code.replace(cardMarker, cardReplacement);
}

code = code.replace(
  /<select([^>]*?)value=\{selectedId\}/,
  '<select$1value={isOffDay ? \'\' : selectedId} disabled={!isLeader || isOffDay}'
);

fs.writeFileSync(schedulePath, code);
console.log('Weekend toggle applied to WeeklyShiftSchedule and DailyShiftAssignment.');

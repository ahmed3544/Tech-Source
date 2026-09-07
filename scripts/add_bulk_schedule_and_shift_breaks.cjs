const fs = require('fs');

const path = 'src/components/WeeklyShiftSchedule.tsx';
let s = fs.readFileSync(path, 'utf8');

if (!s.includes('selectedEmployeeIds')) {
  s = s.replace(
    "const [selectedEmployeeId, setSelectedEmployeeId] = useState(suppliedUser?.id || suppliedEmployees?.[0]?.id || '');",
    "const [selectedEmployeeId, setSelectedEmployeeId] = useState(suppliedUser?.id || suppliedEmployees?.[0]?.id || '');\n  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);"
  );
}

if (!s.includes('applyScheduleToSelectedEmployees')) {
  const marker = "  const saveWeek = async () => {";
  const helper = `  const applyScheduleToSelectedEmployees = async () => {
    if (!isLeader || selectedEmployeeIds.length === 0 || !days.length || !employee) return;
    setError(null);
    const updatedAt = new Date().toISOString();
    let next = [...assignments];

    for (const employeeId of selectedEmployeeIds) {
      for (const day of days) {
        const draftValue = Object.prototype.hasOwnProperty.call(draft, day.key) ? draft[day.key] : undefined;
        const source = assignmentFor(employee.id, day.key);
        const isOffDay = draftValue !== undefined ? draftValue === OFF_DAY_SHIFT_ID : Boolean(source?.isOffDay);
        const shiftId = isOffDay ? '' : (draftValue !== undefined ? draftValue : source?.shiftId || '');
        const index = next.findIndex(a => a.employeeId === employeeId && a.date === day.key);

        if (!shiftId && !isOffDay) {
          if (index >= 0) next.splice(index, 1);
          continue;
        }

        const assignment: DailyShiftAssignment = {
          employeeId,
          date: day.key,
          shiftId,
          isOffDay,
          assignedBy: currentUser?.id,
          updatedAt,
        };

        if (index >= 0) next[index] = assignment;
        else next.push(assignment);
      }
    }

    setAssignments(next);
    localStorage.setItem('daily_shift_assignments', JSON.stringify(next));

    try {
      const response = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dailyShiftAssignments: next }),
      });
      if (!response.ok) throw new Error('sync failed');
      for (const employeeId of selectedEmployeeIds) {
        for (const day of days) {
          const assignment = next.find(a => a.employeeId === employeeId && a.date === day.key);
          if (assignment) onSaveDailyShift?.(assignment);
        }
      }
      setSavedAt(new Date().toLocaleTimeString(lang === 'ar' ? 'ar-EG' : 'en-US', { hour: '2-digit', minute: '2-digit' }));
      setSelectedEmployeeIds([]);
    } catch (err) {
      console.error('Failed to bulk save weekly shifts', err);
      setError(lang === 'ar' ? 'تم الحفظ على الجهاز، لكن تعذر المزامنة مع السيرفر.' : 'Saved locally, but server sync failed.');
    }
  };

`;
  if (!s.includes(marker)) throw new Error('saveWeek marker not found');
  s = s.replace(marker, helper + marker);
}

if (!s.includes('Apply Schedule to Multiple Employees')) {
  const employeeSelectMarker = "          {isLeader && <label className=\"text-xs font-black text-slate-700 block max-w-xl\">";
  const markerIndex = s.indexOf(employeeSelectMarker);
  if (markerIndex === -1) throw new Error('employee selector marker not found');

  const selectEnd = s.indexOf('</label>}', markerIndex);
  if (selectEnd === -1) throw new Error('employee selector end not found');
  const selectEndIndex = selectEnd + '</label>}'.length;
  const employeeSelect = s.slice(markerIndex, selectEndIndex);

  const bulkUi = String.raw`\n\n          {isLeader && (\n            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-3 sm:p-4 space-y-3">\n              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">\n                <div>\n                  <div className="text-xs font-black text-slate-900">{lang === 'ar' ? 'تطبيق الجدول على عدة موظفين' : 'Apply Schedule to Multiple Employees'}</div>\n                  <div className="text-[10px] text-slate-500 mt-1">{lang === 'ar' ? 'حدد الموظفين ثم سيتم نسخ نفس جدول الأسبوع، بما في ذلك أيام الـ Off Day وربط كل يوم بالشفت المختار وبريكاته.' : 'Select employees to copy the same weekly schedule, including Off Days and each assigned shift with its own breaks.'}</div>\n                </div>\n                <div className="flex gap-2">\n                  <button type="button" onClick={() => setSelectedEmployeeIds(visibleEmployees.map(e => e.id))} className="px-3 py-2 rounded-lg bg-white border border-slate-200 text-[10px] font-black">{lang === 'ar' ? 'تحديد الكل' : 'Select All'}</button>\n                  <button type="button" onClick={() => setSelectedEmployeeIds([])} className="px-3 py-2 rounded-lg bg-white border border-slate-200 text-[10px] font-black">{lang === 'ar' ? 'إلغاء' : 'Clear'}</button>\n                </div>\n              </div>\n              <div className="text-[10px] font-bold text-emerald-700">{lang === 'ar' ? `المحدد: ${selectedEmployeeIds.length}` : 'Selected: ' + selectedEmployeeIds.length}</div>\n              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1">\n                {visibleEmployees.map(e => (\n                  <label key={e.id} className="flex items-center gap-2 rounded-xl bg-white border border-slate-200 px-3 py-2 cursor-pointer">\n                    <input type="checkbox" checked={selectedEmployeeIds.includes(e.id)} onChange={ev => setSelectedEmployeeIds(prev => ev.target.checked ? [...new Set([...prev, e.id])] : prev.filter(id => id !== e.id))} className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />\n                    <span className="text-xs font-bold text-slate-800 truncate">{e.code} - {lang === 'ar' ? e.nameAr : e.nameEn}</span>\n                  </label>\n                ))}\n              </div>\n              <button type="button" disabled={!selectedEmployeeIds.length || !employee} onClick={applyScheduleToSelectedEmployees} className="w-full min-h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-black">{lang === 'ar' ? `تطبيق الجدول على ${selectedEmployeeIds.length} موظف` : 'Apply Schedule to ' + selectedEmployeeIds.length + ' Selected Employees'}</button>\n            </div>\n          )}`;

  s = s.slice(0, selectEndIndex) + bulkUi.replace(/\\n/g, '\n') + s.slice(selectEndIndex);
}

fs.writeFileSync(path, s);
console.log('Bulk schedule patch applied');

const fs = require('fs');

const file = 'src/components/WeeklyShiftSchedule.tsx';
let code = fs.readFileSync(file, 'utf8');
const marker = '/* WEEKLY_SCHEDULE_PERSISTENCE_V3 */';
if (code.includes(marker)) process.exit(0);

const replacements = [
  [
    `    if (suppliedEmployees) setEmployees(suppliedEmployees);\n    if (suppliedShifts) setShifts(suppliedShifts);\n    if (suppliedAssignments) setAssignments(suppliedAssignments);`,
    `    // Never let an empty parent snapshot wipe data already loaded from the server.\n    if (Array.isArray(suppliedEmployees) && suppliedEmployees.length) setEmployees(suppliedEmployees);\n    if (Array.isArray(suppliedShifts) && suppliedShifts.length) setShifts(suppliedShifts);\n    if (Array.isArray(suppliedAssignments) && suppliedAssignments.length) setAssignments(suppliedAssignments);`
  ],
  [
    `        if ((!suppliedEmployees?.length || !suppliedShifts?.length) && !cancelled) {`,
    `        // The server is the source of truth. Refresh the schedule every time this screen mounts.\n        if (!cancelled) {`
  ],
  [
    `    return baseShift ? OFF_DAY_SHIFT_ID : '';`,
    `    // Do not invent OFF when the server has no assignment for this date.\n    return '';`
  ],
  [
    `    const result = await persistAssignments(next);`,
    `    const weekKeys = new Set(days.map(day => day.key));\n    const changedWeekRows = next.filter(item => weekKeys.has(String(item.date)));\n    const result = await persistAssignments(changedWeekRows);`
  ],
  [
    `      try { let next = [...assignments]; for (const id of selectedEmployeeIds) next = buildWeekForEmployee(id,employee.id,next,updatedAt); await persistAssignments(next);`,
    `      try { let next = [...assignments]; for (const id of selectedEmployeeIds) next = buildWeekForEmployee(id,employee.id,next,updatedAt); const weekKeys = new Set(days.map(day => day.key)); const changedWeekRows = next.filter(item => weekKeys.has(String(item.date)) && selectedEmployeeIds.includes(String(item.employeeId))); await persistAssignments(changedWeekRows);`
  ]
];

for (const [oldText, newText] of replacements) {
  if (code.includes(oldText)) code = code.replace(oldText, newText);
}

const persistStart = code.indexOf('  const persistAssignments = async (next: DailyShiftAssignment[]) => {');
const persistEnd = code.indexOf('\n\n  const buildWeekForEmployee', persistStart);
if (persistStart < 0 || persistEnd < 0) throw new Error('persistAssignments boundaries not found');

const persistFn = `  const persistAssignments = async (next: DailyShiftAssignment[]) => {
    const clean = next.map(item => {
      const employeeId = String(item.employeeId ?? (item as any).employee_id ?? '').trim();
      const date = String(item.date ?? '').slice(0, 10);
      const rawShift = String(item.shiftId ?? (item as any).shift_id ?? '').trim();
      const isOffDay = rawShift ? false : (asBoolean(item.isOffDay ?? (item as any).is_off_day) || String((item as any).status || '').toUpperCase() === 'OFF');
      return { employee_id: employeeId, date, is_off_day: isOffDay, shift_id: isOffDay ? null : (rawShift || null) };
    }).filter(item => item.employee_id && /^\\d{4}-\\d{2}-\\d{2}$/.test(item.date) && (item.is_off_day || item.shift_id));

    if (!clean.length) throw new Error('No valid schedule rows to save');
    const syncTimestamp = new Date().toISOString();
    const syncRevision = syncTimestamp + '-' + Math.random().toString(36).slice(2, 10);
    const response = await fetch('/api/schedule-sync', {
      method:'POST', credentials:'include', cache:'no-store',
      headers:{'Content-Type':'application/json','Accept':'application/json','Cache-Control':'no-cache','Pragma':'no-cache','X-Sync-Timestamp':syncTimestamp,'X-Sync-Revision':syncRevision},
      body:JSON.stringify({dailyShiftAssignments:clean,syncTimestamp,syncRevision})
    });
    const text = await response.text();
    let data:any = {}; try { data = text ? JSON.parse(text) : {}; } catch {}
    if (!response.ok || data?.success === false) throw new Error('Server error ' + response.status + ': ' + (data?.message || data?.error || text || 'Sync failed'));

    const serverAssignments = Array.isArray(data?.dailyShiftAssignments) ? data.dailyShiftAssignments : [];
    const finalAssignments = serverAssignments.map((item:any) => {
      const shiftId = String(item.shiftId ?? item.shift_id ?? '').trim();
      const isOffDay = shiftId ? false : (asBoolean(item.isOffDay ?? item.is_off_day) || String(item.status ?? '').toUpperCase() === 'OFF');
      return { ...item, employeeId:String(item.employeeId ?? item.employee_id ?? '').trim(), date:String(item.date ?? '').slice(0,10), shiftId, isOffDay };
    }).filter((item:any) => item.employeeId && /^\\d{4}-\\d{2}-\\d{2}$/.test(item.date));

    if (!finalAssignments.length) throw new Error('Server returned an empty schedule after save');
    setAssignments(finalAssignments as DailyShiftAssignment[]);
    try { localStorage.setItem('daily_shift_assignments', JSON.stringify(finalAssignments)); } catch {}
    return { assignments: finalAssignments };
  };`;

code = code.slice(0, persistStart) + persistFn + code.slice(persistEnd);
code = code.replace('export const WeeklyShiftSchedule', `${marker}\n\nexport const WeeklyShiftSchedule`);
fs.writeFileSync(file, code, 'utf8');
console.log('Weekly schedule persistence v3 applied');

const fs = require('fs');
const path = require('path');
const file = path.join(process.cwd(), 'src/components/WeeklyShiftSchedule.tsx');
let code = fs.readFileSync(file, 'utf8');

code = code.replaceAll('bg-emerald-500', 'bg-green-600');
code = code.replaceAll('ring-emerald-700/20', 'ring-green-800/30');

// IMPORTANT: Boolean('false') is true in JavaScript. Normalize persisted OFF flags safely.
if (!code.includes('const asBoolean = (value: unknown)')) {
  code = code.replace(
    'const HOUR_HEIGHT = 64;',
    `const HOUR_HEIGHT = 64;\n\nconst asBoolean = (value: unknown) => {\n  if (typeof value === 'boolean') return value;\n  if (typeof value === 'number') return value !== 0;\n  const normalized = String(value ?? '').trim().toLowerCase();\n  return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'off';\n};`
  );
}

// Draft must win first; then a real shiftId must always win over OFF.
code = code.replace(
  "    const assignment = assignmentFor(employee?.id || '', date);\n    if (assignment?.isOffDay) return OFF_DAY_SHIFT_ID;\n    if (draft[date] !== undefined) return draft[date];\n    if (assignment?.shiftId) return assignment.shiftId;",
  "    const assignment = assignmentFor(employee?.id || '', date);\n    if (draft[date] !== undefined) return draft[date];\n    const shiftId = String(assignment?.shiftId ?? (assignment as any)?.shift_id ?? '').trim();\n    if (shiftId) return shiftId;\n    if (asBoolean(assignment?.isOffDay ?? (assignment as any)?.is_off_day) || String((assignment as any)?.status ?? '').toUpperCase() === 'OFF') return OFF_DAY_SHIFT_ID;"
);

code = code.replace(
  "    const assignment = assignmentFor(employeeId,date);\n    if (assignment?.isOffDay) return undefined;\n    if (assignment?.shiftId) return shifts.find(s => s.id === assignment.shiftId);",
  "    const assignment = assignmentFor(employeeId,date);\n    const shiftId = String(assignment?.shiftId ?? (assignment as any)?.shift_id ?? '').trim();\n    if (shiftId) return shifts.find(s => s.id === shiftId);\n    if (asBoolean(assignment?.isOffDay ?? (assignment as any)?.is_off_day)) return undefined;"
);

// Selecting a shift clears OFF. Selecting OFF explicitly clears the shift.
code = code.replace(
  "onChange={e=>setDraft(prev=>({...prev,[day.key]:e.target.value}))}",
  "onChange={e=>setDraft(prev=>({...prev,[day.key]:e.target.value ? e.target.value : OFF_DAY_SHIFT_ID}))}"
);

// Fix the grid border class when this old literal exists.
code = code.replace(
  'className="absolute left-0 right-0 border-b ${isWeekend||off?\'border-slate-300\':\'border-slate-200\'}"',
  'className={`absolute left-0 right-0 border-b ${isWeekend||off?\'border-slate-300\':\'border-slate-200\'}`}'
);

// Never use Boolean() for persisted OFF fields.
code = code.replace(
  'const isOffDay = rawShift ? false : Boolean(item.isOffDay || (item as any).is_off_day || String((item as any).status || \'\').toUpperCase() === \'OFF\');',
  'const isOffDay = rawShift ? false : (asBoolean(item.isOffDay ?? (item as any).is_off_day) || String((item as any).status || \'\').toUpperCase() === \'OFF\');'
);

code = code.replace(
  'isOffDay: String(item.shiftId ?? item.shift_id ?? \'\').trim() ? false : Boolean(item.isOffDay ?? item.is_off_day),',
  'isOffDay: String(item.shiftId ?? item.shift_id ?? \'\').trim() ? false : (asBoolean(item.isOffDay ?? item.is_off_day) || String(item.status ?? \'\').toUpperCase() === \'OFF\'),'
);

// The existing build function can also read a string "false" as true. Replace it with
// explicit precedence: draft -> shiftId -> OFF -> base shift.
code = code.replace(
  `      const isOffDay = draftValue !== undefined ? draftValue === OFF_DAY_SHIFT_ID : source ? Boolean(source.isOffDay) : !works;\n      const shiftId = isOffDay ? '' : (draftValue !== undefined ? draftValue : source?.shiftId || baseShift?.id || '');`,
  `      const sourceShiftId = String(source?.shiftId ?? (source as any)?.shift_id ?? '').trim();\n      const sourceOff = asBoolean(source?.isOffDay ?? (source as any)?.is_off_day) || String((source as any)?.status ?? '').toUpperCase() === 'OFF';\n      let shiftId = '';\n      let isOffDay = false;\n      if (draftValue !== undefined) {\n        shiftId = draftValue === OFF_DAY_SHIFT_ID ? '' : String(draftValue || '').trim();\n        isOffDay = draftValue === OFF_DAY_SHIFT_ID;\n      } else if (sourceShiftId) {\n        shiftId = sourceShiftId;\n        isOffDay = false;\n      } else if (sourceOff) {\n        shiftId = '';\n        isOffDay = true;\n      } else {\n        shiftId = baseShift?.id || '';\n        isOffDay = !shiftId && !works;\n      }`
);

const marker = '/* WEEKLY_SCHEDULE_DIRECT_SYNC_V1 */';
if (!code.includes(marker)) {
  const start = code.indexOf('    const syncTimestamp = new Date().toISOString();');
  const end = code.indexOf("\n  const buildWeekForEmployee", start);
  if (start < 0 || end < 0) throw new Error('weekly schedule persistAssignments target not found');
  const replacement = `${marker}\n    const syncTimestamp = new Date().toISOString();\n    const syncRevision = \`${'${syncTimestamp}'}-${'${Math.random().toString(36).slice(2, 10)}'}\`;\n    const payload = { dailyShiftAssignments: clean, syncTimestamp, syncRevision };\n    const response = await fetch(\`/api/schedule-sync?_=${'${Date.now()}'}\`, {\n      method: 'POST', credentials: 'include', cache: 'no-store',\n      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'Cache-Control': 'no-cache', Pragma: 'no-cache', 'X-Sync-Timestamp': syncTimestamp, 'X-Sync-Revision': syncRevision },\n      body: JSON.stringify(payload),\n    });\n    const responseText = await response.text();\n    let responseData = {}; try { responseData = responseText ? JSON.parse(responseText) : {}; } catch {}\n    if (!response.ok || responseData?.success === false) {\n      const serverError = responseData?.message || responseData?.error || responseData?.code || responseText || \`HTTP ${'${response.status}'}\`;\n      throw new Error(\`Server error ${'${response.status}'}: ${'${serverError}'}\`);\n    }\n    const serverAssignments = Array.isArray(responseData?.dailyShiftAssignments) ? responseData.dailyShiftAssignments : [];\n    const canonicalAssignments = serverAssignments.map((item:any) => {\n      const shiftId = String(item.shiftId ?? item.shift_id ?? '').trim();\n      const isOffDay = shiftId ? false : (asBoolean(item.isOffDay ?? item.is_off_day) || String(item.status ?? '').toUpperCase() === 'OFF');\n      return { ...item, employeeId: String(item.employeeId ?? item.employee_id ?? ''), date: String(item.date ?? item.scheduleDate ?? '').slice(0,10), shiftId, isOffDay, is_off: isOffDay, assignedBy: item.assignedBy ?? item.assigned_by, updatedAt: item.updatedAt ?? item.updated_at };\n    });\n    const finalAssignments = canonicalAssignments.length ? canonicalAssignments : clean.map((item:any) => ({ employeeId:item.employee_id, date:item.date, shiftId:item.shift_id || '', isOffDay:item.is_off_day }));\n    setAssignments(finalAssignments as DailyShiftAssignment[]);\n    localStorage.setItem('daily_shift_assignments', JSON.stringify(finalAssignments));\n    return { success: true, assignments: finalAssignments, response: responseData };\n  };\n`;
  code = code.slice(0, start) + replacement + code.slice(end);
}

// Full-day 24-hour timeline: midnight through 24:00, using 24-hour labels.
code = code.replace('const CALENDAR_START = 6;', 'const CALENDAR_START = 0;');
code = code.replace('const CALENDAR_END = 22;', 'const CALENDAR_END = 24;');
code = code.replace(
  "const formatHour = (hour: number, ar: boolean) => { const suffix = hour >= 12 ? 'PM' : 'AM'; const display = hour % 12 || 12; return ar ? `${String(display).padStart(2,'0')}:00 ${hour >= 12 ? 'م' : 'ص'}` : `${String(display).padStart(2,'0')}:00 ${suffix}`; };",
  "const formatHour = (hour: number, _ar: boolean) => `${String(hour).padStart(2, '0')}:00`;"
);

fs.writeFileSync(file, code);
console.log('[patch_weekly_schedule_direct_sync_v1] applied schedule state normalization + 24h timeline');

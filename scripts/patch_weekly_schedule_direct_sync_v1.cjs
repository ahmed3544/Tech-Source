const fs = require('fs');
const path = require('path');
const file = path.join(process.cwd(), 'src/components/WeeklyShiftSchedule.tsx');
let code = fs.readFileSync(file, 'utf8');

// Keep the visual style deterministic even when earlier schedule patches rewrite the component.
code = code.replaceAll('bg-emerald-500', 'bg-green-600');
code = code.replaceAll('ring-emerald-700/20', 'ring-green-800/30');

// A selected shift is authoritative over stale OFF state. Draft selection must be read first
// so the UI immediately switches from OFF to the selected shift before saving.
code = code.replace(
  "    const assignment = assignmentFor(employee?.id || '', date);\n    if (assignment?.isOffDay) return OFF_DAY_SHIFT_ID;\n    if (draft[date] !== undefined) return draft[date];\n    if (assignment?.shiftId) return assignment.shiftId;",
  "    const assignment = assignmentFor(employee?.id || '', date);\n    if (draft[date] !== undefined) return draft[date];\n    if (assignment?.shiftId) return assignment.shiftId;\n    if (assignment?.isOffDay) return OFF_DAY_SHIFT_ID;"
);

code = code.replace(
  "    const assignment = assignmentFor(employeeId,date);\n    if (assignment?.isOffDay) return undefined;\n    if (assignment?.shiftId) return shifts.find(s => s.id === assignment.shiftId);",
  "    const assignment = assignmentFor(employeeId,date);\n    if (assignment?.shiftId) return shifts.find(s => s.id === assignment.shiftId);\n    if (assignment?.isOffDay) return undefined;"
);

// Selecting a shift clears OFF immediately. Selecting OFF clears the shift.
code = code.replace(
  "onChange={e=>setDraft(prev=>({...prev,[day.key]:e.target.value}))}",
  "onChange={e=>setDraft(prev=>({...prev,[day.key]:e.target.value ? e.target.value : OFF_DAY_SHIFT_ID}))}"
);

// Fix the grid border class: the previous literal ${...} was not evaluated by JSX.
code = code.replace(
  'className=\"absolute left-0 right-0 border-b ${isWeekend||off?\'border-slate-300\':\'border-slate-200\'}\"',
  'className={`absolute left-0 right-0 border-b ${isWeekend||off?\'border-slate-300\':\'border-slate-200\'}`} '
);

// Server response normalization: shiftId always wins over stale isOffDay.
code = code.replace(
  "        isOffDay: Boolean(item.isOffDay ?? item.is_off_day),",
  "        isOffDay: String(item.shiftId ?? item.shift_id ?? '').trim() ? false : Boolean(item.isOffDay ?? item.is_off_day),"
);

const marker = '/* WEEKLY_SCHEDULE_DIRECT_SYNC_V1 */';
if (code.includes(marker)) {
  fs.writeFileSync(file, code);
  process.exit(0);
}
const start = code.indexOf('    const syncTimestamp = new Date().toISOString();');
const end = code.indexOf("\n  const buildWeekForEmployee", start);
if (start < 0 || end < 0) throw new Error('weekly schedule persistAssignments target not found');
const replacement = `${marker}\n    const syncTimestamp = new Date().toISOString();\n    const syncRevision = \`${'${syncTimestamp}'}-${'${Math.random().toString(36).slice(2, 10)}'}\`;\n    const payload = { dailyShiftAssignments: clean, syncTimestamp, syncRevision };\n    console.log('[Schedule Save] POST /api/schedule-sync payload:', JSON.stringify(payload, null, 2));\n\n    try {\n      const response = await fetch(\`/api/schedule-sync?_=${'${Date.now()}'}\`, {\n        method: 'POST',\n        credentials: 'include',\n        cache: 'no-store',\n        headers: {\n          'Content-Type': 'application/json',\n          Accept: 'application/json',\n          'Cache-Control': 'no-cache',\n          Pragma: 'no-cache',\n          'X-Sync-Timestamp': syncTimestamp,\n          'X-Sync-Revision': syncRevision,\n        },\n        body: JSON.stringify(payload),\n      });\n\n      const responseText = await response.text();\n      let responseData = {};\n      try { responseData = responseText ? JSON.parse(responseText) : {}; } catch {}\n      console.log('[Schedule Save] /api/schedule-sync:', response.status, responseData);\n\n      if (!response.ok || responseData?.success === false) {\n        const serverError = responseData?.message || responseData?.error || responseData?.code || responseText || \`HTTP ${'${response.status}'}\`;\n        throw new Error(\`Server error ${'${response.status}'}: ${'${serverError}'}\`);\n      }\n\n      const serverAssignments = Array.isArray(responseData?.dailyShiftAssignments) ? responseData.dailyShiftAssignments : [];\n      const canonicalAssignments = serverAssignments.map((item) => ({\n        ...item,\n        employeeId: String(item.employeeId ?? item.employee_id ?? ''),\n        date: String(item.date ?? item.scheduleDate ?? '').slice(0, 10),\n        shiftId: item.shiftId ?? item.shift_id ?? '',\n        isOffDay: String(item.shiftId ?? item.shift_id ?? '').trim() ? false : Boolean(item.isOffDay ?? item.is_off_day),\n        assignedBy: item.assignedBy ?? item.assigned_by,\n        updatedAt: item.updatedAt ?? item.updated_at,\n      }));\n      setAssignments(canonicalAssignments);\n      localStorage.setItem('daily_shift_assignments', JSON.stringify(canonicalAssignments));\n      console.log('[Schedule Save] AUTHORITATIVE SERVER SAVE SUCCESS:', canonicalAssignments);\n      return { success: true, assignments: canonicalAssignments, response: responseData };\n    } catch (error) {\n      console.error('[Schedule Save] DIRECT SYNC FAILED:', error);\n      throw error;\n    }\n  };\n`;
code = code.slice(0, start) + replacement + code.slice(end);
fs.writeFileSync(file, code);
console.log('[patch_weekly_schedule_direct_sync_v1] applied');

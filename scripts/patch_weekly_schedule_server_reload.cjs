const fs = require('fs');

const file = 'src/components/WeeklyShiftSchedule.tsx';
const marker = '/* WEEKLY_SCHEDULE_SERVER_RELOAD_V1 */';
let code = fs.readFileSync(file, 'utf8');

if (!code.includes(marker)) {
  const oldBlock = "        if ((!suppliedEmployees?.length || !suppliedShifts?.length) && !cancelled) {\n          setLoading(true);";
  const newBlock = `        ${marker}\n        // Always refresh the schedule from the server when this screen mounts.\n        // App.tsx may already supply employees/shifts/assignments, but those props\n        // can be an older in-memory snapshot after closing and reopening the table.\n        if (!cancelled) {\n          setLoading(true);`;

  if (!code.includes(oldBlock)) {
    throw new Error('Weekly schedule server reload target block was not found.');
  }

  code = code.replace(oldBlock, newBlock);

  const oldAssignments = "              if (Array.isArray(data.dailyShiftAssignments)) setAssignments(data.dailyShiftAssignments);";
  const newAssignments = "              if (Array.isArray(data.dailyShiftAssignments)) {\n                const freshAssignments = data.dailyShiftAssignments as DailyShiftAssignment[];\n                setAssignments(freshAssignments);\n                try { localStorage.setItem('daily_shift_assignments', JSON.stringify(freshAssignments)); } catch {}\n              }";

  if (!code.includes(oldAssignments)) {
    throw new Error('Weekly schedule assignment hydration target was not found.');
  }

  code = code.replace(oldAssignments, newAssignments);
  fs.writeFileSync(file, code, 'utf8');
  console.log('[weekly-schedule-reload] Applied server-authoritative reload patch.');
} else {
  console.log('[weekly-schedule-reload] Patch already applied.');
}

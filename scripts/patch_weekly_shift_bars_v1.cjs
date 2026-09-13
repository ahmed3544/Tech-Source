const fs = require('fs');
const path = 'src/components/WeeklyShiftSchedule.tsx';
let s = fs.readFileSync(path, 'utf8');

if (!s.includes('const normalizeWeeklyShift =')) {
  const marker = "const asBoolean = (value: unknown) => {";
  const idx = s.indexOf(marker);
  if (idx < 0) throw new Error('WeeklyShiftSchedule asBoolean marker not found');
  const insert = `const normalizeWeeklyShift = (raw: any): Shift => ({\n  ...raw,\n  id: String(raw?.id ?? raw?.shift_id ?? raw?.shiftId ?? ''),\n  nameAr: String(raw?.nameAr ?? raw?.name_ar ?? raw?.name ?? 'الوردية'),\n  nameEn: String(raw?.nameEn ?? raw?.name_en ?? raw?.name ?? 'Shift'),\n  startTime: String(raw?.startTime ?? raw?.start_time ?? '09:00').slice(0,5),\n  endTime: String(raw?.endTime ?? raw?.end_time ?? '17:00').slice(0,5),\n  workDays: Array.isArray(raw?.workDays) ? raw.workDays : (Array.isArray(raw?.work_days) ? raw.work_days : [0,1,2,3,4]),\n  breaks: Array.isArray(raw?.breaks) ? raw.breaks : [],\n});\nconst normalizeWeeklyShifts = (items: any[]) => (Array.isArray(items) ? items : []).map(normalizeWeeklyShift).filter((shift: Shift) => shift.id);\n\n`;
  s = s.slice(0, idx) + insert + s.slice(idx);
}

s = s.replace('if (suppliedShifts) setShifts(suppliedShifts);', 'if (suppliedShifts) setShifts(normalizeWeeklyShifts(suppliedShifts));');
s = s.replace('if (Array.isArray(data.shifts)) setShifts(data.shifts);', 'if (Array.isArray(data.shifts)) setShifts(normalizeWeeklyShifts(data.shifts));');

s = s.replace(/shifts\.find\(s => s\.id === employee\.shiftId\)/g, 'shifts.find(s => String(s.id) === String(employee.shiftId))');
s = s.replace(/shifts\.find\(s => s\.id === sourceEmployee\.shiftId\)/g, 'shifts.find(s => String(s.id) === String(sourceEmployee.shiftId))');
s = s.replace(/shifts\.find\(s => s\.id === shiftId\)/g, 'shifts.find(s => String(s.id) === String(shiftId))');
s = s.replace(/shifts\.find\(s => s\.id === value\)/g, 'shifts.find(s => String(s.id) === String(value))');

fs.writeFileSync(path, s);
console.log('[patch_weekly_shift_bars_v1] applied');

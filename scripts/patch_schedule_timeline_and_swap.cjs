const fs = require('fs');

const schedulePath = 'src/components/WeeklyShiftSchedule.tsx';
if (!fs.existsSync(schedulePath)) process.exit(0);

let code = fs.readFileSync(schedulePath, 'utf8');

// Restore the shift-swap panel inside the normal schedule section.
if (!code.includes("./ShiftSwapPanel")) {
  const importMarker = "import { Employee, Language, Shift, DailyShiftAssignment } from '../types';";
  if (code.includes(importMarker)) {
    code = code.replace(importMarker, `${importMarker}\nimport { ShiftSwapPanel } from './ShiftSwapPanel';`);
  }
}

if (!code.includes('/* AGENT SHIFT SWAP TOP */')) {
  const marker = '      {isLeader && <div className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_auto] md:items-end">';
  if (code.includes(marker) && code.includes('ShiftSwapPanel')) {
    const panel = `      {/* AGENT SHIFT SWAP TOP */}\n      <ShiftSwapPanel employees={employees} shifts={shifts} assignments={assignments} currentUser={currentUser} lang={lang} />\n\n`;
    code = code.replace(marker, panel + marker);
  }
}

// Add reusable timeline helpers once.
if (!code.includes('const timeToMinutes =')) {
  const marker = "const shiftIdOf = (a: any) => String(a?.shiftId ?? a?.shift_id ?? '').trim();";
  const helpers = `${marker}\n\nconst timeToMinutes = (value: string) => {\n  const m = String(value || '').match(/^(\\d{1,2}):(\\d{2})/);\n  if (!m) return 0;\n  return Math.max(0, Math.min(1440, Number(m[1]) * 60 + Number(m[2])));\n};\nconst timelinePercent = (minutes: number) => Math.max(0, Math.min(100, (minutes / 1440) * 100));\nconst breakWindows = (shift: any, start: number, end: number) => {\n  const explicit = Array.isArray(shift?.breaks) ? shift.breaks : [];\n  const windows = explicit.map((b: any) => {\n    const bs = timeToMinutes(b?.startTime ?? b?.start ?? b?.from);\n    const be = timeToMinutes(b?.endTime ?? b?.end ?? b?.to);\n    return be > bs ? { start: bs, end: be } : null;\n  }).filter(Boolean);\n  if (windows.length) return windows;\n  const minutes = Number(shift?.breakMinutes || 0);\n  if (minutes <= 0 || end <= start) return [];\n  const midpoint = start + (end - start) / 2;\n  return [{ start: Math.max(start, midpoint - minutes / 2), end: Math.min(end, midpoint + minutes / 2) }];\n};`;
  code = code.replace(marker, helpers);
}

// Insert a compact 24-hour timeline below the weekly grid.
if (!code.includes('/* WORK BREAK TIMELINE */')) {
  const marker = '        <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold text-slate-500">';
  if (code.includes(marker)) {
    // Escape ${...} below so this CommonJS template literal emits React expressions literally.
    const timeline = `        {/* WORK BREAK TIMELINE */}\n        <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-3">\n          <div className="flex flex-wrap items-center justify-between gap-2">\n            <div className="text-xs font-black text-slate-800">{lang === 'ar' ? 'خط وقت العمل والبريك' : 'Work & Break Timeline'}</div>\n            <div className="flex items-center gap-3 text-[10px] font-bold text-slate-500">\n              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-8 rounded-full bg-emerald-500" />{lang === 'ar' ? 'وقت العمل' : 'Work time'}</span>\n              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-8 rounded-full bg-red-500" />{lang === 'ar' ? 'البريك' : 'Break'}</span>\n            </div>\n          </div>\n          <div className="space-y-2">\n            {days.map(day => {\n              const value = valueFor(day.key);\n              const shift = value !== OFF && value !== EMPTY ? shiftById(value) : undefined;\n              if (!shift) return <div key={day.key} className="grid grid-cols-[82px_minmax(240px,1fr)] items-center gap-2"><div className="text-[10px] font-black text-slate-500">{lang === 'ar' ? day.ar : day.en}</div><div className="h-7 rounded-lg border border-dashed border-slate-200 bg-slate-50" /></div>;\n              const start = timeToMinutes(shift.startTime);\n              let end = timeToMinutes(shift.endTime);\n              if (end <= start) end += 1440;\n              const visibleEnd = Math.min(1440, end);\n              const workLeft = timelinePercent(start);\n              const workWidth = Math.max(0, timelinePercent(visibleEnd) - workLeft);\n              const breaks = breakWindows(shift, start, visibleEnd);\n              return <div key={day.key} className="grid grid-cols-[82px_minmax(240px,1fr)] items-center gap-2">\n                <div className="text-[10px] font-black text-slate-600">{lang === 'ar' ? day.ar : day.en}</div>\n                <div className="relative h-7 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">\n                  <div className="absolute inset-y-1.5 rounded-full bg-emerald-500" style={{ left: `\${workLeft}%`, width: `\${workWidth}%` }} title={`\${shift.startTime} - \${shift.endTime}`} />\n                  {breaks.map((b: any, index: number) => { const left = timelinePercent(b.start); const width = Math.max(0, timelinePercent(b.end) - left); return <div key={index} className="absolute inset-y-1.5 rounded-full bg-red-500" style={{ left: `\${left}%`, width: `\${width}%` }} title={lang === 'ar' ? 'بريك' : 'Break'} />; })}\n                </div>\n              </div>;\n            })}\n          </div>\n          <div className="grid grid-cols-[82px_minmax(240px,1fr)] gap-2 text-[9px] font-mono text-slate-400"><div /> <div className="flex justify-between"><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>24:00</span></div></div>\n        </div>\n`;
    code = code.replace(marker, timeline + marker);
  }
}

fs.writeFileSync(schedulePath, code);
console.log('[patch_schedule_timeline_and_swap] applied');

const fs = require('fs');
const file = 'src/components/WeeklyShiftSchedule.tsx';
let code = fs.readFileSync(file, 'utf8');

const replacements = [
  [`    if (suppliedEmployees) setEmployees(suppliedEmployees);\n    if (suppliedShifts) setShifts(suppliedShifts);\n    if (suppliedAssignments) setAssignments(suppliedAssignments);`, `    if (Array.isArray(suppliedEmployees) && suppliedEmployees.length) setEmployees(suppliedEmployees);\n    if (Array.isArray(suppliedShifts) && suppliedShifts.length) setShifts(suppliedShifts);\n    if (Array.isArray(suppliedAssignments) && suppliedAssignments.length) setAssignments(suppliedAssignments);`],
  [`        if ((!suppliedEmployees?.length || !suppliedShifts?.length) && !cancelled) {`, `        if (!cancelled) {`],
  [`    return baseShift ? OFF_DAY_SHIFT_ID : '';`, `    return '';`],
  [`      } else {\n        shiftId = '';\n        isOffDay = true;\n      }\n      const index = next.findIndex`, `      } else {\n        shiftId = '';\n        isOffDay = false;\n      }\n      const index = next.findIndex`],
];
for (const [oldText,newText] of replacements) if(code.includes(oldText)) code=code.replace(oldText,newText);

const persistStart=code.indexOf('  const persistAssignments = async (next: DailyShiftAssignment[]) => {');
const persistEnd=code.indexOf('\n\n  const buildWeekForEmployee',persistStart);
if(persistStart<0||persistEnd<0) throw new Error('persistAssignments boundaries not found');
const persistFn=`  const persistAssignments = async (next: DailyShiftAssignment[]) => {\n    const clean = next.map(item => {\n      const employeeId = String(item.employeeId ?? (item as any).employee_id ?? '').trim();\n      const date = String(item.date ?? '').slice(0,10);\n      const rawShift = String(item.shiftId ?? (item as any).shift_id ?? '').trim();\n      const isOffDay = rawShift ? false : (Boolean(item.isOffDay ?? (item as any).is_off_day) || String((item as any).status || '').toUpperCase() === 'OFF');\n      const clear = !rawShift && !isOffDay;\n      return { employee_id:employeeId, date, is_off_day:isOffDay, shift_id:rawShift || null, clear };\n    }).filter(item => item.employee_id && /^\\d{4}-\\d{2}-\\d{2}$/.test(item.date));\n    if (!clean.length) throw new Error('No valid schedule rows to save');\n    const syncTimestamp=new Date().toISOString();\n    const syncRevision=syncTimestamp+'-'+Math.random().toString(36).slice(2,10);\n    const response=await fetch('/api/schedule-sync',{method:'POST',credentials:'include',cache:'no-store',headers:{'Content-Type':'application/json','Accept':'application/json','Cache-Control':'no-cache','Pragma':'no-cache','X-Sync-Timestamp':syncTimestamp,'X-Sync-Revision':syncRevision},body:JSON.stringify({dailyShiftAssignments:clean,syncTimestamp,syncRevision})});\n    const text=await response.text(); let data:any={}; try{data=text?JSON.parse(text):{};}catch{}\n    if(!response.ok||data?.success===false) throw new Error('Server error '+response.status+': '+(data?.message||data?.error||text||'Sync failed'));\n    const serverAssignments=Array.isArray(data?.dailyShiftAssignments)?data.dailyShiftAssignments:[];\n    const finalAssignments=serverAssignments.map((item:any)=>{const shiftId=String(item.shiftId??item.shift_id??'').trim();const isOffDay=shiftId?false:Boolean(item.isOffDay??item.is_off_day);return {...item,employeeId:String(item.employeeId??item.employee_id??'').trim(),date:String(item.date??'').slice(0,10),shiftId,isOffDay};}).filter((item:any)=>item.employeeId&&/^\\d{4}-\\d{2}-\\d{2}$/.test(item.date));\n    setAssignments(finalAssignments as DailyShiftAssignment[]);\n    try{localStorage.setItem('daily_shift_assignments',JSON.stringify(finalAssignments));}catch{}\n    return {assignments:finalAssignments};\n  };`;
code=code.slice(0,persistStart)+persistFn+code.slice(persistEnd);
code=code.replace('const CALENDAR_START = 6;','const CALENDAR_START = 0;').replace('const CALENDAR_END = 22;','const CALENDAR_END = 24;');
fs.writeFileSync(file,code,'utf8');

// The schedule screen is mounted without props from App.tsx. Bind it to the
// authoritative App state so the employee list is available immediately,
// instead of depending on a second /api/data request inside the component.
const appFile = 'src/App.tsx';
let app = fs.readFileSync(appFile, 'utf8');
const oldSchedule = `          <WeeklyShiftSchedule\n            lang={lang}`;
const newSchedule = `          <WeeklyShiftSchedule\n            employees={employees}\n            shifts={shifts}\n            dailyShiftAssignments={dailyShiftAssignments}\n            currentUser={currentUser}\n            onSaveDailyShift={(assignment) => {\n              setDailyShiftAssignments(prev => {\n                const key = String(assignment.employeeId) + '|' + String(assignment.date);\n                const next = prev.filter(item => String(item.employeeId) + '|' + String(item.date) !== key);\n                return [...next, assignment];\n              });\n            }}\n            lang={lang}`;
if (app.includes(oldSchedule) && !app.includes('employees={employees}\n            shifts={shifts}\n            dailyShiftAssignments={dailyShiftAssignments}')) {
  app = app.replace(oldSchedule, newSchedule);
  fs.writeFileSync(appFile, app, 'utf8');
}
console.log('Weekly schedule persistence v4 + App employee binding applied');

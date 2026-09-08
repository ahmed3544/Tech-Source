const fs = require('fs');

const path = 'src/components/WeeklyShiftSchedule.tsx';
let s = fs.readFileSync(path, 'utf8');

if (!s.includes('const timelineHourLabels =')) {
  const anchor = "const OFF_DAY_SHIFT_ID = '__OFF_DAY__';";
  const helpers = [
    anchor,
    '',
    "const timelineMinutes = (value?: string) => {",
    "  if (!value) return 0;",
    "  const [hours, minutes] = value.split(':').map(Number);",
    "  return (hours || 0) * 60 + (minutes || 0);",
    "};",
    '',
    "const timelineHourLabels = (start?: string, end?: string) => {",
    "  const startMinutes = timelineMinutes(start);",
    "  const endMinutes = Math.max(startMinutes + 60, timelineMinutes(end));",
    "  const firstHour = Math.floor(startMinutes / 60);",
    "  const lastHour = Math.ceil(endMinutes / 60);",
    "  return Array.from({ length: Math.max(2, lastHour - firstHour + 1) }, (_, index) => {",
    "    const hour = firstHour + index;",
    "    const minute = hour * 60;",
    "    return { hour, minute, label: String(hour % 24).padStart(2, '0') + ':00', left: ((minute - startMinutes) / Math.max(1, endMinutes - startMinutes)) * 100 };",
    "  }).filter(item => item.minute >= startMinutes && item.minute <= endMinutes);",
    "};",
    '',
    "const timelinePercent = (value: string | undefined, start: number, end: number) => {",
    "  const range = Math.max(1, end - start);",
    "  return Math.max(0, Math.min(100, ((timelineMinutes(value) - start) / range) * 100));",
    "};",
  ].join('\n');
  s = s.replace(anchor, helpers);
}

const old = `{selectedShift?.breaks?.length ? <div className="mt-2 rounded-xl bg-amber-50 border border-amber-100 p-2 space-y-1"><div className="text-[9px] font-black text-amber-800">{lang === 'ar' ? 'بريكات الشفت' : 'Shift Breaks'}</div>{selectedShift.breaks.map(item => <div key={item.id} className="text-[9px] text-amber-800 flex items-center justify-between gap-1"><span className="truncate flex items-center gap-1"><Coffee className="w-3 h-3" />{lang === 'ar' ? item.nameAr : item.nameEn}</span><span className="font-mono shrink-0">{item.startTime}-{item.endTime}</span></div>)}</div> : null}`;
const replacement = [
  `{selectedShift ? (() => {`,
  `                    const startMinutes = timelineMinutes(selectedShift.startTime);`,
  `                    const endMinutes = Math.max(startMinutes + 60, timelineMinutes(selectedShift.endTime));`,
  `                    const labels = timelineHourLabels(selectedShift.startTime, selectedShift.endTime);`,
  `                    return <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-2.5 overflow-hidden">`,
  `                      <div className="flex items-center justify-between mb-2">`,
  `                        <span className="text-[9px] font-black text-slate-700">{lang === 'ar' ? 'خط زمني للشفت والبريكات' : 'Shift & Break Timeline'}</span>`,
  `                        <span className="text-[9px] font-mono font-bold text-slate-500">{selectedShift.startTime} - {selectedShift.endTime}</span>`,
  `                      </div>`,
  `                      <div className="relative pt-5">`,
  `                        <div className="absolute inset-x-0 top-0 h-4">`,
  `                          {labels.map(label => <span key={label.minute} className="absolute -translate-x-1/2 text-[8px] font-mono font-bold text-slate-500 whitespace-nowrap" style={{ left: label.left + '%' }}>{label.label}</span>)}`,
  `                        </div>`,
  `                        <div className="relative h-6 rounded-lg bg-slate-200 border border-slate-300 overflow-hidden">`,
  `                          <div className="absolute inset-y-0 left-0 rounded-lg bg-emerald-500" style={{ left: '0%', width: '100%' }} title={selectedShift.startTime + ' - ' + selectedShift.endTime} />`,
  `                          {selectedShift.breaks?.map(item => {`,
  `                            const left = timelinePercent(item.startTime, startMinutes, endMinutes);`,
  `                            const right = timelinePercent(item.endTime, startMinutes, endMinutes);`,
  `                            return <div key={item.id} className="absolute inset-y-0 rounded-md bg-rose-500 border-x border-rose-600/50" style={{ left: left + '%', width: Math.max(0.8, right - left) + '%' }} title={(lang === 'ar' ? item.nameAr : item.nameEn) + ': ' + item.startTime + '-' + item.endTime} />;`,
  `                          })}`, 
  `                        </div>`,
  `                        <div className="mt-1.5 flex items-center gap-3 text-[8px] font-bold text-slate-500">`,
  `                          <span className="inline-flex items-center gap-1"><i className="w-2 h-2 rounded-sm bg-emerald-500" />{lang === 'ar' ? 'وقت العمل' : 'Work'}</span>`,
  `                          <span className="inline-flex items-center gap-1"><i className="w-2 h-2 rounded-sm bg-rose-500" />{lang === 'ar' ? 'البريك' : 'Break'}</span>`,
  `                        </div>`,
  `                      </div>`,
  `                    </div>;`,
  `                  })() : null}`,
].join('\n');

if (!s.includes('Shift & Break Timeline')) {
  if (!s.includes(old)) throw new Error('Expected weekly break block was not found');
  s = s.replace(old, replacement);
  fs.writeFileSync(path, s);
  console.log('Weekly shift timeline added');
} else console.log('Weekly shift timeline already present');

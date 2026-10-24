import React, { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { FileUp, Upload, X, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Employee, Language, Shift, DailyShiftAssignment } from '../types';

type Row = Record<string, unknown>;
type PreviewRow = { employee: Employee; date: string; shiftId: string; isOffDay: boolean; status: string; note?: string };

const norm = (v: unknown) => String(v ?? '').trim().toLowerCase();
const key = (v: unknown) => norm(v).replace(/[\\s_-]+/g, '');
const dateValue = (v: unknown): string => {
  if (v instanceof Date && Number.isFinite(v.getTime())) return `${v.getFullYear()}-${String(v.getMonth()+1).padStart(2,'0')}-${String(v.getDate()).padStart(2,'0')}`;
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    const d = XLSX.SSF.parse_date_code(v);
    if (d) return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
  }
  const s = String(v ?? '').trim();
  if (/^\\d{4}-\\d{2}-\\d{2}/.test(s)) return s.slice(0,10);
  const m = /^(\\d{1,2})[/-](\\d{1,2})[/-](\\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  return '';
};
const readSheet = (wb: XLSX.WorkBook, name: string): Row[] => {
  const sheetName = wb.SheetNames.find(n => key(n) === key(name));
  return sheetName ? XLSX.utils.sheet_to_json<Row>(wb.Sheets[sheetName], { defval: '' }) : [];
};
const value = (row: Row, ...names: string[]) => {
  const found = Object.keys(row).find(k => names.some(n => key(k) === key(n)));
  return found ? row[found] : '';
};

interface Props { employees: Employee[]; shifts: Shift[]; currentUser: Employee | null; lang: Language; onImported: (assignments: DailyShiftAssignment[]) => void; }
export const ExcelImportPanel: React.FC<Props> = ({ employees, shifts, currentUser, lang, onImported }) => {
  const ar = lang === 'ar';
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [issues, setIssues] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [mode, setMode] = useState<'merge'|'replace'>('merge');
  const canImport = ['leader','admin','company_admin','platform_admin'].includes(norm(currentUser?.role));
  const counts = useMemo(() => ({ work: rows.filter(r => !r.isOffDay && !['holiday','annual'].includes(r.status)).length, off: rows.filter(r => r.isOffDay || key(r.status)==='off').length, holiday: rows.filter(r => key(r.status)==='holiday').length, annual: rows.filter(r => key(r.status)==='annual').length }), [rows]);
  if (!canImport) return null;

  const parseFile = async (file?: File) => {
    if (!file) return;
    setFileName(file.name); setRows([]); setIssues([]); setNotice('');
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
      const scheduleRows = readSheet(wb, 'Weekly Schedule');
      const shiftRows = readSheet(wb, 'Shifts');
      if (!scheduleRows.length) throw new Error(ar ? 'لم أجد بيانات في ورقة Weekly Schedule.' : 'No rows found in the Weekly Schedule sheet.');
      const issuesFound: string[] = [];
      const preview: PreviewRow[] = [];
      const shiftLookup = new Map<string,string>();
      shifts.forEach(s => {
        if (s.id) shiftLookup.set(key(s.id), s.id);
        [s.nameEn, s.name, s.nameAr].filter(Boolean).forEach(n => shiftLookup.set(key(n), s.id));
      });
      shiftRows.forEach(r => {
        const workbookId = String(value(r,'ShiftID','id') || '');
        const workbookName = String(value(r,'ShiftName','name') || '');
        const matched = shifts.find(s => [s.nameEn, s.name, s.nameAr].some(n => key(n) === key(workbookName)) || key(s.id) === key(workbookId));
        if (matched && workbookId) shiftLookup.set(key(workbookId), matched.id);
      });
      const employeeLookup = new Map<string,Employee>();
      employees.forEach(e => [e.id,e.code,e.email,e.nameEn,e.nameAr].filter(Boolean).forEach(v => employeeLookup.set(key(v),e)));
      scheduleRows.forEach((r, i) => {
        const empToken = value(r,'EmployeeID','EmployeeId','Employee Code','Code','Email','EmployeeName','Employee Name');
        const date = dateValue(value(r,'Date','ScheduleDate','Day'));
        const statusRaw = String(value(r,'DayStatus','Status','Type') || 'WORKING').trim();
        const statusKey = key(statusRaw);
        const employee = employeeLookup.get(key(empToken));
        if (!employee) { issuesFound.push(`Row ${i+2}: ${ar ? 'الموظف غير معروف' : 'Unknown employee'} (${String(empToken||'—')})`); return; }
        if (!date) { issuesFound.push(`Row ${i+2}: ${ar ? 'التاريخ غير صحيح' : 'Invalid date'}`); return; }
        const isOff = ['off','dayoff','weeklyoff','راحة','راحةاسبوعية'].includes(statusKey);
        const isHoliday = ['holiday','officialholiday','عطلةرسمية'].includes(statusKey);
        const isAnnual = ['annual','annualleave','اجازةسنوية'].includes(statusKey);
        const shiftToken = value(r,'ShiftID','ShiftId','ShiftName','Shift');
        const shiftId = (isOff || isHoliday || isAnnual) ? '' : (shiftLookup.get(key(shiftToken)) || '');
        if (!isOff && !isHoliday && !isAnnual && !shiftId) { issuesFound.push(`Row ${i+2}: ${ar ? 'الوردية غير معروفة' : 'Unknown shift'} (${String(shiftToken||'—')})`); return; }
        preview.push({ employee, date, shiftId, isOffDay:isOff, status:isHoliday?'HOLIDAY':isAnnual?'ANNUAL':isOff?'OFF':'WORKING', note:String(value(r,'Notes','Note')||'') });
      });
      const unique = new Map<string,PreviewRow>();
      preview.forEach(r => { const k = `${r.employee.id}|${r.date}`; if (unique.has(k)) issuesFound.push(`${r.employee.nameEn} ${r.date}: ${ar ? 'تكرار لنفس الموظف والتاريخ' : 'Duplicate employee/date'}`); unique.set(k,r); });
      setRows(Array.from(unique.values())); setIssues(issuesFound);
      if (!preview.length) setNotice(ar ? 'لا توجد صفوف صالحة للاستيراد.' : 'No valid rows to import.');
    } catch (e) { setNotice(e instanceof Error ? e.message : (ar ? 'تعذر قراءة الملف.' : 'Could not read the workbook.')); }
  };

  const importRows = async () => {
    if (!rows.length || issues.length || !currentUser) return;
    setBusy(true); setNotice('');
    try {
      const stamp = new Date().toISOString();
      const payload = rows.map(r => ({ employeeId:r.employee.id, date:r.date, shiftId:r.shiftId, isOffDay:r.isOffDay || r.status==='OFF', status:r.status, assignedBy:currentUser.id, updatedAt:stamp }));
      const response = await fetch('/api/schedule-sync', { method:'POST', credentials:'include', headers:{'Content-Type':'application/json','Accept':'application/json'}, body:JSON.stringify({ dailyShiftAssignments:payload }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result?.success === false) throw new Error(result?.error || (ar ? 'فشل حفظ الجدول.' : 'Schedule import failed.'));
      onImported(Array.isArray(result.dailyShiftAssignments) ? result.dailyShiftAssignments : payload);
      setNotice(ar ? `تم استيراد ${rows.length} صف جدول بنجاح.` : `Successfully imported ${rows.length} schedule rows.`);
      setRows([]); setIssues([]); setFileName('');
    } catch (e) { setNotice(e instanceof Error ? e.message : (ar ? 'حدث خطأ أثناء الاستيراد.' : 'Import failed.')); }
    finally { setBusy(false); }
  };

  return <>
    <button type="button" onClick={() => { setOpen(true); setNotice(''); }} className="inline-flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-800 hover:bg-emerald-100 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300">
      <FileUp className="h-4 w-4" />{ar ? 'استيراد Excel' : 'Import Excel'}
    </button>
    {open && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-3" role="presentation" onClick={() => !busy && setOpen(false)}>
      <div role="dialog" aria-modal="true" aria-label={ar?'استيراد ملف Excel':'Import Excel'} onClick={e=>e.stopPropagation()} className="max-h-[92dvh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-4 shadow-2xl dark:bg-slate-900" dir={ar?'rtl':'ltr'}>
        <div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-black">{ar?'استيراد جدول من Excel':'Import schedule from Excel'}</h2><p className="mt-1 text-xs text-slate-500">{ar?'يتم تحديث جدول الشيفتات فقط. سجلات الحضور لا تتغير.':'Imports schedule assignments only. Attendance records are never modified.'}</p></div><button type="button" disabled={busy} onClick={()=>setOpen(false)} className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label={ar?'إغلاق':'Close'}><X className="h-5 w-5"/></button></div>
        <label className="mt-4 flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-300 p-6 text-center hover:border-emerald-500 dark:border-slate-700"><Upload className="h-7 w-7 text-emerald-600"/><span className="text-sm font-bold">{ar?'اختار ملف Excel (.xlsx أو .xls)':'Choose Excel workbook (.xlsx or .xls)'}</span><span className="text-xs text-slate-500">{fileName || (ar?'ورقة Weekly Schedule مطلوبة':'Weekly Schedule sheet is required')}</span><input className="hidden" type="file" accept=".xlsx,.xls,.xlsm" onChange={e=>void parseFile(e.target.files?.[0])}/></label>
        {rows.length>0 && <><div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">{[[ar?'إجمالي الصفوف':'Rows',rows.length],[ar?'دوام':'Working',counts.work],[ar?'راحة':'OFF',counts.off],[ar?'عطلة / سنوي':'Holiday / Annual',counts.holiday+counts.annual]].map(([label,n])=><div key={String(label)} className="rounded-xl bg-slate-100 p-3 dark:bg-slate-800"><div className="text-xs text-slate-500">{label}</div><div className="mt-1 text-xl font-black">{n}</div></div>)}</div><div className="mt-3 max-h-56 overflow-auto rounded-xl border dark:border-slate-700"><table className="w-full text-xs"><thead className="sticky top-0 bg-slate-100 dark:bg-slate-800"><tr><th className="p-2 text-start">{ar?'الموظف':'Employee'}</th><th className="p-2 text-start">{ar?'التاريخ':'Date'}</th><th className="p-2 text-start">{ar?'الحالة':'Status'}</th><th className="p-2 text-start">{ar?'الوردية':'Shift'}</th></tr></thead><tbody>{rows.slice(0,100).map((r,i)=><tr key={r.employee.id+r.date} className="border-t dark:border-slate-800"><td className="p-2">{r.employee.nameEn||r.employee.nameAr}</td><td className="p-2 font-mono">{r.date}</td><td className="p-2">{r.status}</td><td className="p-2">{shifts.find(s=>s.id===r.shiftId)?.nameEn || (r.shiftId||'—')}</td></tr>)}</tbody></table></div>{rows.length>100&&<p className="mt-1 text-xs text-slate-500">{ar?'يتم عرض أول 100 صف فقط في المعاينة.':'Preview shows the first 100 rows only.'}</p>}</>}
        {issues.length>0&&<div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200"><div className="mb-2 flex items-center gap-2 font-black"><AlertTriangle className="h-4 w-4"/>{ar?'صحح الأخطاء قبل الحفظ':'Fix these issues before importing'}</div><ul className="max-h-28 list-inside list-disc space-y-1 overflow-auto">{issues.slice(0,30).map((issue,i)=><li key={i}>{issue}</li>)}</ul>{issues.length>30&&<p className="mt-1">{ar?`و ${issues.length-30} أخطاء أخرى`:`and ${issues.length-30} more issues`}</p>}</div>}
        {notice&&<div className={`mt-3 rounded-xl p-3 text-sm font-bold ${notice.toLowerCase().includes('successfully')||notice.includes('بنجاح')?'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300':'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'}`}>{notice}</div>}
        <div className="mt-4 flex flex-wrap justify-end gap-2 border-t pt-3 dark:border-slate-800"><button type="button" disabled={busy} onClick={()=>{setRows([]);setIssues([]);setNotice('');setFileName('');}} className="rounded-xl border px-4 py-2 text-sm font-bold dark:border-slate-700">{ar?'مسح':'Clear'}</button><button type="button" disabled={busy||!rows.length||issues.length>0} onClick={()=>void importRows()} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-black text-white disabled:opacity-40"><CheckCircle2 className="h-4 w-4"/>{busy?(ar?'جاري الحفظ...':'Importing...'):(ar?`تأكيد استيراد ${rows.length} صف`:`Confirm import (${rows.length})`)}</button></div>
      </div>
    </div>}
  </>;
};

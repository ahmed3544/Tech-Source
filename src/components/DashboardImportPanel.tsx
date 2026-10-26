import React, { useEffect, useState } from 'react';
import { UploadCloud, X, FileSpreadsheet, Users, CalendarDays, AlertTriangle, Check, Save, RefreshCw, Link2, ListChecks } from 'lucide-react';
import { Employee, Language } from '../types';
import { authHeaders, errorToMessage, extractApiError, parseResponse } from '../utils/errors';
import { analyzeDashboardSheets, type DashboardAnalysis, type DashboardSheetInput } from '../utils/dashboardImport';

/**
 * Excel dashboard import panel — "استيراد الداش بورد من Excel".
 *
 * Section 1 (all managers): upload ANY Excel dashboard → the shared engine
 * auto-detects sheets (staff lists / shift grids / long rosters), shows a
 * preview, then applies employees + shifts + schedule server-side. A copy of
 * the file (≤ 3 MB) is kept on the server so the daily cron can re-apply it
 * AUTOMATICALLY — the local-file story for "import تلقائي": re-upload the
 * file when it changes and the site stays in sync every day in between.
 *
 * Section 2 (admins): paste a direct link to a hosted copy of the file
 * (OneDrive / Google Drive / any URL) → the server downloads, parses and
 * imports it, and the daily Vercel cron repeats it automatically when
 * auto-sync is on.
 */

interface DashboardImportConfigDto {
  sourceUrl: string;
  autoSync: boolean;
  hasDefaultPin: boolean;
  autoImport: boolean;
  hasStoredFile: boolean;
  storedFileName: string | null;
  storedFileSize: number | null;
  storedFileUploadedAt: string | null;
  storedFileUploadedBy: string | null;
  lastSyncAt: string | null;
  lastSyncStatus: 'ok' | 'error' | null;
  lastSyncError: string | null;
  lastSyncSummary: string | null;
}

interface ApplySummaryDto {
  sheetsScanned: number;
  sheetKinds: Array<{ name: string; kind: string }>;
  employeesCreated: number;
  employeesUpdated: number;
  shiftsCreated: number;
  assignmentsApplied: number;
  offDays: number;
  skippedAssignments: number;
  dateRange: [string, string] | null;
  warnings: string[];
  createdEmployeeCodes: string[];
  createdShiftNames: string[];
}

const KIND_BADGES: Record<string, { ar: string; en: string; cls: string }> = {
  schedule: { ar: 'جدول شيوفات', en: 'Shift roster', cls: 'bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300' },
  employees: { ar: 'قائمة موظفين', en: 'Employees list', cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' },
  unknown: { ar: 'غير معروفة', en: 'Not recognized', cls: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400' },
};

/** Files up to 3 MB are kept server-side for the daily auto re-import. */
const MAX_STORE_FILE_BYTES = 3 * 1024 * 1024;

const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
};

function formatDateTime(value: string | null | undefined, lang: Language): string {
  if (!value) return lang === 'ar' ? 'لم تتم بعد' : 'Never';
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return value;
  return d.toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' });
}

export function DashboardImportPanel({ lang, currentUser, onClose, onImported }: {
  lang: Language;
  currentUser: Employee | null;
  onClose: () => void;
  onImported?: () => void;
}) {
  const ar = lang === 'ar';
  const isAdmin = ['admin', 'company_admin', 'platform_admin'].includes(String(currentUser?.role || ''));

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'' | 'apply' | 'save' | 'sync' | 'reapply' | 'auto'>('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [storedNote, setStoredNote] = useState('');

  // Upload section
  const [fileName, setFileName] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [rawSheets, setRawSheets] = useState<DashboardSheetInput[] | null>(null);
  const [analysis, setAnalysis] = useState<DashboardAnalysis | null>(null);
  const [summary, setSummary] = useState<ApplySummaryDto | null>(null);
  const [options, setOptions] = useState({ defaultPin: '1234', createMissingEmployees: true, autoCreateShifts: true, overwriteAssignments: true });
  const lastFileRef = React.useRef<File | null>(null);

  // URL auto-sync + stored-file auto-import section
  const [config, setConfig] = useState<DashboardImportConfigDto>({ sourceUrl: '', autoSync: false, hasDefaultPin: false, autoImport: false, hasStoredFile: false, storedFileName: null, storedFileSize: null, storedFileUploadedAt: null, storedFileUploadedBy: null, lastSyncAt: null, lastSyncStatus: null, lastSyncError: null, lastSyncSummary: null });
  const [urlDraft, setUrlDraft] = useState({ sourceUrl: '', autoSync: false, defaultPin: '' });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch('/api/dashboard-import', { cache: 'no-store', credentials: 'include', headers: authHeaders({ Accept: 'application/json' }) });
        const data = await parseResponse(response);
        if (cancelled) return;
        if (response.ok && data?.success) {
          setConfig({ ...data.config });
          setUrlDraft({ sourceUrl: data.config.sourceUrl ?? '', autoSync: Boolean(data.config.autoSync), defaultPin: '' });
        }
      } catch { /* panel still usable without saved config */ }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleFile = async (file: File) => {
    setAnalyzing(true); setError(''); setNotice(''); setSummary(null); setStoredNote('');
    lastFileRef.current = file;
    try {
      const XLSX = await import('xlsx');
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      if (!workbook.SheetNames?.length) throw new Error(ar ? 'الملف لا يحتوي على أوراق عمل.' : 'The file has no worksheets.');
      const sheets: DashboardSheetInput[] = workbook.SheetNames.slice(0, 20).map((name: string) => ({
        name,
        rows: XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], { header: 1, defval: '' }) as unknown[][],
      }));
      const result = analyzeDashboardSheets(sheets, { lang });
      setFileName(file.name);
      setRawSheets(sheets);
      setAnalysis(result);
      if (!result.totalEmployees && !result.totalAssignments) {
        setError(ar
          ? 'لم يتم التعرف على بيانات قابلة للاستيراد في الملف. تأكد أن الورقة تحتوي على عمود اسم/كود الموظف وأعمدة تواريخ أو شيفت.'
          : 'No importable data was recognized in the file. Make sure a sheet has a name/code column and date or shift columns.');
      }
    } catch (err: unknown) {
      setError(errorToMessage(err, ar ? 'تعذر قراءة ملف Excel' : 'Could not read the Excel file'));
      setAnalysis(null); setRawSheets(null); setFileName('');
    } finally {
      setAnalyzing(false);
    }
  };

  /**
   * Keep a server-side copy of the uploaded workbook so the daily cron can
   * re-apply it automatically (the local-file auto-import). Best-effort: the
   * import itself has already succeeded when this runs.
   */
  const storeFileForAutoImport = async (file: File) => {
    if (file.size > MAX_STORE_FILE_BYTES) {
      setStoredNote(ar
        ? `الملف أكبر من 3 ميجا (${Math.round(file.size / (1024 * 1024))} ميجا) — تم استيراده لكن لن يتم إعادة استيراده تلقائياً. استخدم رابط الملف (القسم ٢) لاستيراد تلقائي لأي حجم.`
        : `The file is larger than 3 MB (${Math.round(file.size / (1024 * 1024))} MB) — imported, but it will not be re-imported automatically. Use the file URL (section 2) for auto-import of any size.`);
      return;
    }
    try {
      const data = arrayBufferToBase64(await file.arrayBuffer());
      const response = await fetch('/api/dashboard-import-store', {
        method: 'POST', credentials: 'include', cache: 'no-store',
        headers: authHeaders({ 'Content-Type': 'application/json', Accept: 'application/json' }),
        body: JSON.stringify({ name: file.name, data }),
      });
      const responseData = await parseResponse(response);
      if (!response.ok || responseData?.success === false) throw new Error(extractApiError(responseData, 'STORE_FAILED'));
      setConfig((c) => ({ ...c, hasStoredFile: true, storedFileName: file.name, storedFileSize: file.size, storedFileUploadedAt: responseData.storedFile?.uploadedAt ?? new Date().toISOString() }));
      setStoredNote(ar
        ? `تم حفظ نسخة من "${file.name}" على السيرفر — الجدول هيتستورد منه تلقائياً كل يوم.`
        : `A copy of "${file.name}" was saved on the server — it will be re-imported automatically every day.`);
    } catch {
      setStoredNote(ar ? 'تعذر حفظ نسخة الملف للاستيراد التلقائي (الاستيراد نفسه نجح).' : 'Could not save the file copy for auto-import (the import itself succeeded).');
    }
  };

  const applyImport = async () => {
    if (!rawSheets || busy) return;
    setBusy('apply'); setError(''); setNotice(''); setStoredNote('');
    try {
      const response = await fetch('/api/dashboard-import-apply', {
        method: 'POST', credentials: 'include', cache: 'no-store',
        headers: authHeaders({ 'Content-Type': 'application/json', Accept: 'application/json' }),
        body: JSON.stringify({ sheets: rawSheets, options }),
      });
      const data = await parseResponse(response);
      if (response.status === 401) throw new Error(ar ? 'انتهت الجلسة. يرجى تسجيل الدخول من جديد.' : 'Session ended. Please sign in again.');
      if (!response.ok || data?.success === false) throw new Error(extractApiError(data, ar ? 'تعذر تطبيق الاستيراد على السيرفر' : 'The server rejected the import'));
      setSummary(data.summary as ApplySummaryDto);
      setNotice(ar ? 'تم استيراد الداش بورد بنجاح — سيتم تحديث الصفحة.' : 'Dashboard imported successfully — refreshing the page.');
      setAnalysis(null); setRawSheets(null); setFileName('');
      const uploaded = lastFileRef.current;
      lastFileRef.current = null;
      if (uploaded) void storeFileForAutoImport(uploaded);
      onImported?.();
    } catch (err: unknown) {
      setError(errorToMessage(err, ar ? 'فشل استيراد الداش بورد' : 'Dashboard import failed'));
    } finally {
      setBusy('');
    }
  };

  /** Re-apply the stored workbook right now (same engine as the daily cron). */
  const reApplyStored = async () => {
    if (busy) return;
    setBusy('reapply'); setError(''); setNotice(''); setStoredNote(''); setSummary(null);
    try {
      const response = await fetch('/api/dashboard-import-file', {
        method: 'POST', credentials: 'include', cache: 'no-store',
        headers: authHeaders({ 'Content-Type': 'application/json', Accept: 'application/json' }),
        body: JSON.stringify({}),
      });
      const data = await parseResponse(response);
      if (response.status === 401) throw new Error(ar ? 'انتهت الجلسة. يرجى تسجيل الدخول من جديد.' : 'Session ended. Please sign in again.');
      if (!response.ok || data?.success === false) throw new Error(extractApiError(data, ar ? 'تعذر استيراد الملف المحفوظ' : 'Could not import the stored file'));
      setSummary(data.summary as ApplySummaryDto);
      setNotice(ar ? 'تم استيراد الملف المحفوظ بنجاح — سيتم تحديث الصفحة.' : 'Stored file imported successfully — refreshing the page.');
      setConfig((c) => ({ ...c, lastSyncAt: new Date().toISOString(), lastSyncStatus: 'ok', lastSyncError: null }));
      onImported?.();
    } catch (err: unknown) {
      setError(errorToMessage(err, ar ? 'فشل استيراد الملف المحفوظ' : 'Stored-file import failed'));
    } finally {
      setBusy('');
    }
  };

  /** Toggle the daily auto re-import of the stored file (admins only). */
  const toggleAutoImport = async (value: boolean) => {
    if (busy) return;
    setBusy('auto'); setError(''); setNotice('');
    try {
      const response = await fetch('/api/dashboard-import', {
        method: 'PUT', credentials: 'include', cache: 'no-store',
        headers: authHeaders({ 'Content-Type': 'application/json', Accept: 'application/json' }),
        body: JSON.stringify({ autoImport: value }),
      });
      const data = await parseResponse(response);
      if (response.status === 401) throw new Error(ar ? 'انتهت الجلسة. يرجى تسجيل الدخول من جديد.' : 'Session ended. Please sign in again.');
      if (!response.ok || data?.success === false) throw new Error(extractApiError(data, ar ? 'تعذر حفظ الإعداد' : 'Could not save the setting'));
      setConfig((c) => ({ ...c, autoImport: Boolean(data.config?.autoImport ?? value) }));
      setNotice(value
        ? (ar ? 'تم تفعيل الاستيراد التلقائي — الملف المحفوظ هيتطبق يومياً على السيرفر.' : 'Auto-import enabled — the stored file is re-applied daily on the server.')
        : (ar ? 'تم إيقاف الاستيراد التلقائي للملف المحفوظ.' : 'Auto-import of the stored file is now off.'));
    } catch (err: unknown) {
      setError(errorToMessage(err, ar ? 'فشل حفظ الإعداد' : 'Saving the setting failed'));
    } finally {
      setBusy('');
    }
  };

  /** Remove the stored workbook copy (admins only). */
  const removeStoredFile = async () => {
    if (busy) return;
    if (!window.confirm(ar ? 'هل تريد حذف النسخة المحفوظة من الملف؟' : 'Delete the stored copy of the file?')) return;
    setBusy('auto'); setError(''); setNotice(''); setStoredNote('');
    try {
      const response = await fetch('/api/dashboard-import', {
        method: 'PUT', credentials: 'include', cache: 'no-store',
        headers: authHeaders({ 'Content-Type': 'application/json', Accept: 'application/json' }),
        body: JSON.stringify({ removeStoredFile: true }),
      });
      const data = await parseResponse(response);
      if (response.status === 401) throw new Error(ar ? 'انتهت الجلسة. يرجى تسجيل الدخول من جديد.' : 'Session ended. Please sign in again.');
      if (!response.ok || data?.success === false) throw new Error(extractApiError(data, ar ? 'تعذر حذف النسخة المحفوظة' : 'Could not remove the stored copy'));
      setConfig((c) => ({ ...c, hasStoredFile: false, storedFileName: null, storedFileSize: null, storedFileUploadedAt: null }));
      setStoredNote(ar ? 'تم حذف النسخة المحفوظة.' : 'Stored copy removed.');
    } catch (err: unknown) {
      setError(errorToMessage(err, ar ? 'فشل حذف النسخة المحفوظة' : 'Removing the stored copy failed'));
    } finally {
      setBusy('');
    }
  };

  const saveUrlConfig = async () => {
    if (busy) return;
    setBusy('save'); setError(''); setNotice('');
    try {
      const response = await fetch('/api/dashboard-import', {
        method: 'PUT', credentials: 'include', cache: 'no-store',
        headers: authHeaders({ 'Content-Type': 'application/json', Accept: 'application/json' }),
        body: JSON.stringify({ sourceUrl: urlDraft.sourceUrl.trim(), autoSync: urlDraft.autoSync, defaultPin: urlDraft.defaultPin.trim() || undefined }),
      });
      const data = await parseResponse(response);
      if (response.status === 401) throw new Error(ar ? 'انتهت الجلسة. يرجى تسجيل الدخول من جديد.' : 'Session ended. Please sign in again.');
      if (!response.ok || data?.success === false) throw new Error(extractApiError(data, ar ? 'تعذر حفظ الإعدادات' : 'Could not save the settings'));
      setConfig((c) => ({ ...c, sourceUrl: urlDraft.sourceUrl.trim(), autoSync: urlDraft.autoSync, hasDefaultPin: Boolean(data.config?.hasDefaultPin ?? c.hasDefaultPin) }));
      setNotice(ar ? 'تم حفظ إعدادات المزامنة التلقائية.' : 'Auto-sync settings saved.');
    } catch (err: unknown) {
      setError(errorToMessage(err, ar ? 'فشل حفظ الإعدادات' : 'Saving settings failed'));
    } finally {
      setBusy('');
    }
  };

  const syncFromUrl = async () => {
    if (busy) return;
    setBusy('sync'); setError(''); setNotice(''); setSummary(null);
    try {
      const response = await fetch('/api/dashboard-import-url', {
        method: 'POST', credentials: 'include', cache: 'no-store',
        headers: authHeaders({ 'Content-Type': 'application/json', Accept: 'application/json' }),
        body: JSON.stringify({ url: urlDraft.sourceUrl.trim() || undefined }),
      });
      const data = await parseResponse(response);
      if (response.status === 401) throw new Error(ar ? 'انتهت الجلسة. يرجى تسجيل الدخول من جديد.' : 'Session ended. Please sign in again.');
      if (!response.ok || data?.success === false) throw new Error(extractApiError(data, ar ? 'تعذر تحميل أو استيراد الملف من الرابط' : 'Could not download or import the file from the URL'));
      setSummary(data.summary as ApplySummaryDto);
      setNotice(ar ? 'تمت المزامنة من الرابط بنجاح — سيتم تحديث الصفحة.' : 'URL sync finished successfully — refreshing the page.');
      setConfig((c) => ({ ...c, lastSyncAt: new Date().toISOString(), lastSyncStatus: 'ok', lastSyncError: null }));
      onImported?.();
    } catch (err: unknown) {
      setError(errorToMessage(err, ar ? 'فشلت المزامنة من الرابط' : 'URL sync failed'));
      setConfig((c) => ({ ...c, lastSyncAt: new Date().toISOString(), lastSyncStatus: 'error' }));
    } finally {
      setBusy('');
    }
  };

  const hasImportable = Boolean(analysis && (analysis.totalEmployees > 0 || analysis.totalAssignments > 0));

  return <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label={ar ? 'استيراد الداش بورد من Excel' : 'Excel dashboard import'}>
    <div className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900" dir={ar ? 'rtl' : 'ltr'}>
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-700">
        <h2 className="flex items-center gap-2 font-black"><UploadCloud className="h-5 w-5 text-violet-600 dark:text-violet-400" />{ar ? 'استيراد الداش بورد من Excel' : 'Excel dashboard import'}</h2>
        <button type="button" onClick={onClose} aria-label={ar ? 'إغلاق الاستيراد' : 'Close dashboard import'} className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-slate-700 transition hover:bg-red-100 hover:text-red-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-red-500/20"><X className="h-5 w-5" /></button>
      </div>

      <div className="max-h-[70vh] space-y-4 overflow-y-auto px-4 py-4">
        {loading && <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">{ar ? 'جاري التحميل...' : 'Loading...'}</div>}
        {!loading && <>
          {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-500/15 dark:text-red-300">{error}</div>}
          {notice && !error && <div className="rounded-lg bg-emerald-50 p-3 text-sm font-bold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">{notice}</div>}
          {summary && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm dark:border-emerald-500/30 dark:bg-emerald-500/10">
              <div className="flex items-center gap-2 font-black text-emerald-700 dark:text-emerald-300"><Check className="h-4 w-4" />{ar ? 'نتيجة الاستيراد' : 'Import result'}</div>
              <ul className="mt-2 space-y-1 text-emerald-800 dark:text-emerald-200">
                <li>{ar ? 'موظفون جدد: ' : 'New employees: '}{summary.employeesCreated}{summary.createdEmployeeCodes.length ? ` (${summary.createdEmployeeCodes.slice(0, 8).join('، ')}${summary.createdEmployeeCodes.length > 8 ? '…' : ''})` : ''}</li>
                <li>{ar ? 'موظفون تم تحديث بياناتهم: ' : 'Employees updated: '}{summary.employeesUpdated}</li>
                <li>{ar ? 'شيفتات جديدة أُنشئت: ' : 'Shifts created: '}{summary.shiftsCreated}{summary.createdShiftNames.length ? ` (${summary.createdShiftNames.slice(0, 6).join('، ')}${summary.createdShiftNames.length > 6 ? '…' : ''})` : ''}</li>
                <li>{ar ? 'تعيينات شيفت: ' : 'Shift assignments: '}{summary.assignmentsApplied} · {ar ? 'أيام راحة: ' : 'OFF days: '}{summary.offDays}</li>
                {summary.dateRange && <li>{ar ? 'المدى: ' : 'Range: '}{summary.dateRange[0]} ← {summary.dateRange[1]}</li>}
                {summary.skippedAssignments > 0 && <li className="text-amber-700 dark:text-amber-300">{ar ? 'خلايا تم تجاهلها: ' : 'Skipped cells: '}{summary.skippedAssignments}</li>}
              </ul>
            </div>
          )}

          {/* ---- Section 1: file upload ---- */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/60">
            <div className="font-bold">{ar ? '١) ارفع ملف الداش بورد (Excel)' : '1) Upload your dashboard file (Excel)'}</div>
            <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
              {ar
                ? 'أي ملف إكسل — النظام هيكتشف الأعمدة والأوراق تلقائي (عربي أو إنجليزي): أسماء الموظفين، الشيفتات بالتوقيت، أيام الراحة (OFF / راحة / إجازة)، وجدول الأيام. هتشوف معاينة كاملة قبل الحفظ. ونسخة من الملف بتتحفظ على السيرفر لإعادة الاستيراد التلقائي كل يوم (لحد 3 ميجا).'
                : 'Any Excel file — columns and sheets are auto-detected (Arabic or English): employee names, shifts with times, OFF/rest/leave days, and day columns. You will see a full preview before saving. A copy of the file is kept on the server for the daily automatic re-import (up to 3 MB).'}
            </p>
            <label className="mt-3 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-violet-300 bg-violet-50/60 px-4 py-6 text-center transition hover:bg-violet-100/60 dark:border-violet-500/40 dark:bg-violet-500/10 dark:hover:bg-violet-500/20">
              <FileSpreadsheet className="h-7 w-7 text-violet-600 dark:text-violet-300" />
              <span className="text-sm font-bold text-violet-700 dark:text-violet-200">{analyzing ? (ar ? 'جاري التحليل...' : 'Analyzing...') : (ar ? 'اضغط لاختيار ملف .xlsx أو .xls أو .csv' : 'Click to choose an .xlsx / .xls / .csv file')}</span>
              {fileName && <span className="text-xs text-slate-500 dark:text-slate-400" dir="ltr">{fileName}</span>}
              <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.currentTarget.value = ''; }} />
            </label>

            {analysis && (
              <div className="mt-3 space-y-2">
                <div className="text-xs font-bold text-slate-600 dark:text-slate-300">{ar ? 'الأوراق المكتشفة:' : 'Detected sheets:'}</div>
                {analysis.sheets.map((sheet) => {
                  const badge = KIND_BADGES[sheet.kind] ?? KIND_BADGES.unknown;
                  return (
                    <div key={sheet.name} className="rounded-lg border border-slate-200 bg-white p-2.5 text-sm dark:border-slate-700 dark:bg-slate-900">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold" dir="ltr">{sheet.name}</span>
                        <span className={`rounded-lg px-2 py-0.5 text-[10px] font-black ${badge.cls}`}>{ar ? badge.ar : badge.en}</span>
                        {sheet.kind !== 'unknown' && <span className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400"><Users className="h-3.5 w-3.5" />{sheet.employees.length}</span>}
                        {sheet.kind === 'schedule' && <span className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400"><CalendarDays className="h-3.5 w-3.5" />{sheet.assignments.length}{sheet.dateRange ? ` · ${sheet.dateRange[0]} ← ${sheet.dateRange[1]}` : ''}</span>}
                      </div>
                      {sheet.sampleHeaders.length > 0 && <div className="mt-1 truncate text-[11px] text-slate-400 dark:text-slate-500" dir="ltr">{sheet.sampleHeaders.join(' | ')}</div>}
                      {sheet.warnings.length > 0 && (
                        <div className="mt-1.5 space-y-0.5 text-[11px] text-amber-700 dark:text-amber-300">
                          {sheet.warnings.slice(0, 4).map((w, i) => <div key={i} className="flex items-start gap-1"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /><span>{w}</span></div>)}
                        </div>
                      )}
                    </div>
                  );
                })}
                {analysis.warnings.length > 0 && (
                  <div className="text-[11px] text-amber-700 dark:text-amber-300">{analysis.warnings.slice(0, 3).join(' · ')}</div>
                )}

                {hasImportable && (
                  <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-2.5 dark:border-slate-700 dark:bg-slate-900">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-300"><ListChecks className="h-4 w-4" />{ar ? 'خيارات الاستيراد' : 'Import options'}</div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <label className="block text-xs">
                        <span className="mb-1 block font-bold text-slate-600 dark:text-slate-300">{ar ? 'باسورد مؤقت للموظفين الجدد' : 'Temporary password for new employees'}</span>
                        <input dir="ltr" type="text" value={options.defaultPin} onChange={(e) => setOptions((o) => ({ ...o, defaultPin: e.target.value }))} className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100" />
                      </label>
                      <div className="space-y-1.5 text-xs font-semibold">
                        <label className="flex items-center gap-2"><input type="checkbox" checked={options.createMissingEmployees} onChange={(e) => setOptions((o) => ({ ...o, createMissingEmployees: e.target.checked }))} className="h-4 w-4 accent-violet-600" />{ar ? 'إنشاء الموظفين غير الموجودين' : 'Create missing employees'}</label>
                        <label className="flex items-center gap-2"><input type="checkbox" checked={options.autoCreateShifts} onChange={(e) => setOptions((o) => ({ ...o, autoCreateShifts: e.target.checked }))} className="h-4 w-4 accent-violet-600" />{ar ? 'إنشاء الشيفتات غير الموجودة (بالاسم والتوقيت)' : 'Create missing shifts (by name & time)'}</label>
                        <label className="flex items-center gap-2"><input type="checkbox" checked={options.overwriteAssignments} onChange={(e) => setOptions((o) => ({ ...o, overwriteAssignments: e.target.checked }))} className="h-4 w-4 accent-violet-600" />{ar ? 'استبدال الجدول الموجود في نفس الأيام' : 'Overwrite existing assignments on those days'}</label>
                      </div>
                    </div>
                    <button type="button" disabled={busy !== ''} onClick={applyImport} className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-bold text-white hover:bg-violet-700 disabled:opacity-50">
                      <UploadCloud className="h-4 w-4" />
                      {busy === 'apply' ? (ar ? 'جاري الاستيراد...' : 'Importing...') : ar ? `استيراد الآن (${analysis.totalEmployees} موظف · ${analysis.totalAssignments} تعيين)` : `Import now (${analysis.totalEmployees} employees · ${analysis.totalAssignments} assignments)`}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ---- Section 1b: stored-file auto import (the local-file story) ---- */}
          <div className="rounded-xl border border-violet-200 bg-violet-50/40 p-3 dark:border-violet-500/30 dark:bg-violet-500/5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-bold"><RefreshCw className="h-4 w-4 text-violet-600 dark:text-violet-400" />{ar ? 'الاستيراد التلقائي للملف المرفوع' : 'Automatic re-import of the uploaded file'}</div>
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input
                  type="checkbox" checked={Boolean(config.autoImport)} disabled={busy !== '' || !isAdmin}
                  onChange={(e) => void toggleAutoImport(e.target.checked)}
                  className="h-4 w-4 accent-violet-600 disabled:opacity-40"
                />
                <span>{ar ? 'استيراد تلقائي كل يوم' : 'Re-import daily'}</span>
                {!isAdmin && <span className="text-[10px] font-bold text-slate-400">({ar ? 'للأدمن' : 'admins'})</span>}
              </label>
            </div>
            <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
              {ar
                ? 'أي ملف ترفعه هنا بيتم استيراده فوراً، وبيتحفظ منه نسخة على السيرفر. لما تفعّل الاستيراد التلقائي، السيرفر هيعيد استيراد آخر نسخة كل يوم (حوالي 1 صباحاً) من غير أي خطوة منك — حدّث الملف عندك وارفعه مرة واحدة، والموقع هيفضل متزامن.'
                : 'Every file you upload here is imported immediately and a copy is saved on the server. With auto-import on, the server re-applies the latest copy every day (around 1 AM) with no further steps — update the file locally, upload it once, and the site stays in sync.'}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {config.hasStoredFile ? (
                <span className="inline-flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold dark:border-slate-700 dark:bg-slate-900" dir="ltr">
                  <FileSpreadsheet className="h-3.5 w-3.5 text-violet-600 dark:text-violet-300" />
                  {config.storedFileName ?? 'dashboard.xlsx'}
                  {config.storedFileSize ? <span className="text-slate-400">{Math.round(config.storedFileSize / 1024)} KB</span> : null}
                  {config.storedFileUploadedAt && <span className="text-slate-400">· {formatDateTime(config.storedFileUploadedAt, lang)}</span>}
                </span>
              ) : (
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{ar ? 'لا يوجد ملف محفوظ بعد — ارفع ملف في القسم ١.' : 'No stored file yet — upload one in section 1.'}</span>
              )}
              <button
                type="button" disabled={busy !== '' || !config.hasStoredFile} onClick={reApplyStored}
                className="inline-flex items-center gap-1.5 rounded-lg border border-violet-300 bg-white px-3 py-2 text-xs font-black text-violet-700 hover:bg-violet-50 disabled:opacity-50 dark:border-violet-500/40 dark:bg-slate-900 dark:text-violet-300 dark:hover:bg-violet-500/10"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${busy === 'reapply' ? 'animate-spin' : ''}`} />
                {busy === 'reapply' ? (ar ? 'جاري الاستيراد...' : 'Importing...') : (ar ? 'استيراد الملف المحفوظ الآن' : 'Import stored file now')}
              </button>
              {isAdmin && (
                <button
                  type="button" disabled={busy !== '' || !config.hasStoredFile} onClick={() => void removeStoredFile()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-red-50 hover:text-red-700 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                >
                  {ar ? 'حذف النسخة المحفوظة' : 'Remove stored copy'}
                </button>
              )}
            </div>
            {!isAdmin && config.lastSyncAt && (
              <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                {ar ? 'آخر استيراد تلقائي: ' : 'Last auto-import: '}{formatDateTime(config.lastSyncAt, lang)}
                {config.lastSyncStatus === 'error' && <span className="ms-2 font-bold text-red-600 dark:text-red-400">({ar ? 'فشل' : 'failed'})</span>}
              </div>
            )}
            {storedNote && <div className="mt-2 rounded-lg bg-violet-50 p-2.5 text-xs font-semibold text-violet-700 dark:bg-violet-500/10 dark:text-violet-300">{storedNote}</div>}
          </div>

          {/* ---- Section 2: URL auto-sync (admins) ---- */}
          {isAdmin && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/60">
              <div className="flex items-center gap-2 font-bold"><Link2 className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />{ar ? '٢) مزامنة تلقائية من رابط الملف (للأدمن)' : '2) Auto-sync from a file URL (admins)'}</div>
              <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
                {ar
                  ? 'لو ملف الإكسل عندك على OneDrive أو Google Drive أو أي موقع: ارفع الرابط المباشر للملف هنا، والنظام هنزّل ويستورد البيانات يومياً تلقائي (لو المزامنة التلقائية مفعلة). في OneDrive: شارك الملف ← «نسخ الرابط» وحوّله لرابط تنزيل مباشر (أو استخدم رابط تنزيل من Google Drive بصيغة uc?export=download).'
                  : 'If your Excel file lives on OneDrive, Google Drive or any website: paste the direct download link here and the system will download and import it daily when auto-sync is on. For OneDrive: share ← copy link and convert it to a direct download link; for Google Drive use the uc?export=download form.'}
              </p>
              <label className="mt-3 block">
                <span className="mb-1 block text-xs font-bold text-slate-600 dark:text-slate-300">{ar ? 'رابط تنزيل مباشر لملف الإكسل' : 'Direct download URL of the Excel file'}</span>
                <input
                  dir="ltr" type="url" inputMode="url" autoComplete="off" spellCheck={false}
                  value={urlDraft.sourceUrl}
                  onChange={(e) => setUrlDraft((d) => ({ ...d, sourceUrl: e.target.value }))}
                  placeholder="https://onedrive.live.com/download?..."
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </label>
              <label className="mt-2 block text-xs">
                <span className="mb-1 block font-bold text-slate-600 dark:text-slate-300">{ar ? 'الباسورد الافتراضي للموظفين الجدد (اختياري — لو فاضي هيفضل القديم)' : 'Default password for new employees (optional — empty keeps the saved one)'}</span>
                <input
                  dir="ltr" type="text" autoComplete="off" spellCheck={false}
                  value={urlDraft.defaultPin}
                  onChange={(e) => setUrlDraft((d) => ({ ...d, defaultPin: e.target.value }))}
                  placeholder={config.hasDefaultPin ? '••••' : '1234'}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </label>
              <label className="mt-2 flex items-center gap-2 text-sm font-semibold">
                <input type="checkbox" checked={urlDraft.autoSync} onChange={(e) => setUrlDraft((d) => ({ ...d, autoSync: e.target.checked }))} className="h-4 w-4 accent-cyan-600" />
                <span>{ar ? 'مزامنة تلقائية يومية (كرون يومي على السيرفر)' : 'Daily automatic sync (server cron)'}</span>
              </label>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" disabled={busy !== ''} onClick={saveUrlConfig} className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-50"><Save className="h-4 w-4" />{busy === 'save' ? (ar ? 'جاري الحفظ...' : 'Saving...') : (ar ? 'حفظ' : 'Save')}</button>
                <button type="button" disabled={busy !== '' || !(urlDraft.sourceUrl.trim() || config.sourceUrl)} onClick={syncFromUrl} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"><RefreshCw className={`h-4 w-4 ${busy === 'sync' ? 'animate-spin' : ''}`} />{busy === 'sync' ? (ar ? 'جاري المزامنة...' : 'Syncing...') : (ar ? 'استيراد من الرابط الآن' : 'Import from URL now')}</button>
              </div>
              <div className="mt-3 rounded-lg border border-slate-200 bg-white p-2.5 text-xs dark:border-slate-700 dark:bg-slate-900">
                <div className="font-bold text-slate-600 dark:text-slate-300">{ar ? 'آخر مزامنة تلقائية' : 'Last auto-sync'}</div>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span>{formatDateTime(config.lastSyncAt, lang)}</span>
                  {config.lastSyncStatus === 'ok' && <span className="rounded-lg bg-emerald-50 px-2 py-1 text-[10px] font-black text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">{ar ? 'نجحت' : 'OK'}</span>}
                  {config.lastSyncStatus === 'error' && <span className="rounded-lg bg-red-50 px-2 py-1 text-[10px] font-black text-red-700 dark:bg-red-500/15 dark:text-red-300">{ar ? 'فشلت' : 'Failed'}</span>}
                </div>
                {config.lastSyncSummary && <div className="mt-1 text-slate-600 dark:text-slate-300">{config.lastSyncSummary}</div>}
                {config.lastSyncStatus === 'error' && config.lastSyncError && <div className="mt-1 break-words text-red-700 dark:text-red-300" dir="ltr">{config.lastSyncError}</div>}
              </div>
            </div>
          )}

          <p className="text-[11px] leading-5 text-slate-400 dark:text-slate-500">
            {ar
              ? 'ملاحظات: الأعمدة بتتعرف بمرونة (الاسم / اسم الموظف / Name، الكود / Code، الشيفت / الوردية / Shift، التاريخ / Date، تواريخ 25/10 أو 2026-10-25 أو أسماء الأيام). بيانات الحضور والبريكات مش بتستورد من هنا. الاستيراد التلقائي بيعيد تطبيق آخر ملف مرفوع — يعني تعديلات الجدول اليدوية على الموقع هتترجع لبيانات الملف. كل عملية بتسجل في سجل النشاط.'
              : 'Notes: columns are matched flexibly (Name / اسم الموظف, Code / الكود, Shift / الوردية, Date / التاريخ, dates like 25/10 or 2026-10-25 or weekday names). Attendance and breaks are not imported here. Auto-import re-applies the latest uploaded file — manual schedule edits made in the app are replaced by the file data. Every run is recorded in the activity log.'}
          </p>
        </>}
      </div>
    </div>
  </div>;
}

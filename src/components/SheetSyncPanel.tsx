import React, { useCallback, useEffect, useState } from 'react';
import { FileSpreadsheet, X, Save, RefreshCw, PlugZap, Copy, Check, ExternalLink } from 'lucide-react';
import { Employee, Language } from '../types';
import { authHeaders, errorToMessage, extractApiError, parseResponse } from '../utils/errors';

/**
 * Google Sheets dashboard sync panel — leaders/admins only.
 *
 * Connects the app to a Google Apps Script Web App deployed from the user's
 * dashboard spreadsheet. The script receives one tabular payload per dataset
 * and writes it into dedicated feed tabs (Employees, Attendance, Leaves,
 * Overtime, Schedule, Breaks, BreakRequests, Swaps, Shifts). Setup steps and
 * the exact script code are embedded below with a copy button, so the whole
 * flow needs no external documentation.
 */

const APPS_SCRIPT_CODE = [
  '/** Tech-Source → Google Sheets (dashboard feed) — paste into Apps Script */',
  "var SYNC_TOKEN = ''; // optional: same token from the website (recommended)",
  'var SAVE_EXCEL_TO_DRIVE = false;',
  "var DRIVE_FOLDER_ID = '';",
  '',
  'function doPost(e) {',
  '  var lock = LockService.getScriptLock();',
  '  try {',
  '    lock.waitLock(28000);',
  '    var body = JSON.parse(e.postData.contents);',
  "    if (SYNC_TOKEN && String(body.token || '') !== SYNC_TOKEN) return reply({ ok: false, error: 'invalid token' });",
  '    var ss = SpreadsheetApp.getActiveSpreadsheet();',
  '    var sheets = body.sheets || {};',
  '    var written = [];',
  '    for (var name in sheets) {',
  '      var block = sheets[name] || {};',
  "      var rows = (block.rows || []).map(function (r) { return r.map(function (c) { return (c === null || c === undefined) ? '' : c; }); });",
  '      var header = block.header || [];',
  '      var sh = getOrCreate(ss, name);',
  '      sh.clearContents();',
  '      var values = header.length ? [header].concat(rows) : rows;',
  '      if (values.length && values[0].length) {',
  '        sh.getRange(1, 1, values.length, values[0].length).setValues(values);',
  '      }',
  '      sh.setFrozenRows(header.length ? 1 : 0);',
  "      written.push(name + '=' + rows.length);",
  '    }',
  "    var meta = getOrCreate(ss, '_SyncInfo');",
  '    meta.clearContents();',
  '    meta.getRange(1, 1, 3, 2).setValues([',
  "      ['Last sync (UTC)', body.generatedAt || new Date().toISOString()],",
  "      ['Source', body.source || 'tech-source'],",
  "      ['Rows', written.join(', ')]",
  '    ]);',
  '    if (SAVE_EXCEL_TO_DRIVE && DRIVE_FOLDER_ID) {',
  "      var stamp = Utilities.formatDate(new Date(), 'Africa/Cairo', 'yyyy-MM-dd_HH-mm');",
  "      var blob = ss.getBlob().setName('Tech-Source-' + stamp + '.xlsx');",
  '      DriveApp.getFolderById(DRIVE_FOLDER_ID).createFile(blob);',
  '    }',
  "    return reply({ ok: true, written: written.join(', ') });",
  '  } catch (err) {',
  "    return reply({ ok: false, error: String(err) });",
  '  } finally {',
  '    try { lock.releaseLock(); } catch (ignored) {}',
  '  }',
  '}',
  '',
  'function doGet() {',
  "  return reply({ ok: true, service: 'tech-source-sheet-sync', time: new Date().toISOString() });",
  '}',
  '',
  'function reply(obj) {',
  '  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);',
  '}',
  '',
  'function getOrCreate(ss, name) {',
  '  var sh = ss.getSheetByName(name);',
  '  if (!sh) sh = ss.insertSheet(name);',
  '  return sh;',
  '}',
].join('\n');

interface SheetSyncConfigDto {
  webhookUrl: string;
  token: string;
  autoSync: boolean;
}

interface SheetSyncStatusDto {
  lastSyncAt: string | null;
  lastSyncStatus: 'ok' | 'error' | null;
  lastSyncError: string | null;
  lastSyncCounts: Record<string, number> | null;
}

interface Props {
  lang: Language;
  currentUser: Employee | null;
  onClose: () => void;
}

const formatDateTime = (iso: string | null | undefined, lang: Language): string => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-GB', { timeZone: 'Africa/Cairo', dateStyle: 'medium', timeStyle: 'short' });
  } catch { return iso; }
};

const SHEET_LABELS: Record<string, { ar: string; en: string }> = {
  Employees: { ar: 'الموظفين', en: 'Employees' },
  Attendance: { ar: 'الحضور والانصراف', en: 'Attendance' },
  Leaves: { ar: 'الإجازات', en: 'Leaves' },
  Overtime: { ar: 'الإضافي', en: 'Overtime' },
  Schedule: { ar: 'جدول الورديات', en: 'Schedule' },
  Breaks: { ar: 'البريكات', en: 'Breaks' },
  BreakRequests: { ar: 'طلبات البريك', en: 'Break requests' },
  Swaps: { ar: 'تبديل الشيفت', en: 'Swaps' },
  Shifts: { ar: 'الورديات', en: 'Shifts' },
};

export const SheetSyncPanel = ({ lang, currentUser, onClose }: Props) => {
  const isAdmin = ['admin', 'company_admin', 'platform_admin'].includes(String(currentUser?.role || ''));
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'' | 'save' | 'test' | 'run'>('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [config, setConfig] = useState<SheetSyncConfigDto>({ webhookUrl: '', token: '', autoSync: false });
  const [status, setStatus] = useState<SheetSyncStatusDto>({ lastSyncAt: null, lastSyncStatus: null, lastSyncError: null, lastSyncCounts: null });
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/sheet-sync', {
        credentials: 'include', cache: 'no-store',
        headers: authHeaders({ Accept: 'application/json', 'Cache-Control': 'no-cache' }),
      });
      const data = await parseResponse(response);
      if (!response.ok || data?.success === false) throw new Error(extractApiError(data, lang === 'ar' ? 'تعذر تحميل إعدادات الربط' : 'Could not load the sync settings'));
      setConfig({
        webhookUrl: String(data?.config?.webhookUrl || ''),
        token: String(data?.config?.token || ''),
        autoSync: Boolean(data?.config?.autoSync),
      });
      setStatus({
        lastSyncAt: data?.status?.lastSyncAt ?? null,
        lastSyncStatus: data?.status?.lastSyncStatus ?? null,
        lastSyncError: data?.status?.lastSyncError ?? null,
        lastSyncCounts: data?.status?.lastSyncCounts ?? null,
      });
    } catch (err: unknown) {
      setError(errorToMessage(err, lang === 'ar' ? 'تعذر تحميل إعدادات الربط' : 'Could not load the sync settings'));
    } finally {
      setLoading(false);
    }
  }, [lang]);

  useEffect(() => { void load(); }, [load]);

  const saveConfig = async () => {
    setBusy('save'); setError(''); setNotice('');
    try {
      const response = await fetch('/api/sheet-sync', {
        method: 'PUT', credentials: 'include', cache: 'no-store',
        headers: authHeaders({ 'Content-Type': 'application/json', Accept: 'application/json' }),
        body: JSON.stringify({ webhookUrl: config.webhookUrl.trim(), token: config.token.trim(), autoSync: config.autoSync }),
      });
      const data = await parseResponse(response);
      if (response.status === 401) throw new Error(lang === 'ar' ? 'انتهت الجلسة. سجّل الدخول من جديد.' : 'Session ended. Please sign in again.');
      if (!response.ok || data?.success === false) throw new Error(extractApiError(data, lang === 'ar' ? 'تعذر حفظ الإعدادات' : 'Could not save the settings'));
      setNotice(lang === 'ar' ? 'تم حفظ إعدادات الربط' : 'Sync settings saved');
    } catch (err: unknown) {
      setError(errorToMessage(err, lang === 'ar' ? 'تعذر حفظ الإعدادات' : 'Could not save the settings'));
    } finally { setBusy(''); }
  };

  const testConnection = async () => {
    setBusy('test'); setError(''); setNotice('');
    try {
      const response = await fetch('/api/sheet-sync-test', {
        method: 'POST', credentials: 'include', cache: 'no-store',
        headers: authHeaders({ 'Content-Type': 'application/json', Accept: 'application/json' }),
        body: JSON.stringify({ webhookUrl: config.webhookUrl.trim() }),
      });
      const data = await parseResponse(response);
      if (response.status === 401) throw new Error(lang === 'ar' ? 'انتهت الجلسة. سجّل الدخول من جديد.' : 'Session ended. Please sign in again.');
      if (data?.success === true) {
        setNotice(lang === 'ar' ? 'الاتصال بالشيت يعمل بنجاح ✓' : 'Connection to the sheet works ✓');
      } else {
        throw new Error(extractApiError(data, lang === 'ar' ? 'تعذر الاتصال بالسكريبت — راجع خطوات النشر' : 'Could not reach the script — recheck the deployment steps'));
      }
    } catch (err: unknown) {
      setError(errorToMessage(err, lang === 'ar' ? 'تعذر الاتصال بالسكريبت — راجع خطوات النشر' : 'Could not reach the script — recheck the deployment steps'));
    } finally { setBusy(''); }
  };

  const syncNow = async () => {
    setBusy('run'); setError(''); setNotice('');
    try {
      const response = await fetch('/api/sheet-sync-run', {
        method: 'POST', credentials: 'include', cache: 'no-store',
        headers: authHeaders({ 'Content-Type': 'application/json', Accept: 'application/json' }),
        body: JSON.stringify({ force: true }),
      });
      const data = await parseResponse(response);
      if (response.status === 401) throw new Error(lang === 'ar' ? 'انتهت الجلسة. سجّل الدخول من جديد.' : 'Session ended. Please sign in again.');
      if (!response.ok || data?.success === false) throw new Error(extractApiError(data, lang === 'ar' ? 'فشلت المزامنة' : 'Sync failed'));
      await load();
      setNotice(lang === 'ar' ? 'تمت مزامنة الداش بورد بنجاح ✓' : 'Dashboard synced successfully ✓');
    } catch (err: unknown) {
      setError(errorToMessage(err, lang === 'ar' ? 'فشلت المزامنة' : 'Sync failed'));
    } finally { setBusy(''); }
  };

  const copyScript = async () => {
    try {
      await navigator.clipboard.writeText(APPS_SCRIPT_CODE);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      try {
        const area = document.createElement('textarea');
        area.value = APPS_SCRIPT_CODE;
        document.body.appendChild(area);
        area.select();
        document.execCommand('copy');
        document.body.removeChild(area);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      } catch { /* clipboard unavailable */ }
    }
  };

  const counts = status.lastSyncCounts && Object.keys(status.lastSyncCounts).length
    ? Object.entries(status.lastSyncCounts)
        .filter(([, value]) => Number(value) > 0)
        .map(([name, value]) => {
          const label = SHEET_LABELS[name];
          return `${lang === 'ar' && label ? label.ar : name}: ${value}`;
        })
        .join(' · ')
    : '';

  return <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label={lang === 'ar' ? 'ربط Google Sheets' : 'Google Sheets sync'}>
    <div className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-700">
        <h2 className="flex items-center gap-2 font-black"><FileSpreadsheet className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />{lang === 'ar' ? 'ربط Google Sheets — داش بورد تلقائي' : 'Google Sheets sync — auto dashboard'}</h2>
        <button type="button" onClick={onClose} aria-label={lang === 'ar' ? 'إغلاق الربط' : 'Close Google Sheets sync'} className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-slate-700 transition hover:bg-red-100 hover:text-red-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-red-500/20"><X className="h-5 w-5" /></button>
      </div>

      <div className="max-h-[70vh] space-y-4 overflow-y-auto px-4 py-4">
        {loading ? (
          <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">{lang === 'ar' ? 'جاري التحميل...' : 'Loading...'}</div>
        ) : <>
          {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-500/15 dark:text-red-300">{error}</div>}
          {notice && !error && <div className="rounded-lg bg-emerald-50 p-3 text-sm font-bold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">{notice}</div>}

          {/* Steps */}
          <details className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-800 dark:bg-slate-800/60" open={!config.webhookUrl}>
            <summary className="cursor-pointer font-bold">{lang === 'ar' ? 'خطوات الربط (مرة واحدة فقط)' : 'Setup steps (one time only)'}</summary>
            <ol className="mt-3 list-decimal space-y-2 ps-5 leading-6 text-slate-700 dark:text-slate-200">
              <li>{lang === 'ar' ? 'افتح شيت الداش بورد بتاعك في Google Sheets.' : 'Open your dashboard spreadsheet in Google Sheets.'}</li>
              <li>{lang === 'ar' ? 'من القائمة: الإضافات (Extensions) ← Apps Script.' : 'Menu: Extensions ← Apps Script.'}</li>
              <li>{lang === 'ar' ? 'امسح أي كود موجود والصق الكود بتاعنا (زر نسخ الكود تحت).' : 'Clear any existing code and paste ours (copy button below).'}</li>
              <li>{lang === 'ar' ? 'اضغط Deploy ← New deployment ← اختر Web app، واجعل Execute as = Me و Who has access = Anyone، ثم Deploy.' : 'Deploy ← New deployment ← Web app, set Execute as = Me and Who has access = Anyone, then Deploy.'}</li>
              <li>{lang === 'ar' ? 'انسخ الـ URL اللي هيظهر (بينتهي بـ /exec) والصقه في خانة الرابط هنا، ثم احفظ.' : 'Copy the URL shown (it ends with /exec), paste it below, then save.'}</li>
              <li>{lang === 'ar' ? 'اضغط «اختبار الاتصال» ثم «مزامنة الآن» — هتلاقي الشيتات اتحدثت تلقائي.' : 'Click "Test connection" then "Sync now" — the tabs will update automatically.'}</li>
            </ol>
            <p className="mt-3 rounded-lg bg-amber-50 p-2.5 text-xs leading-5 text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
              {lang === 'ar'
                ? 'ملاحظة: البيانات بتتكتب في شيتات مخصصة (Employees / Attendance / Leaves / Overtime / Schedule / Breaks / BreakRequests / Swaps / Shifts) والشيتات الأصلية عندك متتلمسش — الداش بورد بتاعك يقدر يقرأ منهم عادي. كذلك PINات الموظفين مش بتتبعت أبداً.'
                : 'Note: data is written to dedicated tabs (Employees / Attendance / Leaves / Overtime / Schedule / Breaks / BreakRequests / Swaps / Shifts); your existing tabs are never touched — your dashboard can read from them. Employee PINs are never sent.'}
            </p>
            <button type="button" onClick={copyScript} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white dark:bg-slate-700">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? (lang === 'ar' ? 'تم النسخ ✓' : 'Copied ✓') : (lang === 'ar' ? 'نسخ كود Apps Script' : 'Copy Apps Script code')}
            </button>
          </details>

          {/* Form */}
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-slate-600 dark:text-slate-300">{lang === 'ar' ? 'رابط الـ Web App (بينتهي بـ /exec)' : 'Web App URL (ends with /exec)'}</span>
              <input
                dir="ltr" type="url" inputMode="url" autoComplete="off" spellCheck={false}
                value={config.webhookUrl}
                onChange={e => setConfig(c => ({ ...c, webhookUrl: e.target.value }))}
                placeholder="https://script.google.com/macros/s/AKfy.../exec"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-slate-600 dark:text-slate-300">{lang === 'ar' ? 'توكن اختياري للحماية (نفس اللي في السكريبت)' : 'Optional security token (same one in the script)'}</span>
              <input
                dir="ltr" type="text" autoComplete="off" spellCheck={false}
                value={config.token}
                onChange={e => setConfig(c => ({ ...c, token: e.target.value }))}
                placeholder={lang === 'ar' ? 'اتركه فارغ لو مش مستخدمه' : 'Leave empty if unused'}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </label>
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input type="checkbox" checked={config.autoSync} onChange={e => setConfig(c => ({ ...c, autoSync: e.target.checked }))} className="h-4 w-4 accent-emerald-600" />
              <span>{lang === 'ar' ? 'مزامنة تلقائية: أول مدير يفتح التطبيق يحدّث الشيت (لو آخر مزامنة أقدم من ١٢ ساعة)' : 'Auto-sync: the first manager opening the app refreshes the sheet (if the last sync is older than 12h)'}</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {isAdmin && <button type="button" disabled={busy !== ''} onClick={saveConfig} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-50"><Save className="h-4 w-4" />{busy === 'save' ? (lang === 'ar' ? 'جاري الحفظ...' : 'Saving...') : (lang === 'ar' ? 'حفظ' : 'Save')}</button>}
              <button type="button" disabled={busy !== '' || !config.webhookUrl.trim()} onClick={testConnection} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"><PlugZap className="h-4 w-4" />{busy === 'test' ? (lang === 'ar' ? 'جاري الاختبار...' : 'Testing...') : (lang === 'ar' ? 'اختبار الاتصال' : 'Test connection')}</button>
              <button type="button" disabled={busy !== '' || !config.webhookUrl.trim()} onClick={syncNow} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"><RefreshCw className={`h-4 w-4 ${busy === 'run' ? 'animate-spin' : ''}`} />{busy === 'run' ? (lang === 'ar' ? 'جاري المزامنة...' : 'Syncing...') : (lang === 'ar' ? 'مزامنة الآن' : 'Sync now')}</button>
              <a href="https://script.google.com/home" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"><ExternalLink className="h-4 w-4" />{lang === 'ar' ? 'فتح Apps Script' : 'Open Apps Script'}</a>
            </div>
            {!isAdmin && <p className="text-xs text-slate-500 dark:text-slate-400">{lang === 'ar' ? 'تغيير الإعدادات متاح للأدمن فقط — باقي الأزرار شغالة عادي.' : 'Only admins can change settings — the other buttons work normally.'}</p>}
          </div>

          {/* Status */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-800 dark:bg-slate-800/60">
            <div className="font-bold">{lang === 'ar' ? 'آخر مزامنة' : 'Last sync'}</div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span>{formatDateTime(status.lastSyncAt, lang)}</span>
              {status.lastSyncStatus === 'ok' && <span className="rounded-lg bg-emerald-50 px-2 py-1 text-[10px] font-black text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">{lang === 'ar' ? 'نجحت' : 'OK'}</span>}
              {status.lastSyncStatus === 'error' && <span className="rounded-lg bg-red-50 px-2 py-1 text-[10px] font-black text-red-700 dark:bg-red-500/15 dark:text-red-300">{lang === 'ar' ? 'فشلت' : 'Failed'}</span>}
            </div>
            {status.lastSyncStatus === 'error' && status.lastSyncError && <div className="mt-2 break-words text-xs text-red-700 dark:text-red-300">{status.lastSyncError}</div>}
            {counts && <div className="mt-2 text-xs text-slate-600 dark:text-slate-300">{lang === 'ar' ? 'الصفوف المرسلة: ' : 'Rows sent: '}{counts}</div>}
          </div>

          {/* Script source */}
          <details className="rounded-xl border border-slate-200 dark:border-slate-800">
            <summary className="cursor-pointer px-3 py-2.5 text-sm font-bold">{lang === 'ar' ? 'عرض كود Apps Script' : 'Show Apps Script code'}</summary>
            <pre dir="ltr" className="mx-3 mb-3 max-h-72 overflow-auto rounded-lg bg-slate-900 p-3 text-[11px] leading-5 text-slate-100">{APPS_SCRIPT_CODE}</pre>
          </details>
        </>}
      </div>
    </div>
  </div>;
};

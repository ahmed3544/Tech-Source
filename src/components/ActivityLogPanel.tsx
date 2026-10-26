import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollText, RefreshCw, X } from 'lucide-react';
import { Employee, Language } from '../types';
import { authHeaders, errorToMessage, extractApiError, parseResponse } from '../utils/errors';

/**
 * Activity log (audit trail) panel — leaders/admins only.
 * Shows who changed what: employees, schedule edits, Excel imports, breaks,
 * break-change requests, shift swaps and sign-ins. Newest first, with
 * category / actor / period filters. Bilingual (ar/en), dark-mode aware.
 */

interface ActivityLogRow {
  id: string;
  actorId: string;
  actorName: string | null;
  actorRole: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  entityLabel: string | null;
  details: string | null;
  createdAt: string;
}

interface Props {
  lang: Language;
  currentUser: Employee | null;
  onClose: () => void;
}

const CATEGORY_OF_ACTION = (action: string): string => action.split('.')[0];

const CATEGORY_STYLES: Record<string, string> = {
  employee: 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
  schedule: 'bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
  breaks: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  break_request: 'bg-pink-50 text-pink-700 dark:bg-pink-500/15 dark:text-pink-300',
  swap: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  sheet: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300',
  auth: 'bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300',
};

const ACTION_LABELS: Record<string, { ar: string; en: string }> = {
  'employee.create': { ar: 'إضافة موظف', en: 'Employee created' },
  'employee.update': { ar: 'تعديل موظف', en: 'Employee updated' },
  'employee.delete': { ar: 'حذف موظف', en: 'Employee deleted' },
  'schedule.update': { ar: 'تعديل الجدول', en: 'Schedule updated' },
  'schedule.import_excel': { ar: 'استيراد Excel', en: 'Excel import' },
  'breaks.update': { ar: 'تعديل البريكات', en: 'Breaks updated' },
  'break_request.submit': { ar: 'طلب تغيير بريك', en: 'Break request sent' },
  'break_request.approve': { ar: 'اعتماد طلب بريك', en: 'Break request approved' },
  'break_request.reject': { ar: 'رفض طلب بريك', en: 'Break request rejected' },
  'swap.submit': { ar: 'طلب تبديل شيفت', en: 'Swap requested' },
  'swap.accept': { ar: 'قبول تبديل الشيفت', en: 'Swap accepted' },
  'swap.reject': { ar: 'رفض تبديل الشيفت', en: 'Swap rejected' },
  'swap.approve': { ar: 'اعتماد تبديل الشيفت', en: 'Swap approved' },
  'swap.cancel': { ar: 'إلغاء التبديل', en: 'Swap cancelled' },
  'auth.login': { ar: 'تسجيل دخول', en: 'Signed in' },
  'sheet.config': { ar: 'تحديث رابط Google Sheets', en: 'Google Sheets link updated' },
  'sheet.sync': { ar: 'مزامنة Google Sheets', en: 'Google Sheets sync' },
  'sheet.sync_failed': { ar: 'فشل مزامنة Google Sheets', en: 'Google Sheets sync failed' },
};

const CATEGORIES: Array<{ value: string; ar: string; en: string }> = [
  { value: '', ar: 'كل الأنواع', en: 'All types' },
  { value: 'employee', ar: 'الموظفون', en: 'Employees' },
  { value: 'schedule', ar: 'الجدول', en: 'Schedule' },
  { value: 'breaks', ar: 'البريكات', en: 'Breaks' },
  { value: 'break_request', ar: 'طلبات البريك', en: 'Break requests' },
  { value: 'swap', ar: 'تبديل الشيفت', en: 'Shift swap' },
  { value: 'sheet', ar: 'مزامنة الشيت', en: 'Sheet sync' },
  { value: 'auth', ar: 'تسجيل الدخول', en: 'Sign-ins' },
];

const PERIODS: Array<{ value: string; ar: string; en: string; days: number }> = [
  { value: 'all', ar: 'كل الفترات', en: 'All time', days: 0 },
  { value: 'today', ar: 'اليوم', en: 'Today', days: 1 },
  { value: '7d', ar: 'آخر ٧ أيام', en: 'Last 7 days', days: 7 },
  { value: '30d', ar: 'آخر ٣٠ يوم', en: 'Last 30 days', days: 30 },
];

/** Short human-readable summary of the JSON details column. */
const describeDetails = (row: ActivityLogRow, lang: Language): string => {
  if (!row.details) return '';
  try {
    const d = JSON.parse(row.details) as any;
    if (row.action === 'schedule.update' || row.action === 'schedule.import_excel') {
      const bits: string[] = [];
      if (Number.isFinite(d.changes)) bits.push(lang === 'ar' ? `${d.changes} تعديل` : `${d.changes} change(s)`);
      if (Number.isFinite(d.breakDays) && d.breakDays > 0) bits.push(lang === 'ar' ? `${d.breakDays} يوم بريكات` : `${d.breakDays} break day(s)`);
      if (Array.isArray(d.items) && d.items.length) {
        bits.push(d.items.slice(0, 3).map((it: any) => {
          const to = it.to === null ? (lang === 'ar' ? 'مسح' : 'cleared') : String(it.to ?? '');
          const from = it.from === null ? (lang === 'ar' ? 'فارغ' : 'empty') : String(it.from ?? '');
          return `${it.date}: ${from}→${to}`;
        }).join(' · '));
        if (d.items.length > 3) bits.push(lang === 'ar' ? `+${d.items.length - 3} آخرين` : `+${d.items.length - 3} more`);
      }
      return bits.filter(Boolean).join(' — ');
    }
    if (row.action === 'breaks.update' && Array.isArray(d.breaks)) {
      return (d.breaks as string[]).slice(0, 4).join(' · ') + (d.breaks.length > 4 ? (lang === 'ar' ? ` +${d.breaks.length - 4}` : ` +${d.breaks.length - 4}`) : '');
    }
    if (row.action.startsWith('break_request') && (d.from !== undefined || d.to !== undefined || d.proposed)) {
      const to = d.to ?? d.proposed ?? '';
      return [d.from ? `${lang === 'ar' ? 'من' : 'from'} ${d.from}` : '', to ? `${lang === 'ar' ? 'إلى' : 'to'} ${to}` : ''].filter(Boolean).join(' ');
    }
    if (row.action === 'employee.update' && Array.isArray(d.fields)) {
      return `${lang === 'ar' ? 'الحقول:' : 'Fields:'} ${(d.fields as string[]).slice(0, 6).join(', ')}`;
    }
    return '';
  } catch {
    return '';
  }
};

const formatTime = (iso: string, lang: Language): string => {
  try {
    const d = new Date(iso);
    const date = d.toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const time = d.toLocaleTimeString(lang === 'ar' ? 'ar-EG' : 'en-GB', { hour: '2-digit', minute: '2-digit' });
    return `${date} · ${time}`;
  } catch {
    return iso;
  }
};

export const ActivityLogPanel: React.FC<Props> = ({ lang, onClose }) => {
  const [rows, setRows] = useState<ActivityLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [category, setCategory] = useState('');
  const [period, setPeriod] = useState('30d');
  const [actor, setActor] = useState('');
  const [reloadTick, setReloadTick] = useState(0);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/activity-logs?limit=300', {
        credentials: 'include', cache: 'no-store',
        headers: authHeaders({ Accept: 'application/json', 'Cache-Control': 'no-cache' }),
      });
      const data = await parseResponse(response);
      if (!response.ok || data?.success === false) throw new Error(extractApiError(data, lang === 'ar' ? 'تعذر تحميل السجل' : 'Could not load the activity log'));
      setRows(Array.isArray(data?.logs) ? data.logs : []);
    } catch (err: unknown) {
      setError(errorToMessage(err, lang === 'ar' ? 'تعذر تحميل السجل' : 'Could not load the activity log'));
    } finally {
      setLoading(false);
    }
  }, [lang]);

  useEffect(() => { void load(); }, [load, reloadTick]);

  const actors = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows) if (!map.has(r.actorId)) map.set(r.actorId, r.actorName || r.actorId);
    return Array.from(map.entries());
  }, [rows]);

  const visible = useMemo(() => {
    const periodDays = PERIODS.find(p => p.value === period)?.days ?? 0;
    const minTime = periodDays === 0 ? 0 : (periodDays === 1 ? new Date().setHours(0, 0, 0, 0) : Date.now() - periodDays * 86_400_000);
    return rows.filter(r =>
      (!category || CATEGORY_OF_ACTION(r.action) === category) &&
      (!actor || r.actorId === actor) &&
      (minTime === 0 || new Date(r.createdAt).getTime() >= minTime)
    );
  }, [rows, category, actor, period]);

  return <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label={lang === 'ar' ? 'سجل النشاط' : 'Activity log'}>
    <div className="w-full max-w-4xl rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-700">
        <h2 className="flex items-center gap-2 font-black"><ScrollText className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />{lang === 'ar' ? 'سجل النشاط — مين عدّل إيه' : 'Activity log — who changed what'}</h2>
        <button type="button" onClick={onClose} aria-label={lang === 'ar' ? 'إغلاق السجل' : 'Close activity log'} className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-slate-700 transition hover:bg-red-100 hover:text-red-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-red-500/20"><X className="h-5 w-5" /></button>
      </div>

      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        <select value={category} onChange={e => setCategory(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
          {CATEGORIES.map(c => <option key={c.value} value={c.value}>{lang === 'ar' ? c.ar : c.en}</option>)}
        </select>
        <select value={period} onChange={e => setPeriod(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
          {PERIODS.map(p => <option key={p.value} value={p.value}>{lang === 'ar' ? p.ar : p.en}</option>)}
        </select>
        <select value={actor} onChange={e => setActor(e.target.value)} className="max-w-[220px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
          <option value="">{lang === 'ar' ? 'كل المستخدمين' : 'Everyone'}</option>
          {actors.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
        <button type="button" onClick={() => setReloadTick(t => t + 1)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />{lang === 'ar' ? 'تحديث' : 'Refresh'}</button>
        <span className="ms-auto text-xs text-slate-500 dark:text-slate-400">{loading ? (lang === 'ar' ? 'جاري التحميل...' : 'Loading...') : (lang === 'ar' ? `${visible.length} حركة` : `${visible.length} entries`)}</span>
      </div>

      {error && <div className="mx-4 mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-500/15 dark:text-red-300">{error}</div>}

      <div className="max-h-[65vh] overflow-y-auto px-4 pb-4">
        {loading && !rows.length ? (
          <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">{lang === 'ar' ? 'جاري تحميل السجل...' : 'Loading the activity log...'}</div>
        ) : visible.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">{lang === 'ar' ? 'لا توجد حركات مطابقة للفلاتر.' : 'No entries match the filters.'}</div>
        ) : (
          <div className="space-y-2" data-testid="activity-log-rows">
            {visible.map(row => {
              const cat = CATEGORY_OF_ACTION(row.action);
              const label = ACTION_LABELS[row.action];
              const summary = describeDetails(row, lang);
              return <div key={row.id} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-800/60">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-lg px-2 py-1 text-[10px] font-black ${CATEGORY_STYLES[cat] || CATEGORY_STYLES.auth}`}>{label ? (lang === 'ar' ? label.ar : label.en) : row.action}</span>
                  <span className="text-sm font-bold">{row.actorName || row.actorId}</span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">{formatTime(row.createdAt, lang)}</span>
                </div>
                {(row.entityLabel || summary) && <div className="mt-1.5 text-xs leading-5 text-slate-600 dark:text-slate-300">
                  {row.entityLabel && <span className="font-semibold">{row.entityLabel}</span>}
                  {row.entityLabel && summary ? ' — ' : ''}
                  {summary && <span>{summary}</span>}
                </div>}
              </div>;
            })}
          </div>
        )}
      </div>
    </div>
  </div>;
};

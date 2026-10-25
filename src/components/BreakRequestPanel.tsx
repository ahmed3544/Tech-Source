import React, { useEffect, useMemo, useState } from 'react';
import { Check, Clock3, Coffee, Send, X } from 'lucide-react';
import { BreakChangeRequest, Employee, Language } from '../types';
import { ScheduleBreak } from '../utils/scheduleStatus';
import { authHeaders, errorToMessage, extractApiError, parseResponse } from '../utils/errors';

interface Props {
  employees: Employee[];
  currentUser: Employee | null;
  lang: Language;
  /** The selected employee's own breaks keyed by date — used to prefill "current break". */
  breaksByDate: Record<string, ScheduleBreak[]>;
  onAuthFailure?: () => void;
  /** Called after an approval that changed breaks (parent refreshes its cache). */
  onBreaksApproved?: (employeeId: string, date: string) => void;
}

const pad = (n: number) => String(n).padStart(2, '0');
const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const STATUS_CHIP: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  approved: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  rejected: 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
};

export const BreakRequestPanel: React.FC<Props> = ({ employees, currentUser, lang, breaksByDate, onAuthFailure, onBreaksApproved }) => {
  const [requests, setRequests] = useState<BreakChangeRequest[]>([]);
  const [date, setDate] = useState(todayKey);
  const [currentStart, setCurrentStart] = useState('');
  const [currentEnd, setCurrentEnd] = useState('');
  const [proposedStart, setProposedStart] = useState('');
  const [proposedEnd, setProposedEnd] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const isManager = ['leader', 'admin', 'company_admin', 'platform_admin'].includes(String(currentUser?.role || ''));
  const nameOf = (id: string) => {
    const e = employees.find((x) => x.id === id);
    return e ? (e.code ? `${e.code} - ` : '') + (lang === 'ar' ? e.nameAr || e.nameEn : e.nameEn || e.nameAr) : id;
  };
  const ownBreaksForDate = useMemo(() => (currentUser ? breaksByDate[date]?.filter((b) => b.startTime && b.endTime) ?? [] : []), [breaksByDate, date, currentUser]);

  const load = async () => {
    if (!currentUser) return;
    try {
      const response = await fetch('/api/break-requests?_=' + Date.now(), {
        cache: 'no-store',
        headers: authHeaders({ Accept: 'application/json', 'Cache-Control': 'no-cache' }),
      });
      if (response.status === 401) { onAuthFailure?.(); return; }
      const data = await parseResponse(response);
      if (data?.success && Array.isArray(data.requests)) setRequests(data.requests);
    } catch { /* requests are optional; the form stays usable */ }
  };

  useEffect(() => { void load(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [currentUser?.id]);

  // Prefill "current break" from the employee's actual planned breaks for that date.
  useEffect(() => {
    const first = ownBreaksForDate[0];
    setCurrentStart(first ? String(first.startTime) : '');
    setCurrentEnd(first ? String(first.endTime) : '');
  }, [date, ownBreaksForDate.length, currentUser?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    if (!currentUser || busy) return;
    setError(null); setMessage(null);
    if (!TIME_RE.test(proposedStart) || !TIME_RE.test(proposedEnd)) {
      setError(lang === 'ar' ? 'حدّد وقت البريك المقترح (من/إلى).' : 'Set the proposed break times (from/to).');
      return;
    }
    setBusy(true);
    try {
      const response = await fetch('/api/break-request', {
        method: 'POST', credentials: 'include', cache: 'no-store',
        headers: authHeaders({ 'Content-Type': 'application/json', Accept: 'application/json', 'Cache-Control': 'no-cache' }),
        body: JSON.stringify({
          date,
          currentStartTime: currentStart || undefined,
          currentEndTime: currentEnd || undefined,
          proposedStartTime: proposedStart,
          proposedEndTime: proposedEnd,
          reason: reason.trim() || undefined,
        }),
      });
      const data = await parseResponse(response);
      if (response.status === 401) { onAuthFailure?.(); return; }
      if (!response.ok || data?.success === false) throw new Error(extractApiError(data, lang === 'ar' ? 'تعذر إرسال الطلب' : 'Could not submit the request'));
      setMessage(lang === 'ar' ? `تم إرسال طلب تغيير البريك ليوم ${date}. سيصلك إشعار عند المراجعة.` : `Break change request for ${date} submitted. You will be notified after review.`);
      setProposedStart(''); setProposedEnd(''); setReason('');
      await load();
    } catch (err: unknown) {
      setError(errorToMessage(err, lang === 'ar' ? 'تعذر إرسال الطلب' : 'Could not submit the request'));
    } finally { setBusy(false); }
  };

  const review = async (request: BreakChangeRequest, action: 'approve' | 'reject') => {
    if (!isManager || busy) return;
    setError(null); setMessage(null);
    setBusy(true);
    try {
      const response = await fetch('/api/break-request-review', {
        method: 'POST', credentials: 'include', cache: 'no-store',
        headers: authHeaders({ 'Content-Type': 'application/json', Accept: 'application/json', 'Cache-Control': 'no-cache' }),
        body: JSON.stringify({ id: request.id, action }),
      });
      const data = await parseResponse(response);
      if (response.status === 401) { onAuthFailure?.(); return; }
      if (!response.ok || data?.success === false) throw new Error(extractApiError(data, lang === 'ar' ? 'تعذر تنفيذ المراجعة' : 'Could not review the request'));
      setMessage(action === 'approve'
        ? (lang === 'ar' ? 'تم اعتماد الطلب وتحديث الجدول وإشعار الموظف.' : 'Request approved: schedule updated and the employee was notified.')
        : (lang === 'ar' ? 'تم رفض الطلب وإشعار الموظف.' : 'Request rejected and the employee was notified.'));
      if (action === 'approve') onBreaksApproved?.(request.employeeId, request.date);
      await load();
    } catch (err: unknown) {
      setError(errorToMessage(err, lang === 'ar' ? 'تعذر تنفيذ المراجعة' : 'Could not review the request'));
    } finally { setBusy(false); }
  };

  const statusLabel = (s: string) => s === 'approved' ? (lang === 'ar' ? 'معتمد' : 'Approved') : s === 'rejected' ? (lang === 'ar' ? 'مرفوض' : 'Rejected') : (lang === 'ar' ? 'بانتظار المراجعة' : 'Pending review');

  return (
    <section className="rounded-2xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50 p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Coffee className="h-4 w-4 text-red-600 dark:text-red-400" />
        <h4 className="text-sm font-black text-slate-900 dark:text-slate-100">{lang === 'ar' ? 'طلب تغيير البريك' : 'Break Change Request'}</h4>
      </div>

      {currentUser && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
              {lang === 'ar' ? 'التاريخ' : 'Date'}
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
            </label>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
              {lang === 'ar' ? 'البريك الحالي — من' : 'Current break — from'}
              <input type="time" value={currentStart} onChange={(e) => setCurrentStart(e.target.value)} placeholder={lang === 'ar' ? 'لا يوجد' : 'none'} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
            </label>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
              {lang === 'ar' ? 'البريك الحالي — إلى' : 'Current break — to'}
              <input type="time" value={currentEnd} onChange={(e) => setCurrentEnd(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
            </label>
            <div className="grid grid-cols-2 gap-2 md:col-span-1">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {lang === 'ar' ? 'المقترح — من' : 'Proposed — from'}
                <input type="time" value={proposedStart} onChange={(e) => setProposedStart(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
              </label>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {lang === 'ar' ? 'المقترح — إلى' : 'Proposed — to'}
                <input type="time" value={proposedEnd} onChange={(e) => setProposedEnd(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
              </label>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 md:col-span-3">
              {lang === 'ar' ? 'السبب (اختياري)' : 'Reason (optional)'}
              <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder={lang === 'ar' ? 'اذكر سبب تغيير البريك' : 'Why do you need this change?'} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
            </label>
            <div className="flex items-end">
              <button type="button" onClick={submit} disabled={busy || !proposedStart || !proposedEnd} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-black text-white hover:bg-emerald-700 disabled:opacity-50">
                <Send className="h-3.5 w-3.5" />{lang === 'ar' ? 'إرسال الطلب للأدمن' : 'Send to admin'}
              </button>
            </div>
          </div>
          {ownBreaksForDate.length > 1 && (
            <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
              {lang === 'ar' ? `هذا اليوم فيه ${ownBreaksForDate.length} بريكات — تم تعبئة أول بريك كـ«حالي». اكتب أوقاته يدوياً إن أردت بريكاً آخر.` : `This day has ${ownBreaksForDate.length} breaks — the first one was prefilled as "current". Type its times manually if you meant another one.`}
            </p>
          )}
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs font-black text-slate-700 dark:text-slate-200"><Clock3 className="h-3.5 w-3.5" />{lang === 'ar' ? 'الطلبات' : 'Requests'}</div>
        {requests.length === 0 ? (
          <div className="text-xs text-slate-500 dark:text-slate-400">{lang === 'ar' ? 'لا توجد طلبات تغيير بريك.' : 'No break change requests.'}</div>
        ) : requests.map((r) => (
          <div key={r.id} className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="text-xs font-black text-slate-900 dark:text-slate-100">
                  {(isManager ? nameOf(r.employeeId) : '') && <span className="me-1">{nameOf(r.employeeId)}</span>}
                  <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">{r.date}</span>
                  <span className="mx-1">·</span>
                  <span dir="ltr" className="font-mono text-[11px]">
                    {r.currentStartTime && r.currentEndTime ? `${r.currentStartTime}-${r.currentEndTime}` : (lang === 'ar' ? 'لا يوجد' : 'none')}
                    {' → '}
                    {r.proposedStartTime}-{r.proposedEndTime}
                  </span>
                </div>
                {r.reason && <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{lang === 'ar' ? 'السبب: ' : 'Reason: '}{r.reason}</div>}
                {r.reviewNotes && <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{lang === 'ar' ? 'ملاحظة المراجع: ' : 'Reviewer note: '}{r.reviewNotes}</div>}
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-black px-2 py-1 rounded-lg ${STATUS_CHIP[r.status] ?? STATUS_CHIP.pending}`}>{statusLabel(r.status)}</span>
                {isManager && r.status === 'pending' && (
                  <>
                    <button type="button" disabled={busy} onClick={() => review(r, 'approve')} className="rounded-lg bg-emerald-50 p-2 text-emerald-700 disabled:opacity-50 dark:bg-emerald-500/15 dark:text-emerald-300" title={lang === 'ar' ? 'اعتماد وتحديث الجدول' : 'Approve & update schedule'}><Check className="h-4 w-4" /></button>
                    <button type="button" disabled={busy} onClick={() => review(r, 'reject')} className="rounded-lg bg-rose-50 p-2 text-rose-700 disabled:opacity-50 dark:bg-rose-500/15 dark:text-rose-300" title={lang === 'ar' ? 'رفض' : 'Reject'}><X className="h-4 w-4" /></button>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300">{message}</div>}
      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-black text-red-700 dark:border-red-500/40 dark:bg-red-500/15 dark:text-red-300">{error}</div>}
    </section>
  );
};

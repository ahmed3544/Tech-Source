import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight, Check, Clock3, X, Zap } from 'lucide-react';
import { DailyShiftAssignment, Employee, Language, Notification, Shift, ShiftSwapRequest } from '../types';
import { authHeaders } from '../utils/errors';

interface Props {
  employees: Employee[];
  shifts: Shift[];
  assignments: DailyShiftAssignment[];
  currentUser: Employee | null;
  lang: Language;
}

const key = (e: string, d: string) => `${e}|${d}`;

export const ShiftSwapPanel: React.FC<Props> = ({ employees, shifts, assignments, currentUser, lang }) => {
  const [requests, setRequests] = useState<ShiftSwapRequest[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [date, setDate] = useState('');
  const [targetId, setTargetId] = useState('');
  const [loading, setLoading] = useState(false);
  const [actionError, setActionError] = useState('');
  const isLeader = currentUser?.role === 'leader' || currentUser?.role === 'admin';
  const isAdmin = currentUser?.role === 'admin';
  // Admin direct swap ("عايز الادمن يبقي ليه اكسس يسواب الشفت بدون الرجوع
  // للاداره"): the admin swaps any two employees' shifts immediately — no
  // request, no target acceptance, no leader approval chain.
  const [directDate, setDirectDate] = useState('');
  const [directAId, setDirectAId] = useState('');
  const [directBId, setDirectBId] = useState('');
  const [directBusy, setDirectBusy] = useState(false);
  const [directError, setDirectError] = useState('');
  const [directDone, setDirectDone] = useState('');
  const directPool = useMemo(() => employees.filter(e => e.status === 'active'), [employees]);
  const team = useMemo(() => {
    if (!currentUser) return [];
    if (currentUser.role === 'admin') return employees.filter(e => e.id !== currentUser.id && e.status === 'active');
    const explicit = employees.some(e => e.teamLeaderId === currentUser.id);
    return employees.filter(e => e.status === 'active' && e.id !== currentUser.id && (explicit ? e.teamLeaderId === currentUser.id : (!currentUser.teamId || e.teamId === currentUser.teamId)));
  }, [employees, currentUser]);

  const assignmentAt = (employeeId: string, day: string) => assignments.find(x => x.employeeId === employeeId && x.date === day);
  const shiftAt = (employeeId: string, day: string) => {
    const assignment = assignmentAt(employeeId, day);
    if (!assignment || assignment.isOffDay || ['__OFF__', 'OFF', 'off'].includes(String(assignment.shiftId))) return undefined;
    return shifts.find(s => s.id === assignment.shiftId);
  };
  const isOff = (employeeId: string, day: string) => {
    const assignment = assignmentAt(employeeId, day);
    return !!assignment && (assignment.isOffDay === true || ['__OFF__', 'OFF', 'off'].includes(String(assignment.shiftId)));
  };
  const assignmentLabel = (employeeId: string, day: string) => {
    const assignment = assignmentAt(employeeId, day);
    if (!assignment) return lang === 'ar' ? 'غير محدد' : 'Unassigned';
    if (isOff(employeeId, day)) return 'OFF';
    const shift = shifts.find(s => s.id === assignment.shiftId);
    return shift ? `${shift.startTime}-${shift.endTime}` : (lang === 'ar' ? 'غير محدد' : 'Unassigned');
  };
  const shiftLabel = (shift?: Shift) => shift ? `${shift.startTime}-${shift.endTime}` : (lang === 'ar' ? 'غير محدد' : 'Unassigned');
  const name = (id: string) => { const e = employees.find(x => x.id === id); return e ? (lang === 'ar' ? e.nameAr : e.nameEn) : id; };
  const shiftName = (id: string) => shiftLabel(shifts.find(x => x.id === id));

  const syncState = async (nextRequests: ShiftSwapRequest[], nextNotifications: Notification[], nextAssignments = assignments) => {
    setRequests(nextRequests);
    setNotifications(nextNotifications);
    localStorage.setItem('shift_swap_requests', JSON.stringify(nextRequests));
    localStorage.setItem('notifications', JSON.stringify(nextNotifications));
    if (nextAssignments !== assignments) localStorage.setItem('daily_shift_assignments', JSON.stringify(nextAssignments));
    try {
      await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shiftSwapRequests: nextRequests, notifications: nextNotifications, ...(nextAssignments !== assignments ? { dailyShiftAssignments: nextAssignments } : {}) })
      });
    } catch {}
  };

  const makeNotification = (recipientId: string, type: Notification['type'], title: string, message: string, swapId: string, now = new Date().toISOString()): Notification => ({
    id: `notif-swap-${swapId}-${recipientId}-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
    recipientId,
    type,
    title,
    message,
    relatedShiftSwapId: swapId,
    isRead: false,
    createdAt: now,
    updatedAt: now,
  });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const localRequests = localStorage.getItem('shift_swap_requests');
        const localNotifications = localStorage.getItem('notifications');
        if (localRequests && !cancelled) setRequests(JSON.parse(localRequests));
        if (localNotifications && !cancelled) setNotifications(JSON.parse(localNotifications));
        const r = await fetch('/api/data');
        if (r.ok) {
          const d = await r.json();
          if (!cancelled && Array.isArray(d.shiftSwapRequests)) { setRequests(d.shiftSwapRequests); localStorage.setItem('shift_swap_requests', JSON.stringify(d.shiftSwapRequests)); }
          if (!cancelled && Array.isArray(d.notifications)) { setNotifications(d.notifications); localStorage.setItem('notifications', JSON.stringify(d.notifications)); }
        }
      } catch {}
    };
    void load();
    const onAction = (event: Event) => {
      const detail = (event as CustomEvent<{ swapId?: string; action?: 'accept' | 'reject' }>).detail;
      if (detail?.swapId && detail.action && detail.action !== 'accept' && detail.action !== 'reject') return;
      if (detail?.swapId && detail.action) void respondAsTarget(detail.swapId, detail.action === 'accept' ? 'accepted' : 'rejected');
    };
    window.addEventListener('shift-swap-notification-action', onAction);
    return () => { cancelled = true; window.removeEventListener('shift-swap-notification-action', onAction); };
  }, [employees]);

  /** Fire-and-forget audit trail entry for the swap flow (server validates the
      actor from the auth headers — the body can never impersonate anyone). */
  const reportActivity = (action: string, request: ShiftSwapRequest, extra: Record<string, unknown> = {}) => {
    void fetch('/api/activity-log', {
      method: 'POST', credentials: 'include', cache: 'no-store',
      headers: authHeaders({ 'Content-Type': 'application/json', Accept: 'application/json' }),
      body: JSON.stringify({
        action,
        entityType: 'swap',
        entityId: request.id,
        entityLabel: `${request.date}: ${shiftLabel(shifts.find(s => s.id === request.requesterShiftId))} ↔ ${shiftLabel(shifts.find(s => s.id === request.targetShiftId))}`,
        details: { requester: request.requesterId, target: request.targetEmployeeId, ...extra },
      }),
    }).catch(() => {});
  };

  const respondAsTarget = async (swapId: string, status: 'accepted' | 'rejected') => {
    if (!currentUser || isLeader) return;
    const request = requests.find(r => r.id === swapId && r.targetEmployeeId === currentUser.id && r.status === 'awaiting_target');
    if (!request) return;
    setLoading(true);
    const now = new Date().toISOString();
    const nextStatus: ShiftSwapRequest['status'] = status === 'accepted' ? 'pending' : 'rejected';
    const nextRequests = requests.map(r => r.id === swapId ? { ...r, status: nextStatus, targetRespondedAt: now } : r);
    let nextNotifications = notifications.filter(n => n.id !== `swap-action-${swapId}`);
    if (status === 'accepted') {
      const leaderId = employees.find(e => e.id === request.requesterId)?.teamLeaderId;
      const recipients = leaderId ? [leaderId] : employees.filter(e => e.role === 'leader' || e.role === 'admin').map(e => e.id);
      const additions = recipients.filter(Boolean).map(recipientId => makeNotification(recipientId, 'shift_swap_accepted', lang === 'ar' ? 'تمت الموافقة على Swap' : 'Shift Swap Accepted', lang === 'ar' ? `${name(currentUser.id)} وافق على تبديل الشفت مع ${name(request.requesterId)} ليوم ${request.date}. أصبح الطلب جاهزًا لمراجعة الليدر.` : `${name(currentUser.id)} accepted the shift swap with ${name(request.requesterId)} for ${request.date}. It is now ready for leader review.`, swapId, now));
      nextNotifications = [...nextNotifications, ...additions];
    } else {
      nextNotifications = [...nextNotifications, makeNotification(request.requesterId, 'shift_swap_rejected', lang === 'ar' ? 'تم رفض طلب تبديل الشفت' : 'Shift Swap Rejected', lang === 'ar' ? `${name(currentUser.id)} رفض طلب تبديل الشفت ليوم ${request.date}.` : `${name(currentUser.id)} rejected the shift swap request for ${request.date}.`, swapId, now)];
    }
    await syncState(nextRequests, nextNotifications);
    reportActivity(status === 'accepted' ? 'swap.accept' : 'swap.reject', request, { targetResponded: status });
    setLoading(false);
  };

  const submit = async () => {
    if (!currentUser || isLeader || !date || !targetId || targetId === currentUser.id) return;
    const mineAssignment = assignmentAt(currentUser.id, date);
    const targetAssignment = assignmentAt(targetId, date);
    const mine = shiftAt(currentUser.id, date);
    const theirs = shiftAt(targetId, date);
    if (!mineAssignment || !targetAssignment) return;
    if (!mine && !isOff(currentUser.id, date)) return;
    if (!theirs && !isOff(targetId, date)) return;
    if (isOff(currentUser.id, date) && isOff(targetId, date)) return;
    const exists = requests.some(r => ['awaiting_target', 'pending'].includes(r.status) && r.date === date && ((r.requesterId === currentUser.id && r.targetEmployeeId === targetId) || (r.requesterId === targetId && r.targetEmployeeId === currentUser.id)));
    if (exists) return;
    const now = new Date().toISOString();
    const req: ShiftSwapRequest = { id: `swap-${Date.now()}-${Math.random().toString(36).slice(2,8)}`, requesterId: currentUser.id, targetEmployeeId: targetId, date, requesterShiftId: mineAssignment.shiftId, targetShiftId: targetAssignment.shiftId, requesterWasOff: isOff(currentUser.id, date), targetWasOff: isOff(targetId, date), status: 'awaiting_target', createdAt: now };
    const nextRequests = [...requests, req];
    const nextNotifications = [...notifications, makeNotification(targetId, 'shift_swap_requested', lang === 'ar' ? 'طلب تبديل شفت جديد' : 'New Shift Swap Request', lang === 'ar' ? `${name(currentUser.id)} أرسل لك طلب تبديل شفت ليوم ${date}: ${shiftLabel(mine)} ↔ ${shiftLabel(theirs)}. راجع الطلب واضغط موافقة أو رفض.` : `${name(currentUser.id)} sent you a shift swap request for ${date}: ${shiftLabel(mine)} ↔ ${shiftLabel(theirs)}. Review it and accept or reject.`, req.id, now)];
    await syncState(nextRequests, nextNotifications);
    reportActivity('swap.submit', req, { status: 'awaiting_target' });
    setTargetId('');
  };

  const review = async (request: ShiftSwapRequest, status: 'approved' | 'rejected') => {
    if (!isLeader || request.status !== 'pending') return;
    setLoading(true);
    setActionError('');
    const now = new Date().toISOString();
    const nextRequests = requests.map(r => r.id === request.id ? { ...r, status, reviewedBy: currentUser?.id, reviewedAt: now } : r);
    let nextNotifications = notifications;
    if (status === 'approved') {
      const nextAssignments = [...assignments];
      const a = nextAssignments.findIndex(x => key(x.employeeId, x.date) === key(request.requesterId, request.date));
      const b = nextAssignments.findIndex(x => key(x.employeeId, x.date) === key(request.targetEmployeeId, request.date));
      const requesterCurrent = a >= 0 ? nextAssignments[a] : undefined;
      const targetCurrent = b >= 0 ? nextAssignments[b] : undefined;
      if (!requesterCurrent || !targetCurrent) {
        // The schedule rows are gone (e.g. the week was re-imported since the
        // request was made). Surface it instead of silently doing nothing.
        setActionError(lang === 'ar' ? 'تعذر تنفيذ التبديل: تعيين أحد الموظفين لهذا اليوم غير موجود. حدث الصفحة وحاول مرة أخرى.' : 'Could not apply the swap: one of the day assignments is missing. Refresh the page and try again.');
        setLoading(false);
        return;
      }
      nextAssignments[a] = { ...requesterCurrent, shiftId: request.targetShiftId, isOffDay: request.targetWasOff ?? ['__OFF__', 'OFF', 'off'].includes(String(request.targetShiftId)), assignedBy: currentUser?.id, updatedAt: now };
      nextAssignments[b] = { ...targetCurrent, shiftId: request.requesterShiftId, isOffDay: request.requesterWasOff ?? ['__OFF__', 'OFF', 'off'].includes(String(request.requesterShiftId)), assignedBy: currentUser?.id, updatedAt: now };
      nextNotifications = [...notifications,
        makeNotification(request.requesterId, 'shift_changed', lang === 'ar' ? 'تم اعتماد تبديل الشفت' : 'Shift Swap Approved', lang === 'ar' ? `تم اعتماد تبديل الشفت مع ${name(request.targetEmployeeId)} ليوم ${request.date}. شفتك الآن ${shiftName(request.targetShiftId)}.` : `Your shift swap with ${name(request.targetEmployeeId)} for ${request.date} was approved. Your new shift is ${shiftName(request.targetShiftId)}.`, request.id, now),
        makeNotification(request.targetEmployeeId, 'shift_changed', lang === 'ar' ? 'تم اعتماد تبديل الشفت' : 'Shift Swap Approved', lang === 'ar' ? `تم اعتماد تبديل الشفت مع ${name(request.requesterId)} ليوم ${request.date}. شفتك الآن ${shiftName(request.requesterShiftId)}.` : `Your shift swap with ${name(request.requesterId)} for ${request.date} was approved. Your new shift is ${shiftName(request.requesterShiftId)}.`, request.id, now)
      ];
      // THE FIX for "بعد الاسواب مايتعمل الشفت مش بيتبدل": the swapped rows
      // MUST go through the dedicated permission-checked /api/schedule-sync
      // endpoint. The legacy /api/sync silently STRIPS dailyShiftAssignments
      // (server/schedule-sync-guard.ts: "the dedicated /api/schedule-sync
      // endpoint is the only schedule writer"), so approvals posted there
      // saved the request status but threw the shift change away.
      const swapRes = await fetch('/api/schedule-sync', {
        method: 'POST', credentials: 'include', cache: 'no-store',
        headers: authHeaders({ 'Content-Type': 'application/json', Accept: 'application/json' }),
        body: JSON.stringify({ dailyShiftAssignments: [nextAssignments[a], nextAssignments[b]], syncTimestamp: now, source: 'shift-swap' }),
      });
      if (!swapRes.ok) {
        setActionError(lang === 'ar' ? `تعذر حفظ تبديل الشفت على الجدول (خطأ ${swapRes.status}). تأكد من صلاحياتك وحاول مرة أخرى.` : `Could not save the shift swap to the schedule (error ${swapRes.status}). Check your permissions and try again.`);
        setLoading(false);
        return;
      }
      const swapData = await swapRes.json().catch(() => null);
      if (Array.isArray(swapData?.dailyShiftAssignments)) { try { localStorage.setItem('daily_shift_assignments', JSON.stringify(swapData.dailyShiftAssignments)); } catch {} }
      await syncState(nextRequests, nextNotifications);
      // The schedule rows just changed server-side — ask the app to re-pull
      // /api/data so the grid shows the swap immediately (no page refresh).
      window.dispatchEvent(new CustomEvent('techsource:assignments-changed'));
    } else {
      nextNotifications = [...notifications,
        makeNotification(request.requesterId, 'shift_swap_rejected', lang === 'ar' ? 'تم رفض تبديل الشفت' : 'Shift Swap Rejected', lang === 'ar' ? `الليدر رفض تبديل الشفت مع ${name(request.targetEmployeeId)} ليوم ${request.date}.` : `The leader rejected the shift swap with ${name(request.targetEmployeeId)} for ${request.date}.`, request.id, now),
        makeNotification(request.targetEmployeeId, 'shift_swap_rejected', lang === 'ar' ? 'تم رفض تبديل الشفت' : 'Shift Swap Rejected', lang === 'ar' ? `الليدر رفض تبديل الشفت مع ${name(request.requesterId)} ليوم ${request.date}.` : `The leader rejected the shift swap with ${name(request.requesterId)} for ${request.date}.`, request.id, now)
      ];
      await syncState(nextRequests, nextNotifications);
    }
    reportActivity(status === 'approved' ? 'swap.approve' : 'swap.reject', request, { reviewedBy: currentUser?.id, newStatus: status });
    setLoading(false);
  };

  /** ADMIN DIRECT SWAP: exchanges the two selected employees' assignments for
   *  one date through the permission-checked /api/schedule-sync endpoint and
   *  notifies both of them. Mirrors the swap-write logic of review(). */
  const applyDirectSwap = async () => {
    if (!isAdmin || directBusy || !directDate || !directAId || !directBId || directAId === directBId) return;
    const rowA = assignmentAt(directAId, directDate);
    const rowB = assignmentAt(directBId, directDate);
    if (!rowA || !rowB) { setDirectError(lang === 'ar' ? 'تعذر التنفيذ: أحد الموظفين ليس له تعيين في هذا اليوم.' : 'Cannot apply: one of the employees has no assignment on that day.'); return; }
    if (isOff(directAId, directDate) && isOff(directBId, directDate)) { setDirectError(lang === 'ar' ? 'الاتنين OFF في اليوم ده — مفيش حاجة تتبدل.' : 'Both employees are OFF that day — nothing to swap.'); return; }
    setDirectBusy(true); setDirectError(''); setDirectDone('');
    const now = new Date().toISOString();
    const nextA = { ...rowA, shiftId: rowB.shiftId || '', isOffDay: Boolean(rowB.isOffDay), assignedBy: currentUser?.id, updatedAt: now };
    const nextB = { ...rowB, shiftId: rowA.shiftId || '', isOffDay: Boolean(rowA.isOffDay), assignedBy: currentUser?.id, updatedAt: now };
    try {
      const res = await fetch('/api/schedule-sync', {
        method: 'POST', credentials: 'include', cache: 'no-store',
        headers: authHeaders({ 'Content-Type': 'application/json', Accept: 'application/json' }),
        body: JSON.stringify({ dailyShiftAssignments: [nextA, nextB], syncTimestamp: now, source: 'shift-swap' }),
      });
      if (!res.ok) {
        setDirectError(lang === 'ar' ? `تعذر حفظ التبديل على الجدول (خطأ ${res.status}). تأكد من صلاحياتك وحاول مرة أخرى.` : `Could not save the swap to the schedule (error ${res.status}). Check your permissions and try again.`);
        setDirectBusy(false);
        return;
      }
      const data = await res.json().catch(() => null);
      if (Array.isArray(data?.dailyShiftAssignments)) { try { localStorage.setItem('daily_shift_assignments', JSON.stringify(data.dailyShiftAssignments)); } catch {} }
      const nextNotifications = [...notifications,
        makeNotification(directAId, 'shift_changed', lang === 'ar' ? 'تم تبديل الشفت' : 'Shift Swapped', lang === 'ar' ? `الأدمن بدّل شفتك ليوم ${directDate}. شفتك الآن ${nextA.isOffDay ? 'OFF' : shiftName(nextA.shiftId)}.` : `The admin swapped your shift for ${directDate}. Your shift is now ${nextA.isOffDay ? 'OFF' : shiftName(nextA.shiftId)}.`, `direct-${Date.now()}-${directAId}`, now),
        makeNotification(directBId, 'shift_changed', lang === 'ar' ? 'تم تبديل الشفت' : 'Shift Swapped', lang === 'ar' ? `الأدمن بدّل شفتك ليوم ${directDate}. شفتك الآن ${nextB.isOffDay ? 'OFF' : shiftName(nextB.shiftId)}.` : `The admin swapped your shift for ${directDate}. Your shift is now ${nextB.isOffDay ? 'OFF' : shiftName(nextB.shiftId)}.`, `direct-${Date.now()}-${directBId}`, now),
      ];
      setNotifications(nextNotifications);
      try { localStorage.setItem('notifications', JSON.stringify(nextNotifications)); } catch {}
      void fetch('/api/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notifications: nextNotifications }) }).catch(() => {});
      reportActivity('swap.direct', { id: `direct-${Date.now()}`, requesterId: directAId, targetEmployeeId: directBId, date: directDate, requesterShiftId: rowA.shiftId, targetShiftId: rowB.shiftId, requesterWasOff: Boolean(rowA.isOffDay), targetWasOff: Boolean(rowB.isOffDay), status: 'approved', createdAt: now } as ShiftSwapRequest, { appliedBy: currentUser?.id, mode: 'direct' });
      // Tell the app the schedule changed so the grid re-pulls /api/data and
      // reflects the swap immediately — no manual page refresh.
      window.dispatchEvent(new CustomEvent('techsource:assignments-changed'));
      setDirectDone(lang === 'ar' ? `تم تنفيذ التبديل: ${name(directAId)} ↔ ${name(directBId)} ليوم ${directDate}` : `Swap applied: ${name(directAId)} ↔ ${name(directBId)} on ${directDate}`);
      setDirectDate(''); setDirectAId(''); setDirectBId('');
    } catch {
      setDirectError(lang === 'ar' ? 'تعذر الاتصال بالسيرفر. حاول مرة أخرى.' : 'Could not reach the server. Try again.');
    }
    setDirectBusy(false);
  };

  const selectedMine = date && currentUser ? shiftAt(currentUser.id, date) : undefined;
  const selectedTarget = date && targetId ? shiftAt(targetId, date) : undefined;
  const visibleRequests = isLeader
    ? requests.filter(r => r.status !== 'awaiting_target' && team.some(e => e.id === r.requesterId || e.id === r.targetEmployeeId))
    : requests.filter(r => r.requesterId === currentUser?.id || r.targetEmployeeId === currentUser?.id);

  return <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-4 space-y-4">
    <div className="flex items-center gap-2"><ArrowLeftRight className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /><h4 className="text-sm font-black text-slate-900 dark:text-white dark:text-slate-100">{lang === 'ar' ? 'تبديل الشفت' : 'Shift Swap'}</h4></div>
    {actionError && <div className="rounded-xl border border-rose-300 bg-rose-50 dark:border-rose-500/40 dark:bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-700 dark:text-rose-300">{actionError}</div>}
    {isAdmin && <div className="space-y-3 rounded-xl border-2 border-indigo-300 bg-indigo-50/70 p-3 dark:border-indigo-500/40 dark:bg-indigo-500/10">
      <div className="flex items-center gap-2 text-xs font-black text-indigo-800 dark:text-indigo-200"><Zap className="h-4 w-4" />{lang === 'ar' ? 'تبديل مباشر للشيفتات (أدمن فقط) — بدون طلب أو موافقة الإدارة' : 'Direct shift swap (admin only) — no request or approval needed'}</div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <label className="text-xs font-bold text-slate-700 dark:text-slate-300">{lang === 'ar' ? 'التاريخ' : 'Date'}<input type="date" data-direct-swap-date value={directDate} onChange={e => { setDirectDate(e.target.value); setDirectDone(''); }} className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2" /></label>
        <label className="text-xs font-bold text-slate-700 dark:text-slate-300">{lang === 'ar' ? 'الموظف الأول' : 'First employee'}<select data-direct-swap-a value={directAId} onChange={e => { setDirectAId(e.target.value); setDirectDone(''); }} className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2"><option value="">{lang === 'ar' ? 'اختيار الموظف' : 'Select employee'}</option>{directPool.map(e => <option key={e.id} value={e.id}>{e.code} - {lang === 'ar' ? e.nameAr : e.nameEn}</option>)}</select></label>
        <label className="text-xs font-bold text-slate-700 dark:text-slate-300">{lang === 'ar' ? 'الموظف الثاني' : 'Second employee'}<select data-direct-swap-b value={directBId} onChange={e => { setDirectBId(e.target.value); setDirectDone(''); }} className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2"><option value="">{lang === 'ar' ? 'اختيار الموظف' : 'Select employee'}</option>{directPool.filter(e => e.id !== directAId).map(e => <option key={e.id} value={e.id}>{e.code} - {lang === 'ar' ? e.nameAr : e.nameEn}</option>)}</select></label>
        <div className="flex items-end"><button type="button" data-direct-swap-apply onClick={applyDirectSwap} disabled={directBusy || !directDate || !directAId || !directBId || directAId === directBId} className="w-full rounded-xl bg-indigo-600 text-white px-4 py-2.5 text-xs font-black disabled:opacity-50">{directBusy ? (lang === 'ar' ? 'جاري التنفيذ...' : 'Applying...') : (lang === 'ar' ? 'تنفيذ التبديل الآن' : 'Apply swap now')}</button></div>
      </div>
      {directDate && directAId && directBId && directAId !== directBId && <div className="rounded-xl border border-indigo-200 dark:border-indigo-500/30 bg-white dark:bg-slate-900 p-3 text-xs">
        <div className="font-black text-slate-800 dark:text-slate-200 mb-2">{lang === 'ar' ? `الوضع الحالي ليوم ${directDate}` : `Current state on ${directDate}`}</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2"><div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 px-3 py-2"><span className="font-bold">{name(directAId)}:</span> {assignmentLabel(directAId, directDate)}</div><div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 px-3 py-2"><span className="font-bold">{name(directBId)}:</span> {assignmentLabel(directBId, directDate)}</div></div>
        <div className="mt-2 text-slate-600 dark:text-slate-300">{lang === 'ar' ? 'بعد التنفيذ يأخذ كل موظف شفت الآخر في نفس اليوم (شفت ↔ OFF مسموح).' : 'After applying, each employee takes the other\u2019s shift that day (shift ↔ OFF allowed).'}</div>
      </div>}
      {directError && <div className="rounded-xl border border-rose-300 bg-rose-50 dark:border-rose-500/40 dark:bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-700 dark:text-rose-300">{directError}</div>}
      {directDone && <div className="rounded-xl border border-emerald-300 bg-emerald-50 dark:border-emerald-500/40 dark:bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-700 dark:text-emerald-300">{directDone}</div>}
    </div>}
    {!isLeader && currentUser && <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <label className="text-xs font-bold text-slate-700 dark:text-slate-300">{lang === 'ar' ? 'تاريخ التبديل' : 'Swap Date'}<input type="date" value={date} onChange={e => setDate(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2" /></label>
        <label className="text-xs font-bold text-slate-700 dark:text-slate-300">{lang === 'ar' ? 'التبديل مع' : 'Swap With'}<select value={targetId} onChange={e => setTargetId(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2"><option value="">{lang === 'ar' ? 'اختيار الموظف' : 'Select employee'}</option>{team.map(e => <option key={e.id} value={e.id}>{e.code} - {lang === 'ar' ? e.nameAr : e.nameEn}</option>)}</select></label>
        <div className="flex items-end"><button type="button" onClick={submit} disabled={!date || !targetId || !assignmentAt(currentUser.id, date) || !assignmentAt(targetId, date) || (isOff(currentUser.id, date) && isOff(targetId, date)) || (!selectedMine && !isOff(currentUser.id, date)) || (!selectedTarget && !isOff(targetId, date))} className="w-full rounded-xl bg-emerald-600 text-white px-4 py-2.5 text-xs font-black disabled:opacity-50">{lang === 'ar' ? 'إرسال الطلب' : 'Submit Request'}</button></div>
      </div>
      {date && targetId && <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 text-xs">
        <div className="font-black text-slate-800 dark:text-slate-200 mb-2">{lang === 'ar' ? `الشفتات في يوم ${date}` : `Shifts on ${date}`}</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2"><div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 px-3 py-2"><span className="font-bold">{name(currentUser.id)}:</span> {assignmentLabel(currentUser.id, date)}</div><div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 px-3 py-2"><span className="font-bold">{name(targetId)}:</span> {assignmentLabel(targetId, date)}</div></div>
        {(!assignmentAt(currentUser.id, date) || !assignmentAt(targetId, date) || (isOff(currentUser.id, date) && isOff(targetId, date)) || (!selectedMine && !isOff(currentUser.id, date)) || (!selectedTarget && !isOff(targetId, date))) && <div className="mt-2 text-amber-700 dark:text-amber-300">{lang === 'ar' ? 'لازم يكون لكل موظف تعيين في اليوم، ويسمح بتبديل شفت مع OFF.' : 'Both employees need an assignment; a working shift can be swapped with OFF.'}</div>}
      </div>}
    </div>}
    <div className="space-y-2">
      {visibleRequests.length === 0 ? <div className="text-xs text-slate-500 dark:text-slate-400">{lang === 'ar' ? 'لا توجد طلبات تبديل.' : 'No shift swap requests.'}</div> : visibleRequests.map(r => <div key={r.id} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="min-w-0"><div className="text-xs font-black text-slate-900 dark:text-white dark:text-slate-100">{name(r.requesterId)} ↔ {name(r.targetEmployeeId)}</div><div className="text-[11px] text-slate-500 mt-1 dark:text-slate-400">{r.date} · {r.requesterWasOff ? 'OFF' : shiftName(r.requesterShiftId)} ↔ {r.targetWasOff ? 'OFF' : shiftName(r.targetShiftId)}</div></div>
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-black px-2 py-1 rounded-lg ${r.status === 'approved' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' : r.status === 'rejected' ? 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300' : 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'}`}>{r.status === 'approved' ? (lang === 'ar' ? 'معتمد' : 'Approved') : r.status === 'rejected' ? (lang === 'ar' ? 'مرفوض' : 'Rejected') : (lang === 'ar' ? 'موافقة الليدر مطلوبة' : 'Leader approval required')}</span>
            {!isLeader && r.targetEmployeeId === currentUser?.id && r.status === 'awaiting_target' && <><button disabled={loading} type="button" onClick={() => respondAsTarget(r.id, 'accepted')} className="p-2 rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" title={lang === 'ar' ? 'موافقة' : 'Accept'}><Check className="w-4 h-4" /></button><button disabled={loading} type="button" onClick={() => respondAsTarget(r.id, 'rejected')} className="p-2 rounded-lg bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300" title={lang === 'ar' ? 'رفض' : 'Reject'}><X className="w-4 h-4" /></button></>}
            {isLeader && r.status === 'pending' && <><button disabled={loading} type="button" onClick={() => review(r, 'approved')} className="p-2 rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" title={lang === 'ar' ? 'اعتماد' : 'Approve'}><Check className="w-4 h-4" /></button><button disabled={loading} type="button" onClick={() => review(r, 'rejected')} className="p-2 rounded-lg bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300" title={lang === 'ar' ? 'رفض' : 'Reject'}><X className="w-4 h-4" /></button></>}
          </div>
        </div>
      </div>)}
    </div>
  </section>;
};

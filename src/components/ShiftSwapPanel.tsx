import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight, Check, Clock3, X } from 'lucide-react';
import { DailyShiftAssignment, Employee, Language, Notification, Shift, ShiftSwapRequest } from '../types';
import { authHeaders, parseResponse } from '../utils/errors';

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
  const [requestType, setRequestType] = useState<'shift' | 'break'>('shift');
  const [currentBreakStart, setCurrentBreakStart] = useState('');
  const [currentBreakEnd, setCurrentBreakEnd] = useState('');
  const [requestedBreakStart, setRequestedBreakStart] = useState('');
  const [requestedBreakEnd, setRequestedBreakEnd] = useState('');
  const [loading, setLoading] = useState(false);
  const isLeader = currentUser?.role === 'leader' || currentUser?.role === 'admin';
  const team = useMemo(() => {
    if (!currentUser) return [];
    if (currentUser.role === 'admin') return employees.filter(e => e.id !== currentUser.id && e.status === 'active');
    const explicit = employees.some(e => e.teamLeaderId === currentUser.id);
    return employees.filter(e => e.status === 'active' && e.id !== currentUser.id && (explicit ? e.teamLeaderId === currentUser.id : (!currentUser.teamId || e.teamId === currentUser.teamId)));
  }, [employees, currentUser]);

  const assignmentAt = (employeeId: string, day: string) => assignments.find(x => x.employeeId === employeeId && x.date === day);
  const shiftAt = (employeeId: string, day: string) => {
    const assignment = assignmentAt(employeeId, day);
    return assignment ? shifts.find(s => s.id === assignment.shiftId) : undefined;
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
      const response = await fetch('/api/sync', {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        headers: authHeaders({ 'Content-Type': 'application/json', Accept: 'application/json', 'Cache-Control': 'no-cache' }),
        body: JSON.stringify({ shiftSwapRequests: nextRequests, notifications: nextNotifications, ...(nextAssignments !== assignments ? { dailyShiftAssignments: nextAssignments } : {}) })
      });
      if (!response.ok) {
        const payload = await parseResponse(response);
        throw new Error(String(payload?.error || payload?.message || `Request failed (${response.status})`));
      }
    } catch (error) {
      console.error('[ShiftSwap] Failed to persist request/action:', error);
      throw error;
    }
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
    setLoading(false);
  };

  const submit = async () => {
    if (!currentUser || isLeader || !date) return;
    const now = new Date().toISOString();
    if (requestType === 'break') {
      if (!currentBreakStart || !currentBreakEnd || !requestedBreakStart || !requestedBreakEnd || currentBreakEnd <= currentBreakStart || requestedBreakEnd <= requestedBreakStart) return;
      const req: ShiftSwapRequest = { id: `break-swap-${Date.now()}-${Math.random().toString(36).slice(2,8)}`, requesterId: currentUser.id, targetEmployeeId: currentUser.id, date, requesterShiftId: '', targetShiftId: '', status: 'pending', createdAt: now, requestType: 'break', currentBreakStart, currentBreakEnd, requestedBreakStart, requestedBreakEnd };
      const recipients = employees.filter(e => e.role === 'admin' || e.role === 'leader').map(e => e.id);
      const nextRequests = [...requests, req];
      const nextNotifications = [...notifications, ...recipients.map(id => makeNotification(id, 'shift_swap_requested', lang === 'ar' ? 'طلب تغيير بريك' : 'Break Change Request', lang === 'ar' ? `${name(currentUser.id)} طلب تغيير بريك يوم ${date} من ${currentBreakStart}-${currentBreakEnd} إلى ${requestedBreakStart}-${requestedBreakEnd}.` : `${name(currentUser.id)} requested a break change on ${date} from ${currentBreakStart}-${currentBreakEnd} to ${requestedBreakStart}-${requestedBreakEnd}.`, req.id, now))];
      await syncState(nextRequests, nextNotifications);
      setCurrentBreakStart(''); setCurrentBreakEnd(''); setRequestedBreakStart(''); setRequestedBreakEnd('');
      return;
    }
    if (!targetId || targetId === currentUser.id) return;
    const mine = shiftAt(currentUser.id, date), theirs = shiftAt(targetId, date);
    if (!mine || !theirs) return;
    const exists = requests.some(r => r.requestType !== 'break' && ['awaiting_target', 'pending'].includes(r.status) && r.date === date && ((r.requesterId === currentUser.id && r.targetEmployeeId === targetId) || (r.requesterId === targetId && r.targetEmployeeId === currentUser.id)));
    if (exists) return;
    const req: ShiftSwapRequest = { id: `swap-${Date.now()}-${Math.random().toString(36).slice(2,8)}`, requesterId: currentUser.id, targetEmployeeId: targetId, date, requesterShiftId: mine.id, targetShiftId: theirs.id, status: 'awaiting_target', createdAt: now, requestType: 'shift' };
    const nextRequests = [...requests, req];
    const nextNotifications = [...notifications, makeNotification(targetId, 'shift_swap_requested', lang === 'ar' ? 'طلب تبديل شفت جديد' : 'New Shift Swap Request', lang === 'ar' ? `${name(currentUser.id)} أرسل لك طلب تبديل شفت ليوم ${date}: ${shiftLabel(mine)} ↔ ${shiftLabel(theirs)}. راجع الطلب واضغط موافقة أو رفض.` : `${name(currentUser.id)} sent you a shift swap request for ${date}: ${shiftLabel(mine)} ↔ ${shiftLabel(theirs)}. Review it and accept or reject.`, req.id, now)];
    await syncState(nextRequests, nextNotifications); setTargetId('');
  };

  const review = async (request: ShiftSwapRequest, status: 'approved' | 'rejected') => {
    if (!isLeader || request.status !== 'pending' || (request.requestType === 'break' && currentUser?.role !== 'admin')) return;
    setLoading(true);
    const now = new Date().toISOString();
    const nextRequests = requests.map(r => r.id === request.id ? { ...r, status, reviewedBy: currentUser?.id, reviewedAt: now } : r);
    let nextNotifications = notifications;
    if (status === 'approved' && request.requestType === 'break') {
      if (currentUser?.role !== 'admin') { setLoading(false); return; }
      try {
        const query = new URLSearchParams({ employeeId: request.requesterId, from: request.date, to: request.date });
        const getResponse = await fetch(`/api/employee-breaks?${query.toString()}`, {
          credentials: 'include', cache: 'no-store',
          headers: authHeaders({ Accept: 'application/json', 'Cache-Control': 'no-cache' })
        });
        const existingPayload = await parseResponse(getResponse);
        if (!getResponse.ok || existingPayload?.success !== true) throw new Error(String(existingPayload?.error || 'Could not load current breaks'));
        let currentBreaks = Array.isArray(existingPayload?.breaksByDate?.[request.date]) ? existingPayload.breaksByDate[request.date] : [];
        if (!currentBreaks.length) {
          const assigned = assignmentAt(request.requesterId, request.date);
          const assignedShift = shifts.find(s => s.id === assigned?.shiftId) || shifts.find(s => s.id === employees.find(e => e.id === request.requesterId)?.shiftId);
          currentBreaks = Array.isArray(assignedShift?.breaks) ? assignedShift.breaks : [];
        }
        const matchIndex = currentBreaks.findIndex((b: any) => b.startTime === request.currentBreakStart && b.endTime === request.currentBreakEnd);
        const updatedBreaks = [...currentBreaks];
        const replacementBreak = {
          ...(matchIndex >= 0 ? updatedBreaks[matchIndex] : {}),
          id: matchIndex >= 0 ? updatedBreaks[matchIndex].id : `break-${request.id}`,
          name: matchIndex >= 0 ? updatedBreaks[matchIndex].name : 'Break',
          nameAr: matchIndex >= 0 ? updatedBreaks[matchIndex].nameAr : 'بريك',
          nameEn: matchIndex >= 0 ? updatedBreaks[matchIndex].nameEn : 'Break',
          startTime: request.requestedBreakStart,
          endTime: request.requestedBreakEnd,
          durationMinutes: (Number(String(request.requestedBreakEnd).split(':')[0]) * 60 + Number(String(request.requestedBreakEnd).split(':')[1])) - (Number(String(request.requestedBreakStart).split(':')[0]) * 60 + Number(String(request.requestedBreakStart).split(':')[1]))
        };
        if (matchIndex >= 0) updatedBreaks[matchIndex] = replacementBreak;
        else updatedBreaks.push(replacementBreak);
        const saveResponse = await fetch('/api/employee-breaks', {
          method: 'POST', credentials: 'include', cache: 'no-store',
          headers: authHeaders({ 'Content-Type': 'application/json', Accept: 'application/json', 'Cache-Control': 'no-cache' }),
          body: JSON.stringify({ employeeId: request.requesterId, date: request.date, breaks: updatedBreaks })
        });
        const savedPayload = await parseResponse(saveResponse);
        if (!saveResponse.ok || savedPayload?.success !== true) throw new Error(String(savedPayload?.error || 'Could not save approved break'));
        nextNotifications = [...notifications, makeNotification(request.requesterId, 'shift_changed', lang === 'ar' ? 'تم اعتماد تغيير البريك' : 'Break Change Approved', lang === 'ar' ? `تم اعتماد البريك الجديد ليوم ${request.date}: ${request.requestedBreakStart}-${request.requestedBreakEnd}.` : `Your break change for ${request.date} was approved: ${request.requestedBreakStart}-${request.requestedBreakEnd}.`, request.id, now)];
        await syncState(nextRequests, nextNotifications);
      } catch (error) {
        console.error('[ShiftSwap] Break approval failed:', error);
        setLoading(false);
        window.alert(lang === 'ar' ? 'تعذر حفظ تغيير البريك. لم يتم اعتماد الطلب؛ راجع صلاحيات الأدمن واتصال قاعدة البيانات.' : 'Could not save the break change. The request was not approved; check admin permissions and database connectivity.');
        return;
      }
    } else if (status === 'approved') {
      const nextAssignments = [...assignments];
      const a = nextAssignments.findIndex(x => key(x.employeeId, x.date) === key(request.requesterId, request.date));
      const b = nextAssignments.findIndex(x => key(x.employeeId, x.date) === key(request.targetEmployeeId, request.date));
      const requesterCurrent = a >= 0 ? nextAssignments[a] : undefined;
      const targetCurrent = b >= 0 ? nextAssignments[b] : undefined;
      if (!requesterCurrent || !targetCurrent) {
        setLoading(false);
        window.alert(lang === 'ar' ? 'تعذر اعتماد الاسواب: لا يوجد سجل شيفت محفوظ لأحد الموظفين في هذا التاريخ.' : 'Cannot approve swap: a saved shift assignment is missing for one of the employees on this date.');
        return;
      }
      nextAssignments[a] = { ...requesterCurrent, shiftId: request.targetShiftId, assignedBy: currentUser?.id, updatedAt: now };
      nextAssignments[b] = { ...targetCurrent, shiftId: request.requesterShiftId, assignedBy: currentUser?.id, updatedAt: now };
      nextNotifications = [...notifications,
        makeNotification(request.requesterId, 'shift_changed', lang === 'ar' ? 'تم اعتماد تبديل الشفت' : 'Shift Swap Approved', lang === 'ar' ? `تم اعتماد تبديل الشفت مع ${name(request.targetEmployeeId)} ليوم ${request.date}. شفتك الآن ${shiftName(request.targetShiftId)}.` : `Your shift swap with ${name(request.targetEmployeeId)} for ${request.date} was approved. Your new shift is ${shiftName(request.targetShiftId)}.`, request.id, now),
        makeNotification(request.targetEmployeeId, 'shift_changed', lang === 'ar' ? 'تم اعتماد تبديل الشفت' : 'Shift Swap Approved', lang === 'ar' ? `تم اعتماد تبديل الشفت مع ${name(request.requesterId)} ليوم ${request.date}. شفتك الآن ${shiftName(request.requesterShiftId)}.` : `Your shift swap with ${name(request.requesterId)} for ${request.date} was approved. Your new shift is ${shiftName(request.requesterShiftId)}.`, request.id, now)
      ];
      try { await syncState(nextRequests, nextNotifications, nextAssignments); }
      catch (error) {
        console.error('[ShiftSwap] Shift swap persistence failed:', error);
        setLoading(false);
        window.alert(lang === 'ar' ? 'تعذر حفظ الاسواب في قاعدة البيانات. لم يتم تأكيد نجاح التبديل.' : 'Could not save the shift swap to the database. The swap has not been confirmed.');
        return;
      }
    } else {
      nextNotifications = [...notifications,
        makeNotification(request.requesterId, 'shift_swap_rejected', lang === 'ar' ? 'تم رفض تبديل الشفت' : 'Shift Swap Rejected', lang === 'ar' ? `الليدر رفض تبديل الشفت مع ${name(request.targetEmployeeId)} ليوم ${request.date}.` : `The leader rejected the shift swap with ${name(request.targetEmployeeId)} for ${request.date}.`, request.id, now),
        makeNotification(request.targetEmployeeId, 'shift_swap_rejected', lang === 'ar' ? 'تم رفض تبديل الشفت' : 'Shift Swap Rejected', lang === 'ar' ? `الليدر رفض تبديل الشفت مع ${name(request.requesterId)} ليوم ${request.date}.` : `The leader rejected the shift swap with ${name(request.requesterId)} for ${request.date}.`, request.id, now)
      ];
      await syncState(nextRequests, nextNotifications);
    }
    setLoading(false);
  };

  const selectedMine = date && currentUser ? shiftAt(currentUser.id, date) : undefined;
  const selectedTarget = date && targetId ? shiftAt(targetId, date) : undefined;
  const visibleRequests = isLeader
    ? requests.filter(r => r.status !== 'awaiting_target' && (r.requestType === 'break' ? currentUser?.role === 'admin' || team.some(e => e.id === r.requesterId) : team.some(e => e.id === r.requesterId || e.id === r.targetEmployeeId)))
    : requests.filter(r => r.requesterId === currentUser?.id || r.targetEmployeeId === currentUser?.id);

  return <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-4 space-y-4">
    <div className="flex items-center gap-2"><ArrowLeftRight className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /><h4 className="text-sm font-black text-slate-900 dark:text-white dark:text-slate-100">{lang === 'ar' ? 'تبديل الشفت' : 'Shift Swap'}</h4></div>
    {!isLeader && currentUser && <div className="space-y-3">
      <div className="mb-3">
        <label className="text-xs font-bold text-slate-700 dark:text-slate-300">{lang === 'ar' ? 'نوع الطلب' : 'Request type'}
          <select value={requestType} onChange={e => setRequestType(e.target.value as 'shift' | 'break')} className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2">
            <option value="shift">{lang === 'ar' ? 'تبديل شفت مع موظف' : 'Swap shift with employee'}</option>
            <option value="break">{lang === 'ar' ? 'تغيير وقت البريك الخاص بي' : 'Change my break time'}</option>
          </select>
        </label>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <label className="text-xs font-bold text-slate-700 dark:text-slate-300">{lang === 'ar' ? 'تاريخ الطلب' : 'Request Date'}<input type="date" value={date} onChange={e => setDate(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2" /></label>
        {requestType === 'shift' ? <label className="text-xs font-bold text-slate-700 dark:text-slate-300">{lang === 'ar' ? 'التبديل مع' : 'Swap With'}<select value={targetId} onChange={e => setTargetId(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2"><option value="">{lang === 'ar' ? 'اختيار الموظف' : 'Select employee'}</option>{team.map(e => <option key={e.id} value={e.id}>{e.code} - {lang === 'ar' ? e.nameAr : e.nameEn}</option>)}</select></label> : <div className="grid grid-cols-2 gap-2 md:col-span-2">
          <label className="text-xs font-bold text-slate-700 dark:text-slate-300">{lang === 'ar' ? 'البريك الحالي من' : 'Current break from'}<input type="time" value={currentBreakStart} onChange={e => setCurrentBreakStart(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-2" /></label>
          <label className="text-xs font-bold text-slate-700 dark:text-slate-300">{lang === 'ar' ? 'إلى' : 'to'}<input type="time" value={currentBreakEnd} onChange={e => setCurrentBreakEnd(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-2" /></label>
          <label className="text-xs font-bold text-slate-700 dark:text-slate-300">{lang === 'ar' ? 'الوقت الجديد من' : 'New break from'}<input type="time" value={requestedBreakStart} onChange={e => setRequestedBreakStart(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-2" /></label>
          <label className="text-xs font-bold text-slate-700 dark:text-slate-300">{lang === 'ar' ? 'إلى' : 'to'}<input type="time" value={requestedBreakEnd} onChange={e => setRequestedBreakEnd(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-2" /></label>
        </div>}
        <div className="flex items-end"><button type="button" onClick={submit} disabled={requestType === 'shift' ? (!date || !targetId || !selectedMine || !selectedTarget) : (!date || !currentBreakStart || !currentBreakEnd || !requestedBreakStart || !requestedBreakEnd || currentBreakEnd <= currentBreakStart || requestedBreakEnd <= requestedBreakStart)} className="w-full rounded-xl bg-emerald-600 text-white px-4 py-2.5 text-xs font-black disabled:opacity-50">{lang === 'ar' ? 'إرسال الطلب' : 'Submit Request'}</button></div>
      </div>
      {date && targetId && <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 text-xs">
        <div className="font-black text-slate-800 dark:text-slate-200 mb-2">{lang === 'ar' ? `الشفتات في يوم ${date}` : `Shifts on ${date}`}</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2"><div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 px-3 py-2"><span className="font-bold">{name(currentUser.id)}:</span> {shiftLabel(selectedMine)}</div><div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 px-3 py-2"><span className="font-bold">{name(targetId)}:</span> {shiftLabel(selectedTarget)}</div></div>
        {(!selectedMine || !selectedTarget) && <div className="mt-2 text-amber-700 dark:text-amber-300">{lang === 'ar' ? 'لا يمكن إرسال Swap إلا إذا كان الموظفان محدد لهما شفت في هذا التاريخ.' : 'Both employees must have a shift assigned on this exact date.'}</div>}
      </div>}
    </div>}
    <div className="space-y-2">
      {visibleRequests.length === 0 ? <div className="text-xs text-slate-500 dark:text-slate-400">{lang === 'ar' ? 'لا توجد طلبات تبديل.' : 'No shift swap requests.'}</div> : visibleRequests.map(r => <div key={r.id} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="min-w-0"><div className="text-xs font-black text-slate-900 dark:text-white dark:text-slate-100">{r.requestType === 'break' ? name(r.requesterId) : <>{name(r.requesterId)} ↔ {name(r.targetEmployeeId)}</>}</div><div className="text-[11px] text-slate-500 mt-1 dark:text-slate-400">{r.date} · {r.requestType === 'break' ? (lang === 'ar' ? `بريك: ${r.currentBreakStart}-${r.currentBreakEnd} ← ${r.requestedBreakStart}-${r.requestedBreakEnd}` : `Break: ${r.currentBreakStart}-${r.currentBreakEnd} → ${r.requestedBreakStart}-${r.requestedBreakEnd}`) : `${shiftName(r.requesterShiftId)} ↔ ${shiftName(r.targetShiftId)}`}</div></div>
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-black px-2 py-1 rounded-lg ${r.status === 'approved' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' : r.status === 'rejected' ? 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300' : 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'}`}>{r.status === 'approved' ? (lang === 'ar' ? 'معتمد' : 'Approved') : r.status === 'rejected' ? (lang === 'ar' ? 'مرفوض' : 'Rejected') : (lang === 'ar' ? 'موافقة الليدر مطلوبة' : 'Leader approval required')}</span>
            {!isLeader && r.targetEmployeeId === currentUser?.id && r.status === 'awaiting_target' && <><button disabled={loading} type="button" onClick={() => respondAsTarget(r.id, 'accepted')} className="p-2 rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" title={lang === 'ar' ? 'موافقة' : 'Accept'}><Check className="w-4 h-4" /></button><button disabled={loading} type="button" onClick={() => respondAsTarget(r.id, 'rejected')} className="p-2 rounded-lg bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300" title={lang === 'ar' ? 'رفض' : 'Reject'}><X className="w-4 h-4" /></button></>}
            {isLeader && r.status === 'pending' && (r.requestType !== 'break' || currentUser?.role === 'admin') && <><button disabled={loading} type="button" onClick={() => review(r, 'approved')} className="p-2 rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" title={lang === 'ar' ? 'اعتماد' : 'Approve'}><Check className="w-4 h-4" /></button><button disabled={loading} type="button" onClick={() => review(r, 'rejected')} className="p-2 rounded-lg bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300" title={lang === 'ar' ? 'رفض' : 'Reject'}><X className="w-4 h-4" /></button></>}
          </div>
        </div>
      </div>)}
    </div>
  </section>;
};

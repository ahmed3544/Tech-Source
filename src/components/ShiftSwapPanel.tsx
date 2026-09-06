import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight, Check, Clock3, X } from 'lucide-react';
import { DailyShiftAssignment, Employee, Language, Shift, ShiftSwapRequest } from '../types';

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
  const [date, setDate] = useState('');
  const [targetId, setTargetId] = useState('');
  const [loading, setLoading] = useState(false);
  const isLeader = currentUser?.role === 'leader' || currentUser?.role === 'admin';
  const team = useMemo(() => {
    if (!currentUser) return [];
    if (currentUser.role === 'admin') return employees.filter(e => e.id !== currentUser.id && e.status === 'active');
    const explicit = employees.some(e => e.teamLeaderId === currentUser.id);
    return employees.filter(e => e.status === 'active' && e.id !== currentUser.id && (explicit ? e.teamLeaderId === currentUser.id : (!currentUser.teamId || e.teamId === currentUser.teamId)));
  }, [employees, currentUser]);

  const shiftAt = (employeeId: string, day: string) => {
    const a = assignments.find(x => x.employeeId === employeeId && x.date === day);
    return shifts.find(s => s.id === (a?.shiftId || employees.find(e => e.id === employeeId)?.shiftId));
  };

  const save = async (next: ShiftSwapRequest[]) => {
    setRequests(next);
    localStorage.setItem('shift_swap_requests', JSON.stringify(next));
    try { await fetch('/api/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ shiftSwapRequests: next }) }); } catch {}
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const local = localStorage.getItem('shift_swap_requests');
        if (local) setRequests(JSON.parse(local));
        const r = await fetch('/api/data');
        if (r.ok) { const d = await r.json(); if (!cancelled && Array.isArray(d.shiftSwapRequests)) { setRequests(d.shiftSwapRequests); localStorage.setItem('shift_swap_requests', JSON.stringify(d.shiftSwapRequests)); } }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  const submit = async () => {
    if (!currentUser || !date || !targetId || targetId === currentUser.id) return;
    const mine = shiftAt(currentUser.id, date);
    const theirs = shiftAt(targetId, date);
    if (!mine || !theirs) return;
    const exists = requests.some(r => r.status === 'pending' && r.date === date && ((r.requesterId === currentUser.id && r.targetEmployeeId === targetId) || (r.requesterId === targetId && r.targetEmployeeId === currentUser.id)));
    if (exists) return;
    const req: ShiftSwapRequest = { id: `swap-${Date.now()}-${Math.random().toString(36).slice(2,8)}`, requesterId: currentUser.id, targetEmployeeId: targetId, date, requesterShiftId: mine.id, targetShiftId: theirs.id, status: 'pending', createdAt: new Date().toISOString() };
    await save([...requests, req]);
    setTargetId('');
  };

  const review = async (request: ShiftSwapRequest, status: 'approved' | 'rejected') => {
    if (!isLeader) return;
    setLoading(true);
    const nextRequests = requests.map(r => r.id === request.id ? { ...r, status, reviewedBy: currentUser?.id, reviewedAt: new Date().toISOString() } : r);
    if (status === 'approved') {
      const nextAssignments = [...assignments];
      const a = nextAssignments.findIndex(x => key(x.employeeId, x.date) === key(request.requesterId, request.date));
      const b = nextAssignments.findIndex(x => key(x.employeeId, x.date) === key(request.targetEmployeeId, request.date));
      const now = new Date().toISOString();
      const requesterAssignment = { employeeId: request.requesterId, date: request.date, shiftId: request.targetShiftId, assignedBy: currentUser?.id, updatedAt: now };
      const targetAssignment = { employeeId: request.targetEmployeeId, date: request.date, shiftId: request.requesterShiftId, assignedBy: currentUser?.id, updatedAt: now };
      if (a >= 0) nextAssignments[a] = requesterAssignment; else nextAssignments.push(requesterAssignment);
      if (b >= 0) nextAssignments[b] = targetAssignment; else nextAssignments.push(targetAssignment);
      localStorage.setItem('daily_shift_assignments', JSON.stringify(nextAssignments));
      try { await fetch('/api/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dailyShiftAssignments: nextAssignments, shiftSwapRequests: nextRequests }) }); } catch {}
    } else {
      try { await fetch('/api/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ shiftSwapRequests: nextRequests }) }); } catch {}
    }
    setRequests(nextRequests);
    setLoading(false);
  };

  const visibleRequests = isLeader ? requests.filter(r => team.some(e => e.id === r.requesterId || e.id === r.targetEmployeeId)) : requests.filter(r => r.requesterId === currentUser?.id || r.targetEmployeeId === currentUser?.id);
  const name = (id: string) => { const e = employees.find(x => x.id === id); return e ? (lang === 'ar' ? e.nameAr : e.nameEn) : id; };
  const shiftName = (id: string) => { const s = shifts.find(x => x.id === id); return s ? `${lang === 'ar' ? s.nameAr : s.nameEn} · ${s.startTime}-${s.endTime}` : '—'; };

  return <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-4">
    <div className="flex items-center gap-2"><ArrowLeftRight className="w-4 h-4 text-emerald-600" /><h4 className="text-sm font-black text-slate-900">{lang === 'ar' ? 'تبديل الشفت' : 'Shift Swap'}</h4></div>
    {!isLeader && currentUser && <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      <label className="text-xs font-bold text-slate-700">{lang === 'ar' ? 'التاريخ' : 'Date'}<input type="date" value={date} onChange={e => setDate(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2" /></label>
      <label className="text-xs font-bold text-slate-700">{lang === 'ar' ? 'التبديل مع' : 'Swap With'}<select value={targetId} onChange={e => setTargetId(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2"><option value="">{lang === 'ar' ? 'اختيار الموظف' : 'Select employee'}</option>{team.map(e => <option key={e.id} value={e.id}>{e.code} - {lang === 'ar' ? e.nameAr : e.nameEn}</option>)}</select></label>
      <div className="flex items-end"><button type="button" onClick={submit} className="w-full rounded-xl bg-emerald-600 text-white px-4 py-2.5 text-xs font-black">{lang === 'ar' ? 'إرسال الطلب' : 'Submit Request'}</button></div>
    </div>}
    <div className="space-y-2">
      {visibleRequests.length === 0 ? <div className="text-xs text-slate-500">{lang === 'ar' ? 'لا توجد طلبات تبديل.' : 'No shift swap requests.'}</div> : visibleRequests.map(r => <div key={r.id} className="rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="min-w-0"><div className="text-xs font-black text-slate-900">{name(r.requesterId)} ↔ {name(r.targetEmployeeId)}</div><div className="text-[11px] text-slate-500 mt-1">{r.date} · {shiftName(r.requesterShiftId)} ↔ {shiftName(r.targetShiftId)}</div></div>
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-black px-2 py-1 rounded-lg ${r.status === 'approved' ? 'bg-emerald-50 text-emerald-700' : r.status === 'rejected' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'}`}>{r.status === 'approved' ? (lang === 'ar' ? 'معتمد' : 'Approved') : r.status === 'rejected' ? (lang === 'ar' ? 'مرفوض' : 'Rejected') : (lang === 'ar' ? 'قيد المراجعة' : 'Pending')}</span>
            {isLeader && r.status === 'pending' && <><button disabled={loading} type="button" onClick={() => review(r, 'approved')} className="p-2 rounded-lg bg-emerald-50 text-emerald-700"><Check className="w-4 h-4" /></button><button disabled={loading} type="button" onClick={() => review(r, 'rejected')} className="p-2 rounded-lg bg-rose-50 text-rose-700"><X className="w-4 h-4" /></button></>}
          </div>
        </div>
      </div>)}
    </div>
  </section>;
};

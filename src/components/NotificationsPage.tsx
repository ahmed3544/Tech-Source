import React, { useMemo, useState } from 'react';
import { Bell, CheckCheck, Check, X, ArrowRight, ArrowLeft } from 'lucide-react';
import { Notification, Language, ShiftSwapRequest, Employee } from '../types';

interface Props {
  notifications: Notification[];
  currentUserId?: string;
  lang: Language;
  onMarkAsRead?: (id: string) => void;
  onMarkAllAsRead?: () => void;
  onBack?: () => void;
}

export const NotificationsPage: React.FC<Props> = ({ notifications, currentUserId, lang, onMarkAsRead, onMarkAllAsRead, onBack }) => {
  const [actingSwapId, setActingSwapId] = useState<string | null>(null);
  const list = useMemo(() => currentUserId ? notifications.filter(n => n.recipientId === currentUserId).slice().sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) : [], [notifications, currentUserId]);
  const unread = list.filter(n => !n.isRead).length;

  const title = (n: Notification) => {
    if (lang === 'ar') {
      const t: Record<string,string> = {
        leave_requested:'طلب إجازة جديد', leave_approved:'تم قبول الإجازة', leave_rejected:'تم رفض الإجازة',
        overtime_requested:'طلب عمل إضافي جديد', overtime_approved:'تم اعتماد العمل الإضافي', overtime_rejected:'تم رفض العمل الإضافي',
        shift_changed:'تم تغيير الشفت', shift_swap_requested:'طلب تبديل شفت جديد', shift_swap_accepted:'تمت الموافقة على تبديل الشفت',
        shift_swap_rejected:'تم رفض تبديل الشفت', admin_notice:'إشعار إداري'
      }; return t[n.type] || n.title;
    }
    return n.title;
  };

  const respondToSwap = async (notification: Notification, action: 'accept' | 'reject') => {
    if (!currentUserId || notification.type !== 'shift_swap_requested' || !notification.relatedShiftSwapId) return;
    setActingSwapId(notification.relatedShiftSwapId);
    try {
      const response = await fetch(`/api/data?_=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('Failed to load current data');
      const data = await response.json();
      const requests: ShiftSwapRequest[] = Array.isArray(data.shiftSwapRequests) ? data.shiftSwapRequests : [];
      const currentNotifications: Notification[] = Array.isArray(data.notifications) ? data.notifications : [];
      const employees: Employee[] = Array.isArray(data.employees) ? data.employees : [];
      const request = requests.find(r => r.id === notification.relatedShiftSwapId && r.targetEmployeeId === currentUserId && r.status === 'awaiting_target');
      if (!request) return;

      const now = new Date().toISOString();
      const nextStatus: ShiftSwapRequest['status'] = action === 'accept' ? 'pending' : 'rejected';
      const nextRequests = requests.map(r => r.id === request.id ? { ...r, status: nextStatus, targetRespondedAt: now } : r);
      let nextNotifications = currentNotifications.map(n => n.id === notification.id ? { ...n, isRead: true, updatedAt: now } : n);

      if (action === 'accept') {
        const leaderId = employees.find(e => e.id === request.requesterId)?.teamLeaderId;
        const recipients = leaderId ? [leaderId] : employees.filter(e => e.role === 'leader' || e.role === 'admin').map(e => e.id);
        const additions: Notification[] = recipients.map(recipientId => ({
          id: `notif-swap-${request.id}-${recipientId}-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
          recipientId,
          type: 'shift_swap_accepted',
          title: lang === 'ar' ? 'تمت الموافقة على Swap' : 'Shift Swap Accepted',
          message: lang === 'ar' ? `تمت موافقة الموظف المستلم على طلب تبديل الشفت ليوم ${request.date}. الطلب الآن ظاهر لليدر للمراجعة.` : `The receiving employee accepted the shift swap for ${request.date}. The request is now ready for leader review.`,
          relatedShiftSwapId: request.id,
          isRead: false,
          createdAt: now,
          updatedAt: now,
        }));
        nextNotifications = [...nextNotifications, ...additions];
      } else {
        nextNotifications = [...nextNotifications, {
          id: `notif-swap-rejected-${request.id}-${request.requesterId}-${Date.now()}`,
          recipientId: request.requesterId,
          type: 'shift_swap_rejected',
          title: lang === 'ar' ? 'تم رفض طلب تبديل الشفت' : 'Shift Swap Rejected',
          message: lang === 'ar' ? `تم رفض طلب تبديل الشفت ليوم ${request.date}.` : `The shift swap request for ${request.date} was rejected.`,
          relatedShiftSwapId: request.id,
          isRead: false,
          createdAt: now,
          updatedAt: now,
        }];
      }

      localStorage.setItem('shift_swap_requests', JSON.stringify(nextRequests));
      localStorage.setItem('notifications', JSON.stringify(nextNotifications));
      const sync = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shiftSwapRequests: nextRequests, notifications: nextNotifications, lastUpdated: Date.now() })
      });
      if (!sync.ok) throw new Error(`Sync failed: ${sync.status}`);
      onMarkAsRead?.(notification.id);
    } finally {
      setActingSwapId(null);
    }
  };

  return <section dir={lang === 'ar' ? 'rtl' : 'ltr'} className="min-h-[calc(100vh-72px)] w-full bg-slate-50 dark:bg-slate-950 px-3 sm:px-6 py-4 sm:py-6">
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="h-9 w-9 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800">{lang === 'ar' ? <ArrowRight size={17}/> : <ArrowLeft size={17}/>}</button>
          <div><h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">{lang === 'ar' ? 'الإشعارات' : 'Notifications'}</h1><p className="text-xs text-slate-500 dark:text-slate-400 font-bold mt-0.5">{lang === 'ar' ? `${list.length} إشعار • ${unread} غير مقروء` : `${list.length} notifications • ${unread} unread`}</p></div>
        </div>
        {unread > 0 && <button onClick={onMarkAllAsRead} className="h-9 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black flex items-center gap-1.5"><CheckCheck size={15}/>{lang === 'ar' ? 'قراءة الكل' : 'Mark all read'}</button>}
      </div>
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
        {list.length === 0 ? <div className="py-20 text-center text-slate-500 dark:text-slate-400"><Bell className="mx-auto mb-3 opacity-40" size={34}/><p className="font-bold">{lang === 'ar' ? 'لا توجد إشعارات' : 'No notifications'}</p></div> : <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {list.map(n => <article key={n.id} className={`p-4 sm:p-5 transition ${!n.isRead ? 'bg-emerald-50/60 dark:bg-emerald-950/20' : ''}`}>
            <div className="flex gap-3">
              <div className={`mt-0.5 h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${!n.isRead ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-300' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}><Bell size={17}/></div>
              <div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="text-sm font-black text-slate-900 dark:text-white">{title(n)}</h2><p className="text-sm text-slate-600 dark:text-slate-300 mt-1 leading-6">{n.message}</p><time className="block text-[11px] text-slate-400 mt-2 font-semibold">{new Date(n.createdAt).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-US')}</time>
                {n.type === 'shift_swap_requested' && n.relatedShiftSwapId && <div className="flex gap-2 mt-3"><button type="button" disabled={actingSwapId === n.relatedShiftSwapId} onClick={() => void respondToSwap(n, 'accept')} className="flex-1 rounded-lg bg-emerald-600 text-white px-3 py-2 text-xs font-black flex items-center justify-center gap-1 disabled:opacity-50"><Check size={14}/>{lang === 'ar' ? 'موافقة' : 'Accept'}</button><button type="button" disabled={actingSwapId === n.relatedShiftSwapId} onClick={() => void respondToSwap(n, 'reject')} className="flex-1 rounded-lg bg-rose-600 text-white px-3 py-2 text-xs font-black flex items-center justify-center gap-1 disabled:opacity-50"><X size={14}/>{lang === 'ar' ? 'رفض' : 'Reject'}</button></div>}
              </div>{!n.isRead && n.type !== 'shift_swap_requested' && <button onClick={() => onMarkAsRead?.(n.id)} className="shrink-0 text-[11px] font-black text-emerald-600 dark:text-emerald-400 flex items-center gap-1"><Check size={13}/>{lang === 'ar' ? 'مقروء' : 'Read'}</button>}</div></div>
            </div>
          </article>)}
        </div>}
      </div>
    </div>
  </section>;
};

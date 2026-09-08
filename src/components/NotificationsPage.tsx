import React, { useEffect, useMemo, useState } from 'react';
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

const normalizeNotifications = (items: unknown, currentUserId?: string): Notification[] => {
  if (!Array.isArray(items) || !currentUserId) return [];

  const userId = String(currentUserId).trim();
  const seen = new Set<string>();

  return items.filter((item): item is Notification => {
    if (!item || typeof item !== 'object') return false;
    const n = item as Notification;
    const id = String(n.id || '').trim();
    const recipientId = String(n.recipientId || '').trim();
    const hasContent = Boolean(String(n.title || '').trim() || String(n.message || '').trim());

    if (!id || !recipientId || recipientId !== userId || !hasContent || seen.has(id)) {
      return false;
    }

    seen.add(id);
    return true;
  });
};

export const NotificationsPage: React.FC<Props> = ({ notifications, currentUserId, lang, onMarkAsRead, onMarkAllAsRead, onBack }) => {
  const [actingSwapId, setActingSwapId] = useState<string | null>(null);
  const [serverNotifications, setServerNotifications] = useState<Notification[] | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!currentUserId) {
      setServerNotifications([]);
      return () => { cancelled = true; };
    }

    const loadNotifications = async () => {
      try {
        const response = await fetch(`/api/data?_=${Date.now()}`, {
          method: 'GET',
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
        });

        if (!response.ok) throw new Error(`Notification data request failed: ${response.status}`);

        const data = await response.json();

        if (!cancelled) {
          setServerNotifications(normalizeNotifications(data?.notifications, currentUserId));
        }
      } catch {
        if (!cancelled) setServerNotifications(null);
      }
    };

    void loadNotifications();
    const interval = window.setInterval(() => { void loadNotifications(); }, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [currentUserId]);

  const list = useMemo(() => {
    const source = serverNotifications ?? notifications;
    return normalizeNotifications(source, currentUserId)
      .slice()
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [serverNotifications, notifications, currentUserId]);

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
      const nextRequests = requests.map(r => r.id === request.id ? { ...r, status: nextStatus, reviewedAt: now } : r);
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

      <div className="space-y-2.5">
        {list.length === 0 ? (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 text-center text-slate-500 dark:text-slate-400">
            <Bell size={30} className="mx-auto mb-2 opacity-50" />
            <p className="font-bold">{lang === 'ar' ? 'لا توجد إشعارات' : 'No notifications'}</p>
          </div>
        ) : list.map(notification => {
          const isUnread = !notification.isRead;
          const canRespond = notification.type === 'shift_swap_requested' && Boolean(notification.relatedShiftSwapId);
          const isActing = actingSwapId === notification.relatedShiftSwapId;
          return (
            <article key={notification.id} className={`rounded-xl border p-4 bg-white dark:bg-slate-900 ${isUnread ? 'border-emerald-300 dark:border-emerald-700' : 'border-slate-200 dark:border-slate-800'}`}>
              <div className="flex items-start gap-3">
                <div className={`h-9 w-9 shrink-0 rounded-lg flex items-center justify-center ${isUnread ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'}`}><Bell size={17}/></div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className={`text-sm font-black ${isUnread ? 'text-slate-900 dark:text-white' : 'text-slate-700 dark:text-slate-300'}`}>{title(notification)}</h2>
                      <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-400">{notification.message}</p>
                    </div>
                    {isUnread && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald-500" aria-label="unread" />}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-bold text-slate-400">{new Date(notification.createdAt).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-US')}</span>
                    {isUnread && !canRespond && <button onClick={() => onMarkAsRead?.(notification.id)} className="h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-black text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"><Check size={14} className="inline mr-1"/>{lang === 'ar' ? 'تحديد كمقروء' : 'Mark read'}</button>}
                    {canRespond && <>
                      <button disabled={isActing} onClick={() => respondToSwap(notification, 'accept')} className="h-8 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-black"><Check size={14} className="inline mr-1"/>{lang === 'ar' ? 'موافقة' : 'Accept'}</button>
                      <button disabled={isActing} onClick={() => respondToSwap(notification, 'reject')} className="h-8 px-2.5 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-black"><X size={14} className="inline mr-1"/>{lang === 'ar' ? 'رفض' : 'Reject'}</button>
                    </>}
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  </section>;
};

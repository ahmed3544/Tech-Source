import React, { useEffect, useMemo, useState } from 'react';
import { Bell, CheckCheck, Check, X, ArrowRight, ArrowLeft } from 'lucide-react';
import { Notification, Language, ShiftSwapRequest, Employee } from '../types';

interface Props {
  notifications?: Notification[];
  currentUserId?: string;
  lang: Language;
  onMarkAsRead?: (id: string) => void;
  onMarkAllAsRead?: () => void;
  onBack?: () => void;
  onOpenNotification?: (notification: Notification) => void;
}

const normalize = (items: unknown, currentUserId?: string): Notification[] => {
  if (!Array.isArray(items) || !currentUserId) return [];
  const userId = String(currentUserId).trim();
  const seen = new Set<string>();
  return items
    .filter((item): item is Notification => {
      if (!item || typeof item !== 'object') return false;
      const n = item as Notification;
      const id = String(n.id || '').trim();
      const recipientId = String(n.recipientId || '').trim();
      if (!id || recipientId !== userId || seen.has(id)) return false;
      seen.add(id);
      (n as any).isRead = Boolean(n.isRead ?? (n as any).is_read ?? false);
      return true;
    })
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
};

const notificationTitle = (n: Notification, lang: Language) => {
  if (n.title?.trim()) return n.title;
  if (lang === 'ar') {
    const titles: Record<string, string> = {
      leave_requested: 'طلب إجازة جديد',
      leave_approved: 'تم قبول الإجازة',
      leave_rejected: 'تم رفض الإجازة',
      overtime_requested: 'طلب عمل إضافي جديد',
      overtime_approved: 'تم اعتماد العمل الإضافي',
      overtime_rejected: 'تم رفض العمل الإضافي',
      shift_changed: 'تم تغيير الشفت',
      shift_swap_requested: 'طلب تبديل شفت جديد',
      shift_swap_accepted: 'تمت الموافقة على تبديل الشفت',
      shift_swap_rejected: 'تم رفض تبديل الشفت',
      admin_notice: 'إشعار إداري',
    };
    return titles[n.type] || 'إشعار جديد';
  }
  return n.type?.replace(/_/g, ' ') || 'Notification';
};

export const NotificationsPage: React.FC<Props> = ({ currentUserId, lang, onBack, onOpenNotification }) => {
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [actingSwapId, setActingSwapId] = useState<string | null>(null);

  const load = async (silent = false) => {
    if (!currentUserId) {
      setItems([]);
      setLoading(false);
      setError(false);
      return;
    }
    if (!silent) setLoading(true);
    try {
      const url = `/api/notifications?userId=${encodeURIComponent(String(currentUserId).trim())}&_=${Date.now()}`;
      const response = await fetch(url, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
      });
      if (!response.ok) throw new Error(String(response.status));
      const data = await response.json();
      if (!data?.success) throw new Error('notifications_failed');
      setItems(normalize(data.notifications, currentUserId));
      setError(false);
    } catch {
      if (!silent) setError(true);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    void load(false);
    if (!currentUserId) return;
    let connected = false;
    const stream = new EventSource(`/api/notifications/stream?userId=${encodeURIComponent(String(currentUserId).trim())}`);
    stream.onopen = () => { connected = true; };
    stream.addEventListener('notification', (event) => {
      try {
        const incoming = JSON.parse((event as MessageEvent).data) as Notification;
        if (String(incoming.recipientId).trim() !== String(currentUserId).trim()) return;
        setItems((current) => normalize([incoming, ...current], currentUserId));
      } catch { void load(true); }
    });
    stream.onerror = () => { connected = false; };
    const timer = window.setInterval(() => { if (!connected) void load(true); }, 2000);
    return () => { window.clearInterval(timer); stream.close(); };
  }, [currentUserId]);

  const list = useMemo(() => items, [items]);
  const unread = list.filter((notification) => !notification.isRead).length;

  const markRead = async (id: string) => {
    if (!currentUserId) return false;
    const previous = items;
    setItems((current) => current.map((notification) => notification.id === id
      ? { ...notification, isRead: true, updatedAt: new Date().toISOString() }
      : notification));
    try {
      const response = await fetch(`/api/notifications/${encodeURIComponent(id)}/mark-read`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
        body: JSON.stringify({ userId: currentUserId }),
        cache: 'no-store',
      });
      if (!response.ok) throw new Error(String(response.status));
      const data = await response.json();
      if (!data?.success) throw new Error('mark_read_failed');
      if (Array.isArray(data.notifications)) setItems(normalize(data.notifications, currentUserId));
      setError(false);
      return true;
    } catch {
      setItems(previous);
      return false;
    }
  };

  const markAll = async () => {
    if (!currentUserId || unread === 0) return;
    const previous = items;
    setItems((current) => current.map((notification) => ({
      ...notification,
      isRead: true,
      updatedAt: new Date().toISOString(),
    })));
    try {
      const response = await fetch('/api/notifications/mark-all-read', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
        body: JSON.stringify({ userId: currentUserId }),
        cache: 'no-store',
      });
      if (!response.ok) throw new Error(String(response.status));
      const data = await response.json();
      if (!data?.success) throw new Error('mark_all_read_failed');
      if (Array.isArray(data.notifications)) setItems(normalize(data.notifications, currentUserId));
      setError(false);
    } catch {
      setItems(previous);
    }
  };

  const openNotification = async (notification: Notification) => {
    const marked = await markRead(notification.id);
    if (!marked) return;
    onOpenNotification?.(notification);
    try {
      window.dispatchEvent(new CustomEvent('techsource:navigate-notification', { detail: notification }));
    } catch {
      /* noop */
    }
  };

  const respondToSwap = async (notification: Notification, action: 'accept' | 'reject') => {
    if (!currentUserId || notification.type !== 'shift_swap_requested' || !notification.relatedShiftSwapId) return;
    setActingSwapId(notification.relatedShiftSwapId);
    try {
      const response = await fetch(`/api/data?_=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('Failed to load current data');
      const data = await response.json();
      const requests: ShiftSwapRequest[] = Array.isArray(data.shiftSwapRequests) ? data.shiftSwapRequests : [];
      const employees: Employee[] = Array.isArray(data.employees) ? data.employees : [];
      const request = requests.find((item) =>
        item.id === notification.relatedShiftSwapId
        && item.targetEmployeeId === currentUserId
        && item.status === 'awaiting_target'
      );
      if (!request) return;

      const now = new Date().toISOString();
      const nextStatus: ShiftSwapRequest['status'] = action === 'accept' ? 'pending' : 'rejected';
      const nextRequests = requests.map((item) => item.id === request.id
        ? { ...item, status: nextStatus, reviewedAt: now }
        : item);
      const additions: Notification[] = action === 'accept'
        ? (() => {
          const leaderId = employees.find((employee) => employee.id === request.requesterId)?.teamLeaderId;
          const recipients = leaderId
            ? [leaderId]
            : employees.filter((employee) => employee.role === 'leader' || employee.role === 'admin').map((employee) => employee.id);
          return recipients.map((recipientId) => ({
            id: `swap-${request.id}-${recipientId}-accepted`,
            recipientId,
            type: 'shift_swap_accepted',
            title: lang === 'ar' ? 'تمت الموافقة على تبديل الشفت' : 'Shift Swap Accepted',
            message: lang === 'ar'
              ? `تمت الموافقة على طلب تبديل الشفت ليوم ${request.date}. الطلب الآن جاهز للمراجعة.`
              : `The shift swap for ${request.date} is ready for leader review.`,
            relatedShiftSwapId: request.id,
            isRead: false,
            createdAt: now,
            updatedAt: now,
          } as Notification));
        })()
        : [{
          id: `swap-${request.id}-${request.requesterId}-rejected`,
          recipientId: request.requesterId,
          type: 'shift_swap_rejected',
          title: lang === 'ar' ? 'تم رفض طلب تبديل الشفت' : 'Shift Swap Rejected',
          message: lang === 'ar' ? `تم رفض طلب تبديل الشفت ليوم ${request.date}.` : `The shift swap for ${request.date} was rejected.`,
          relatedShiftSwapId: request.id,
          isRead: false,
          createdAt: now,
          updatedAt: now,
        } as Notification];

      localStorage.setItem('shift_swap_requests', JSON.stringify(nextRequests));
      const sync = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shiftSwapRequests: nextRequests, lastUpdated: Date.now() }),
      });
      if (!sync.ok) throw new Error(`Sync failed: ${sync.status}`);
      for (const item of [{ ...notification, isRead: true, updatedAt: now }, ...additions]) {
        const emit = await fetch('/api/notifications/emit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
          body: JSON.stringify({ notification: item }),
          cache: 'no-store',
        });
        if (!emit.ok) throw new Error(`Notification sync failed: ${emit.status}`);
      }
      await markRead(notification.id);
      await load(true);
    } finally {
      setActingSwapId(null);
    }
  };

  return (
    <section dir={lang === 'ar' ? 'rtl' : 'ltr'} className="min-h-[calc(100vh-72px)] w-full bg-slate-50 dark:bg-slate-950 px-3 sm:px-6 py-4 sm:py-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-3">
            <button type="button" onClick={onBack} className="h-9 w-9 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300">
              {lang === 'ar' ? <ArrowRight size={17} /> : <ArrowLeft size={17} />}
            </button>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">{lang === 'ar' ? 'الإشعارات' : 'Notifications'}</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-bold mt-0.5">{list.length} {lang === 'ar' ? 'إشعار' : 'notifications'} • {unread} {lang === 'ar' ? 'غير مقروء' : 'unread'}</p>
            </div>
          </div>
          {unread > 0 && <button type="button" onClick={() => void markAll()} className="h-9 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black flex items-center gap-1.5"><CheckCheck size={15} />{lang === 'ar' ? 'قراءة الكل' : 'Mark all read'}</button>}
        </div>

        {error && <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 text-amber-800 p-3 text-xs font-bold">{lang === 'ar' ? 'تعذر الاتصال بخدمة الإشعارات.' : 'Notification service unavailable.'}</div>}
        {loading
          ? <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 text-center text-slate-500 font-bold">{lang === 'ar' ? 'جاري تحميل الإشعارات...' : 'Loading notifications...'}</div>
          : list.length === 0
            ? <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 text-center text-slate-500 dark:text-slate-400"><Bell size={30} className="mx-auto mb-2 opacity-50" /><p className="font-bold">{lang === 'ar' ? 'لا توجد إشعارات حالياً' : 'No notifications currently'}</p></div>
            : <div className="space-y-2.5">
              {list.map((notification) => {
                const isUnread = !notification.isRead;
                const canRespond = notification.type === 'shift_swap_requested' && Boolean(notification.relatedShiftSwapId);
                const acting = actingSwapId === notification.relatedShiftSwapId;
                return (
                  <article
                    key={notification.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => void openNotification(notification)}
                    onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') void openNotification(notification); }}
                    className={`cursor-pointer rounded-xl border p-4 bg-white dark:bg-slate-900 transition hover:-translate-y-0.5 hover:shadow-md ${isUnread ? 'border-emerald-300 dark:border-emerald-700' : 'border-slate-200 dark:border-slate-800'}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`h-9 w-9 shrink-0 rounded-lg flex items-center justify-center ${isUnread ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'}`}><Bell size={17} /></div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div><h2 className="text-sm font-black text-slate-900 dark:text-white">{notificationTitle(notification, lang)}</h2><p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-400">{notification.message}</p></div>
                          {isUnread && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald-500" />}
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <span className="text-[11px] font-bold text-slate-400">{new Date(notification.createdAt).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-US')}</span>
                          {isUnread && !canRespond && <button type="button" onClick={(event) => { event.stopPropagation(); void markRead(notification.id); }} className="h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-black text-slate-600 dark:text-slate-300"><Check size={14} className="inline mr-1" />{lang === 'ar' ? 'تحديد كمقروء' : 'Mark read'}</button>}
                          {canRespond && <><button type="button" disabled={acting} onClick={(event) => { event.stopPropagation(); void respondToSwap(notification, 'accept'); }} className="h-8 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-black"><Check size={14} className="inline mr-1" />{lang === 'ar' ? 'موافقة' : 'Accept'}</button><button type="button" disabled={acting} onClick={(event) => { event.stopPropagation(); void respondToSwap(notification, 'reject'); }} className="h-8 px-2.5 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-black"><X size={14} className="inline mr-1" />{lang === 'ar' ? 'رفض' : 'Reject'}</button></>}
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>}
      </div>
    </section>
  );
};

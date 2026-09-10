import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, CheckCheck, ExternalLink, Inbox } from 'lucide-react';
import { Notification, Language } from '../types';
import { NotificationsPage } from './NotificationsPage';

interface NotificationCenterProps {
  notifications?: Notification[];
  currentUserId?: string;
  lang: Language;
  onMarkAsRead?: (notificationId: string) => void;
  onMarkAllAsRead?: () => void;
  onOpenPage?: () => void;
  onOpenNotificationsPage?: () => void;
}

const normalize = (items: unknown, user?: string): Notification[] => {
  if (!Array.isArray(items) || !user) return [];
  const uid = String(user).trim();
  const seen = new Set<string>();
  return items.filter((x): x is Notification => {
    if (!x || typeof x !== 'object') return false;
    const n = x as Notification;
    const id = String(n.id || '').trim();
    const recipientId = String(n.recipientId || '').trim();
    if (!id || recipientId !== uid || seen.has(id)) return false;
    seen.add(id);
    return true;
  }).sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
};

const titleFor = (n: Notification, lang: Language) => {
  const titles: Record<string, string> = {
    leave_requested: lang === 'ar' ? 'طلب إجازة جديد' : 'New Leave Request',
    leave_approved: lang === 'ar' ? 'تم قبول الإجازة' : 'Leave Approved',
    leave_rejected: lang === 'ar' ? 'تم رفض الإجازة' : 'Leave Rejected',
    overtime_requested: lang === 'ar' ? 'طلب عمل إضافي جديد' : 'New Overtime Request',
    overtime_approved: lang === 'ar' ? 'تم اعتماد العمل الإضافي' : 'Overtime Approved',
    overtime_rejected: lang === 'ar' ? 'تم رفض العمل الإضافي' : 'Overtime Rejected',
    shift_changed: lang === 'ar' ? 'تم تغيير الشفت' : 'Shift Changed',
    shift_swap_requested: lang === 'ar' ? 'طلب تبديل شفت جديد' : 'New Shift Swap Request',
    shift_swap_accepted: lang === 'ar' ? 'تمت الموافقة على تبديل الشفت' : 'Shift Swap Accepted',
    shift_swap_rejected: lang === 'ar' ? 'تم رفض تبديل الشفت' : 'Shift Swap Rejected',
    admin_notice: lang === 'ar' ? 'إشعار إداري' : 'Admin Notice',
  };
  return n.title?.trim() || titles[n.type] || n.type.replace(/_/g, ' ');
};

const actionUrlFor = (n: Notification): string => {
  const extended = n as Notification & { action_url?: string; targetUrl?: string; link?: string };
  return String(extended.action_url || extended.targetUrl || extended.link || '').trim();
};

const timeAgo = (value: string | undefined, lang: Language) => {
  if (!value) return '';
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return '';
  let amount = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  let unit: Intl.RelativeTimeFormatUnit = 'second';
  const ranges: Array<[number, Intl.RelativeTimeFormatUnit]> = [[60, 'second'], [60, 'minute'], [24, 'hour'], [7, 'day'], [4.34524, 'week'], [12, 'month']];
  for (let i = 0; i < ranges.length; i += 1) {
    const [divisor, nextUnit] = ranges[i];
    if (amount < divisor || i === ranges.length - 1) { unit = nextUnit; break; }
    amount /= divisor;
  }
  return new Intl.RelativeTimeFormat(lang === 'ar' ? 'ar-EG' : 'en', { numeric: 'auto' }).format(-Math.floor(amount), unit);
};

const dateLabel = (value: string | undefined, lang: Language) => {
  if (!value) return '';
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return '';
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG' : 'en', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(timestamp);
};

const dispatchTarget = (n: Notification) => {
  try { window.dispatchEvent(new CustomEvent('techsource:navigate-notification', { detail: n })); } catch { /* noop */ }
};

export const NotificationCenter: React.FC<NotificationCenterProps> = ({ currentUserId, lang, onOpenPage, onOpenNotificationsPage }) => {
  const [open, setOpen] = useState(false);
  const [showPage, setShowPage] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  const load = async (silent = false) => {
    if (!currentUserId) { setItems([]); return; }
    if (!silent) setLoading(true);
    try {
      const response = await fetch(`/api/notifications?userId=${encodeURIComponent(String(currentUserId).trim())}&_=${Date.now()}`, { cache: 'no-store', headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' } });
      if (!response.ok) throw new Error('notifications request failed');
      const data = await response.json();
      if (!data?.success || !Array.isArray(data.notifications)) throw new Error('notifications response failed');
      setItems(normalize(data.notifications, currentUserId));
      setError(false);
    } catch { setError(true); }
    finally { if (!silent) setLoading(false); }
  };

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(true), 5000);
    const onFocus = () => void load(true);
    window.addEventListener('focus', onFocus);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', onFocus); };
  }, [currentUserId]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false); };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('pointerdown', onPointerDown); document.removeEventListener('keydown', onKeyDown); };
  }, [open]);

  const unreadCount = useMemo(() => items.filter((notification) => !notification.isRead).length, [items]);

  const markRead = async (id: string) => {
    if (!currentUserId) return;
    try {
      const response = await fetch(`/api/notifications/${encodeURIComponent(id)}/mark-read`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' }, body: JSON.stringify({ userId: currentUserId }), cache: 'no-store' });
      if (!response.ok) throw new Error('mark read failed');
      const data = await response.json();
      if (!data?.success) throw new Error('mark read was not persisted');
      if (Array.isArray(data.notifications)) setItems(normalize(data.notifications, currentUserId)); else await load(true);
    } catch { await load(true); }
  };

  const markAll = async () => {
    if (!currentUserId || !unreadCount) return;
    try {
      const response = await fetch('/api/notifications/mark-all-read', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' }, body: JSON.stringify({ userId: currentUserId }), cache: 'no-store' });
      if (!response.ok) throw new Error('mark all read failed');
      const data = await response.json();
      if (!data?.success) throw new Error('mark all read was not persisted');
      if (Array.isArray(data.notifications)) setItems(normalize(data.notifications, currentUserId)); else await load(true);
    } catch { await load(true); }
  };

  const openNotification = async (notification: Notification) => {
    setOpen(false);
    if (!notification.isRead) await markRead(notification.id);
    dispatchTarget(notification);
    const actionUrl = actionUrlFor(notification);
    if (actionUrl) { try { window.location.assign(actionUrl); } catch { /* navigation event fallback */ } }
  };

  const openNotificationsPage = () => {
    setOpen(false);
    const callback = onOpenPage || onOpenNotificationsPage;
    if (callback) { callback(); return; }
    setShowPage(true);
  };

  if (showPage) return <NotificationsPage currentUserId={currentUserId} lang={lang} onBack={() => { setShowPage(false); void load(true); }} />;

  return (
    <div ref={ref} className="relative flex items-center shrink-0 z-[100]" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <button type="button" aria-label={lang === 'ar' ? 'فتح الإشعارات' : 'Open notifications'} aria-expanded={open} onClick={(event) => { event.stopPropagation(); setOpen((value) => !value); }} className="relative p-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/70 transition-colors">
        <Bell size={20} />
        {unreadCount > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center">{unreadCount > 99 ? '99+' : unreadCount}</span>}
      </button>
      {open && (
        <div role="dialog" aria-label={lang === 'ar' ? 'قائمة الإشعارات' : 'Notification list'} className="fixed top-[68px] right-3 sm:right-6 w-[min(380px,calc(100vw-24px))] max-h-[calc(100vh-84px)] overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-900 shadow-2xl z-[2147483647]" onClick={(event) => event.stopPropagation()}>
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
            <div><h3 className="text-sm font-black text-slate-900 dark:text-white">{lang === 'ar' ? 'الإشعارات' : 'Notifications'}</h3><p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mt-0.5">{unreadCount} {lang === 'ar' ? 'غير مقروء' : 'unread'}</p></div>
            {unreadCount > 0 && <button type="button" onClick={() => void markAll()} className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-black text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors"><CheckCheck size={14} />{lang === 'ar' ? 'قراءة الكل' : 'Mark all read'}</button>}
          </div>
          <div className="max-h-[calc(100vh-150px)] overflow-y-auto overscroll-contain">
            {loading && items.length === 0 ? <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">{lang === 'ar' ? 'جاري تحميل الإشعارات...' : 'Loading notifications...'}</div> : items.length > 0 ? items.slice(0, 6).map((notification) => {
              const unread = !notification.isRead; const ago = timeAgo(notification.createdAt, lang); const fullDate = dateLabel(notification.createdAt, lang);
              return <button key={notification.id} type="button" onClick={() => void openNotification(notification)} title={fullDate} className={`group w-full text-start px-4 py-3.5 border-b border-slate-200/80 dark:border-slate-800 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500 ${unread ? 'bg-emerald-50/70 dark:bg-emerald-950/20 hover:bg-emerald-100/80 dark:hover:bg-emerald-950/35' : 'bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/70'}`}><div className="flex gap-3"><span className={`mt-1.5 h-2.5 w-2.5 rounded-full shrink-0 transition-transform group-hover:scale-110 ${unread ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`} /><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><p className={`text-xs text-slate-900 dark:text-white ${unread ? 'font-black' : 'font-bold'}`}>{titleFor(notification, lang)}</p>{actionUrlFor(notification) && <ExternalLink size={13} className="mt-0.5 shrink-0 text-slate-400 group-hover:text-emerald-500 transition-colors" />}</div><p className="text-[11px] leading-5 text-slate-600 dark:text-slate-300 line-clamp-2 mt-0.5">{notification.message}</p><div className="flex items-center gap-2 mt-1.5 text-[10px] font-bold text-slate-400 dark:text-slate-500">{ago && <span>{ago}</span>}{ago && fullDate && <span aria-hidden="true">•</span>}{fullDate && <span className="truncate">{fullDate}</span>}</div></div></div></button>;
            }) : <div className="px-6 py-12 text-center"><div className="mx-auto mb-3 h-12 w-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center"><Inbox size={22} className="text-slate-400" /></div><p className="text-sm font-black text-slate-700 dark:text-slate-200">{error ? lang === 'ar' ? 'تعذر تحميل الإشعارات' : 'Unable to load notifications' : lang === 'ar' ? 'لا توجد إشعارات حالياً' : 'No notifications yet'}</p><p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">{lang === 'ar' ? 'ستظهر هنا أي تحديثات أو طلبات جديدة.' : 'New requests and updates will appear here.'}</p></div>}
          </div>
          <button type="button" onClick={openNotificationsPage} className="w-full px-4 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900 text-xs font-black text-emerald-700 dark:text-emerald-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">{lang === 'ar' ? 'عرض كل الإشعارات' : 'View all notifications'} <ExternalLink size={14} className="inline align-[-2px]" /></button>
        </div>
      )}
    </div>
  );
};

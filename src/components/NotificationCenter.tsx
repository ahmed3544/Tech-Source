import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, Check, CheckCheck, ExternalLink } from 'lucide-react';
import { Notification, Language } from '../types';

interface NotificationCenterProps {
  notifications?: Notification[];
  currentUserId?: string;
  lang: Language;
  onMarkAsRead?: (notificationId: string) => void;
  onMarkAllAsRead?: () => void;
  onOpenPage?: () => void;
}

const normalize = (items: unknown, currentUserId?: string): Notification[] => {
  if (!Array.isArray(items) || !currentUserId) return [];
  const userId = String(currentUserId).trim();
  const seen = new Set<string>();
  return items.filter((item): item is Notification => {
    if (!item || typeof item !== 'object') return false;
    const n = item as Notification;
    const id = String(n.id || '').trim();
    const recipientId = String(n.recipientId || '').trim();
    if (!id || !recipientId || recipientId !== userId || seen.has(id)) return false;
    seen.add(id);
    return true;
  }).sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
};

const titleFor = (n: Notification, lang: Language) => {
  if (n.title?.trim()) return n.title;
  if (lang === 'ar') {
    const labels: Record<string, string> = {
      leave_requested: 'طلب إجازة جديد', leave_approved: 'تم قبول الإجازة', leave_rejected: 'تم رفض الإجازة',
      overtime_requested: 'طلب عمل إضافي جديد', overtime_approved: 'تم اعتماد العمل الإضافي', overtime_rejected: 'تم رفض العمل الإضافي',
      shift_changed: 'تم تغيير الشفت', shift_swap_requested: 'طلب تبديل شفت جديد', shift_swap_accepted: 'تمت الموافقة على تبديل الشفت',
      shift_swap_rejected: 'تم رفض تبديل الشفت', admin_notice: 'إشعار إداري',
    };
    return labels[n.type] || 'إشعار جديد';
  }
  return n.type?.replace(/_/g, ' ') || 'New notification';
};

export const NotificationCenter: React.FC<NotificationCenterProps> = ({ currentUserId, lang, onMarkAsRead, onMarkAllAsRead, onOpenPage }) => {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  const load = async (silent = false) => {
    if (!currentUserId) { setItems([]); return; }
    if (!silent) setLoading(true);
    try {
      const response = await fetch(`/api/notifications?userId=${encodeURIComponent(String(currentUserId).trim())}&_=${Date.now()}`, { cache: 'no-store', headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' } });
      if (!response.ok) throw new Error(String(response.status));
      const data = await response.json();
      setItems(normalize(data?.notifications, currentUserId));
      setError(false);
    } catch {
      setError(true);
      if (!silent) setItems([]);
    } finally { if (!silent) setLoading(false); }
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
    const outside = (event: MouseEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('mousedown', outside); document.removeEventListener('keydown', escape); };
  }, [open]);

  const unreadCount = useMemo(() => items.filter(n => !n.isRead).length, [items]);
  const preview = items.slice(0, 6);

  const openNotificationsPage = () => {
    setOpen(false);
    if (onOpenPage) { onOpenPage(); return; }
    window.dispatchEvent(new CustomEvent('tech-source-open-notifications'));
  };

  const markRead = async (id: string) => {
    if (!currentUserId) return;
    setItems(current => current.map(n => n.id === id ? { ...n, isRead: true, updatedAt: new Date().toISOString() } : n));
    try {
      const response = await fetch(`/api/notifications/${encodeURIComponent(id)}/mark-read`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: currentUserId }) });
      if (!response.ok) throw new Error(String(response.status));
      onMarkAsRead?.(id);
    } catch { void load(true); }
  };

  const markAll = async () => {
    if (!currentUserId || unreadCount === 0) return;
    setItems(current => current.map(n => ({ ...n, isRead: true, updatedAt: new Date().toISOString() })));
    try {
      const response = await fetch('/api/notifications/mark-all-read', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: currentUserId }) });
      if (!response.ok) throw new Error(String(response.status));
      onMarkAllAsRead?.();
    } catch { void load(true); }
  };

  return (
    <div ref={ref} className="relative flex items-center shrink-0 z-[100]" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <button type="button" onClick={(event) => { event.stopPropagation(); setOpen(value => !value); }} aria-label={lang === 'ar' ? 'الإشعارات' : 'Notifications'} aria-expanded={open} aria-haspopup="dialog" className="relative p-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/70 transition-colors cursor-pointer">
        <Bell size={20} />
        {unreadCount > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-red-500 border border-slate-900 text-white text-[10px] font-black flex items-center justify-center leading-none">{unreadCount > 99 ? '99+' : unreadCount}</span>}
      </button>

      {open && (
        <div role="dialog" aria-label={lang === 'ar' ? 'مركز الإشعارات' : 'Notification center'} className="fixed top-[68px] right-3 sm:right-6 w-[min(360px,calc(100vw-24px))] max-h-[calc(100vh-84px)] overflow-hidden rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl z-[2147483647]" onClick={event => event.stopPropagation()}>
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between gap-3">
            <div className="min-w-0"><h3 className="text-sm font-black text-slate-900 dark:text-white">{lang === 'ar' ? 'الإشعارات' : 'Notifications'}</h3><p className="mt-0.5 text-[11px] font-bold text-slate-600 dark:text-slate-300">{unreadCount} {lang === 'ar' ? 'غير مقروء' : 'unread'}</p></div>
            <div className="flex items-center gap-2 shrink-0">
              {unreadCount > 0 && <button type="button" onClick={markAll} className="flex items-center gap-1 text-[11px] font-black text-emerald-700 dark:text-emerald-300 hover:underline cursor-pointer"><CheckCheck size={14}/>{lang === 'ar' ? 'قراءة الكل' : 'Mark all read'}</button>}
              <button type="button" onClick={openNotificationsPage} aria-label={lang === 'ar' ? 'فتح كل الإشعارات' : 'Open notifications'} className="p-1.5 rounded-md text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"><ExternalLink size={15}/></button>
            </div>
          </div>

          <div className="max-h-[calc(100vh-150px)] overflow-y-auto">
            {loading && items.length === 0 ? <div className="px-6 py-10 text-center text-slate-700 dark:text-slate-200 text-sm font-bold">{lang === 'ar' ? 'جاري تحميل الإشعارات...' : 'Loading notifications...'}</div> : preview.length === 0 ? <div className="px-6 py-10 text-center text-slate-700 dark:text-slate-200"><Bell size={28} className="mx-auto mb-2 opacity-50"/><p className="text-sm font-bold">{error ? (lang === 'ar' ? 'تعذر تحميل الإشعارات' : 'Unable to load notifications') : (lang === 'ar' ? 'لا توجد إشعارات حالياً' : 'No notifications currently')}</p><button type="button" onClick={() => void load()} className="mt-3 px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs font-black cursor-pointer">{lang === 'ar' ? 'إعادة المحاولة' : 'Retry'}</button></div> : preview.map(notification => {
              const unread = !notification.isRead;
              return <button key={notification.id} type="button" onClick={() => { void markRead(notification.id); openNotificationsPage(); }} className="w-full text-start px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer">
                <div className="flex items-start gap-2.5"><span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${unread ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`}/><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><p className={`min-w-0 text-xs font-black ${unread ? 'text-slate-900 dark:text-white' : 'text-slate-700 dark:text-slate-200'}`}>{titleFor(notification, lang)}</p>{unread && <span className="shrink-0 text-[10px] font-black text-emerald-700 dark:text-emerald-300">{lang === 'ar' ? 'جديد' : 'New'}</span>}</div><p className="mt-1 text-[11px] leading-5 text-slate-700 dark:text-slate-300 line-clamp-2">{notification.message}</p><p className="mt-1.5 text-[10px] font-bold text-slate-500 dark:text-slate-400">{new Date(notification.createdAt).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-US')}</p></div>{!unread && <Check size={14} className="shrink-0 mt-1 text-slate-500 dark:text-slate-300"/>}</div>
              </button>;
            })}
          </div>
          {items.length > 0 && <button type="button" onClick={openNotificationsPage} className="w-full px-4 py-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-black text-emerald-700 dark:text-emerald-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center gap-1.5 cursor-pointer"><ExternalLink size={14}/>{lang === 'ar' ? 'عرض كل الإشعارات' : 'View all notifications'}</button>}
        </div>
      )}
    </div>
  );
};
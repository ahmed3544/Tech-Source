import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, Check, CheckCheck, ExternalLink } from 'lucide-react';
import { Notification, Language } from '../types';

interface NotificationCenterProps {
  notifications: Notification[];
  currentUserId?: string;
  lang: Language;
  onMarkAsRead?: (notificationId: string) => void;
  onMarkAllAsRead?: () => void;
  onOpenPage?: () => void;
}

const normalizeNotifications = (items: unknown, currentUserId?: string): Notification[] => {
  if (!Array.isArray(items) || !currentUserId) return [];

  const userId = String(currentUserId).trim();
  const seen = new Set<string>();

  return items
    .filter((item): item is Notification => {
      if (!item || typeof item !== 'object') return false;
      const notification = item as Notification;
      const id = String(notification.id || '').trim();
      const recipientId = String(notification.recipientId || '').trim();
      if (!id || !recipientId || recipientId !== userId || seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .slice()
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
};

const getNotificationTitle = (notification: Notification, lang: Language) => {
  if (notification.title?.trim()) return notification.title;
  if (lang === 'ar') {
    const labels: Record<string, string> = {
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
    return labels[notification.type] || 'إشعار جديد';
  }
  return notification.type ? notification.type.replace(/_/g, ' ') : 'New notification';
};

export const NotificationCenter: React.FC<NotificationCenterProps> = ({
  notifications,
  currentUserId,
  lang,
  onMarkAsRead,
  onMarkAllAsRead,
  onOpenPage,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [serverNotifications, setServerNotifications] = useState<Notification[] | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!currentUserId) {
      setServerNotifications([]);
      return () => { cancelled = true; };
    }

    const loadNotifications = async () => {
      try {
        const response = await fetch(`/api/notifications?userId=${encodeURIComponent(String(currentUserId).trim())}&_=${Date.now()}`, {
          method: 'GET',
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
        });
        if (!response.ok) throw new Error(`Notification request failed: ${response.status}`);
        const data = await response.json();
        if (!cancelled) setServerNotifications(normalizeNotifications(data?.notifications, currentUserId));
      } catch {
        if (!cancelled) setServerNotifications(null);
      }
    };

    void loadNotifications();
    const interval = window.setInterval(() => { void loadNotifications(); }, 3000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [currentUserId]);

  useEffect(() => {
    if (!isOpen) return;
    const handleOutsideClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  const userNotifications = useMemo(() => {
    const source = serverNotifications ?? notifications;
    return normalizeNotifications(source, currentUserId);
  }, [serverNotifications, notifications, currentUserId]);

  const unreadCount = userNotifications.filter(notification => !notification.isRead).length;
  const previewNotifications = userNotifications.slice(0, 6);

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.isRead) onMarkAsRead?.(notification.id);
    setIsOpen(false);
    onOpenPage?.();
  };

  const handleMarkAll = () => {
    if (unreadCount > 0) onMarkAllAsRead?.();
  };

  return (
    <div ref={containerRef} className="relative flex items-center gap-1 z-[100] shrink-0">
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setIsOpen(open => !open);
        }}
        className="relative p-2 text-slate-300 hover:text-white transition-colors rounded-lg hover:bg-slate-800/70"
        aria-label={lang === 'ar' ? 'الإشعارات' : 'Notifications'}
        aria-expanded={isOpen}
        aria-haspopup="true"
        title={lang === 'ar' ? 'الإشعارات' : 'Notifications'}
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center min-w-4 h-4 px-1 text-[10px] font-bold leading-none text-white bg-red-500 rounded-full border border-slate-900">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-label={lang === 'ar' ? 'قائمة الإشعارات' : 'Notification list'}
          className="absolute top-full left-0 mt-2 w-80 max-w-[calc(100vw-24px)] overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl z-[9999]"
          onClick={event => event.stopPropagation()}
        >
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-800">
            <div className="min-w-0">
              <h3 className="text-sm font-black text-slate-900 dark:text-white">
                {lang === 'ar' ? 'الإشعارات' : 'Notifications'}
              </h3>
              <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mt-0.5">
                {lang === 'ar' ? `${unreadCount} غير مقروء` : `${unreadCount} unread`}
              </p>
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAll}
                className="shrink-0 text-[11px] font-black text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1"
              >
                <CheckCheck size={14} />
                {lang === 'ar' ? 'قراءة الكل' : 'Mark all read'}
              </button>
            )}
          </div>

          <div className="max-h-[420px] overflow-y-auto">
            {previewNotifications.length === 0 ? (
              <div className="px-6 py-10 text-center text-slate-500 dark:text-slate-400">
                <Bell size={28} className="mx-auto mb-2 opacity-40" />
                <p className="text-sm font-bold">{lang === 'ar' ? 'لا توجد إشعارات حالياً' : 'No notifications currently'}</p>
              </div>
            ) : (
              previewNotifications.map(notification => {
                const unread = !notification.isRead;
                return (
                  <button
                    type="button"
                    key={notification.id}
                    onClick={() => handleNotificationClick(notification)}
                    className="w-full text-start px-4 py-3 border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/70 transition-colors"
                  >
                    <div className="flex items-start gap-2.5">
                      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${unread ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className={`min-w-0 text-xs font-black ${unread ? 'text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-300'}`}>
                            {getNotificationTitle(notification, lang)}
                          </p>
                          {unread && <span className="shrink-0 text-[10px] font-black text-emerald-600 dark:text-emerald-400">{lang === 'ar' ? 'جديد' : 'New'}</span>}
                        </div>
                        <p className="mt-1 text-[11px] leading-5 text-slate-500 dark:text-slate-400 line-clamp-2">
                          {notification.message?.trim() || (lang === 'ar' ? 'لديك إشعار جديد.' : 'You have a new notification.')}
                        </p>
                        {notification.createdAt && (
                          <p className="mt-1.5 text-[10px] font-bold text-slate-400">
                            {new Date(notification.createdAt).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-US')}
                          </p>
                        )}
                      </div>
                      {!unread && <Check size={14} className="shrink-0 mt-1 text-slate-400" />}
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {userNotifications.length > 0 && (
            <button
              type="button"
              onClick={() => { setIsOpen(false); onOpenPage?.(); }}
              className="w-full px-4 py-3 text-xs font-black text-emerald-600 dark:text-emerald-400 hover:bg-slate-50 dark:hover:bg-slate-800 border-t border-slate-200 dark:border-slate-800 flex items-center justify-center gap-1.5"
            >
              <ExternalLink size={14} />
              {lang === 'ar' ? 'عرض كل الإشعارات' : 'View all notifications'}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

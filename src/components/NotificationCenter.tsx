import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, CheckCheck, ExternalLink } from 'lucide-react';
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

  return items
    .filter((x): x is Notification => {
      if (!x || typeof x !== 'object') return false;
      const n = x as Notification;
      const id = String(n.id || '').trim();
      const recipientId = String(n.recipientId || '').trim();
      if (!id || recipientId !== uid || seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .sort(
      (a, b) =>
        new Date(b.createdAt || 0).getTime() -
        new Date(a.createdAt || 0).getTime(),
    );
};

const titleFor = (n: Notification, lang: Language) => {
  const titles: Record<string, string> = {
    leave_requested: lang === 'ar' ? 'طلب إجازة جديد' : 'New Leave Request',
    leave_approved: lang === 'ar' ? 'تم قبول الإجازة' : 'Leave Approved',
    leave_rejected: lang === 'ar' ? 'تم رفض الإجازة' : 'Leave Rejected',
    overtime_requested:
      lang === 'ar' ? 'طلب عمل إضافي جديد' : 'New Overtime Request',
    overtime_approved:
      lang === 'ar' ? 'تم اعتماد العمل الإضافي' : 'Overtime Approved',
    overtime_rejected:
      lang === 'ar' ? 'تم رفض العمل الإضافي' : 'Overtime Rejected',
    shift_changed: lang === 'ar' ? 'تم تغيير الشفت' : 'Shift Changed',
    shift_swap_requested:
      lang === 'ar' ? 'طلب تبديل شفت جديد' : 'New Shift Swap Request',
    shift_swap_accepted:
      lang === 'ar'
        ? 'تمت الموافقة على تبديل الشفت'
        : 'Shift Swap Accepted',
    shift_swap_rejected:
      lang === 'ar' ? 'تم رفض تبديل الشفت' : 'Shift Swap Rejected',
    admin_notice: lang === 'ar' ? 'إشعار إداري' : 'Admin Notice',
  };

  return n.title?.trim() || titles[n.type] || n.type.replace(/_/g, ' ');
};

const dispatchTarget = (n: Notification) => {
  try {
    window.dispatchEvent(
      new CustomEvent('techsource:navigate-notification', { detail: n }),
    );
  } catch {
    // Ignore navigation event errors.
  }
};

export const NotificationCenter: React.FC<NotificationCenterProps> = ({
  currentUserId,
  lang,
  onMarkAsRead,
  onMarkAllAsRead,
  onOpenPage,
  onOpenNotificationsPage,
}) => {
  const [open, setOpen] = useState(false);
  const [showPage, setShowPage] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  const load = async (silent = false) => {
    if (!currentUserId) {
      setItems([]);
      return;
    }

    if (!silent) setLoading(true);

    try {
      const response = await fetch(
        `/api/notifications?userId=${encodeURIComponent(
          String(currentUserId).trim(),
        )}&_=${Date.now()}`,
        {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache' },
        },
      );

      if (!response.ok) throw new Error('notifications request failed');
      const data = await response.json();
      if (!data?.success) throw new Error('notifications response failed');

      setItems(normalize(data.notifications, currentUserId));
      setError(false);
    } catch {
      try {
        const response = await fetch(`/api/data?_=${Date.now()}`, {
          cache: 'no-store',
        });
        const data = await response.json();
        setItems(normalize(data.notifications, currentUserId));
        setError(false);
      } catch {
        setError(true);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(true), 5000);
    const onFocus = () => void load(true);

    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [currentUserId]);

  useEffect(() => {
    if (!open) return;

    const onMouseDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const unreadCount = useMemo(
    () => items.filter((notification) => !notification.isRead).length,
    [items],
  );

  const markRead = async (id: string) => {
    if (!currentUserId) return;

    try {
      const response = await fetch(
        `/api/notifications/${encodeURIComponent(id)}/mark-read`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache',
          },
          body: JSON.stringify({ userId: currentUserId }),
          cache: 'no-store',
        },
      );

      if (!response.ok) throw new Error('mark read failed');
      const data = await response.json();
      if (Array.isArray(data.notifications)) {
        setItems(normalize(data.notifications, currentUserId));
      } else {
        await load(true);
      }
      onMarkAsRead?.(id);
    } catch {
      await load(true);
    }
  };

  const markAll = async () => {
    if (!currentUserId || !unreadCount) return;

    try {
      const response = await fetch('/api/notifications/mark-all-read', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
        },
        body: JSON.stringify({ userId: currentUserId }),
        cache: 'no-store',
      });

      if (!response.ok) throw new Error('mark all read failed');
      const data = await response.json();
      if (Array.isArray(data.notifications)) {
        setItems(normalize(data.notifications, currentUserId));
      } else {
        await load(true);
      }
      onMarkAllAsRead?.();
    } catch {
      await load(true);
    }
  };

  const openNotificationsPage = () => {
    setOpen(false);
    const callback = onOpenPage || onOpenNotificationsPage;
    if (callback) {
      callback();
      return;
    }
    setShowPage(true);
  };

  if (showPage) {
    return (
      <NotificationsPage
        currentUserId={currentUserId}
        lang={lang}
        onMarkAsRead={onMarkAsRead}
        onMarkAllAsRead={onMarkAllAsRead}
        onBack={() => {
          setShowPage(false);
          void load(true);
        }}
      />
    );
  }

  return (
    <div
      ref={ref}
      className="relative flex items-center shrink-0 z-[100]"
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
    >
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
        className="relative p-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/70"
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          className="fixed top-[68px] right-3 sm:right-6 w-[min(360px,calc(100vw-24px))] max-h-[calc(100vh-84px)] overflow-hidden rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl z-[2147483647]"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-white">
                {lang === 'ar' ? 'الإشعارات' : 'Notifications'}
              </h3>
              <p className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
                {unreadCount} {lang === 'ar' ? 'غير مقروء' : 'unread'}
              </p>
            </div>
            {unreadCount > 0 && (
              <button
                onClick={() => void markAll()}
                className="flex items-center gap-1 text-[11px] font-black text-emerald-700"
              >
                <CheckCheck size={14} />
                {lang === 'ar' ? 'قراءة الكل' : 'Mark all read'}
              </button>
            )}
          </div>

          <div className="max-h-[calc(100vh-150px)] overflow-y-auto">
            {loading && items.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                {lang === 'ar' ? 'جاري تحميل الإشعارات...' : 'Loading...'}
              </div>
            ) : (
              items.slice(0, 6).map((notification) => (
                <button
                  key={notification.id}
                  onClick={async () => {
                    setOpen(false);
                    await markRead(notification.id);
                    dispatchTarget(notification);
                  }}
                  className="w-full text-start px-4 py-3 border-b border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/70"
                >
                  <div className="flex gap-2">
                    <span
                      className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${
                        !notification.isRead ? 'bg-emerald-500' : 'bg-slate-300'
                      }`}
                    />
                    <div>
                      <p className="text-xs font-black text-slate-900 dark:text-white">
                        {titleFor(notification, lang)}
                      </p>
                      <p className="text-[11px] leading-5 text-slate-700 dark:text-slate-300 line-clamp-2">
                        {notification.message}
                      </p>
                    </div>
                  </div>
                </button>
              ))
            )}

            {!loading && items.length === 0 && (
              <div className="p-8 text-center text-sm text-slate-500">
                {error
                  ? lang === 'ar'
                    ? 'تعذر تحميل الإشعارات'
                    : 'Unable to load notifications'
                  : lang === 'ar'
                    ? 'لا توجد إشعارات حالياً'
                    : 'No notifications'}
              </div>
            )}
          </div>

          <button
            onClick={openNotificationsPage}
            className="w-full px-4 py-3 border-t text-xs font-black text-emerald-700"
          >
            {lang === 'ar' ? 'عرض كل الإشعارات' : 'View all notifications'}{' '}
            <ExternalLink size={14} className="inline" />
          </button>
        </div>
      )}
    </div>
  );
};

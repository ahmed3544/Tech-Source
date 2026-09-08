import React, { useEffect, useMemo, useState } from 'react';
import { Bell } from 'lucide-react';
import { Notification, Language } from '../types';

interface NotificationCenterProps {
  notifications: Notification[];
  currentUserId?: string;
  lang: Language;
  onMarkAsRead?: (notificationId: string) => void;
  onMarkAllAsRead?: () => void;
  onOpenPage?: () => void;
}

const isDisplayableNotification = (notification: Notification | null | undefined): notification is Notification => {
  return Boolean(
    notification?.id &&
    notification?.recipientId &&
    (String(notification.title || '').trim() || String(notification.message || '').trim())
  );
};

const normalizeNotifications = (items: unknown, currentUserId?: string): Notification[] => {
  if (!Array.isArray(items) || !currentUserId) return [];

  const userId = String(currentUserId).trim();
  const seen = new Set<string>();
  return items.filter((item): item is Notification => {
    if (!isDisplayableNotification(item)) return false;
    const id = String(item.id).trim();
    const recipientId = String(item.recipientId).trim();
    if (!id || !recipientId || recipientId !== userId || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
};

export const NotificationCenter: React.FC<NotificationCenterProps> = ({
  notifications,
  currentUserId,
  lang,
  onOpenPage,
}) => {
  const [serverNotifications, setServerNotifications] = useState<Notification[] | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!currentUserId) {
      setServerNotifications([]);
      return () => { cancelled = true; };
    }

    const loadNotifications = async () => {
      try {
        const response = await fetch(`/api/notifications?userId=${encodeURIComponent(String(currentUserId).trim())}&_=${Date.now()}`, {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
        });
        if (!response.ok) throw new Error(`Notification request failed: ${response.status}`);
        const data = await response.json();
        if (!cancelled) {
          setServerNotifications(normalizeNotifications(data?.notifications, currentUserId));
        }
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

  const userNotifications = useMemo(() => {
    const source = serverNotifications ?? notifications;
    return normalizeNotifications(source, currentUserId);
  }, [serverNotifications, notifications, currentUserId]);

  const unreadCount = userNotifications.filter(n => !n.isRead).length;

  return (
    <div className="relative flex items-center gap-1">
      <button
        onClick={onOpenPage}
        className="relative p-2 text-slate-300 hover:text-white transition-colors"
        aria-label={lang === 'ar' ? 'الإشعارات' : 'Notifications'}
        title={lang === 'ar' ? 'فتح صفحة الإشعارات' : 'Open notifications'}
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 inline-flex items-center justify-center min-w-4 h-4 px-1 text-[10px] font-bold leading-none text-white bg-red-500 rounded-full">
            {unreadCount}
          </span>
        )}
      </button>
    </div>
  );
};

import React from 'react';
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

export const NotificationCenter: React.FC<NotificationCenterProps> = ({
  notifications,
  currentUserId,
  lang,
  onOpenPage,
}) => {
  const userNotifications = currentUserId
    ? notifications.filter(n => n.recipientId === currentUserId && n?.id && (String(n.title || '').trim() || String(n.message || '').trim()))
    : [];
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
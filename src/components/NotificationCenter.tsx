import React, { useState } from 'react';
import { Bell, X, Check, CheckCheck } from 'lucide-react';
import { Notification, Language } from '../types';

interface NotificationCenterProps {
  notifications: Notification[];
  currentUserId?: string;
  lang: Language;
  onMarkAsRead?: (notificationId: string) => void;
  onMarkAllAsRead?: () => void;
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({
  notifications,
  currentUserId,
  lang,
  onMarkAsRead,
  onMarkAllAsRead,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  // Filter notifications for current user
  const userNotifications = currentUserId
    ? notifications.filter(n => n.recipientId === currentUserId)
    : [];

  const unreadCount = userNotifications.filter(n => !n.isRead).length;

  const getNotificationTitle = (notification: Notification) => {
    if (lang === 'ar') {
      const titles: Record<string, string> = {
        'leave_requested': 'طلب إجازة جديد',
        'leave_approved': 'تم قبول الإجازة',
        'leave_rejected': 'تم رفض الإجازة',
        'overtime_requested': 'طلب overtime جديد',
        'overtime_approved': 'تم قبول Overtime',
        'overtime_rejected': 'تم رفض Overtime',
        'shift_changed': 'تم تغيير الشفت',
        'admin_notice': 'إشعار إداري',
      };
      return titles[notification.type] || notification.title;
    }
    return notification.title;
  };

  return (
    <div className="relative">
      {/* Bell Icon */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-gray-600 hover:text-gray-900 transition-colors"
        aria-label="Notifications"
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white transform translate-x-1/2 -translate-y-1/2 bg-red-500 rounded-full">
            {unreadCount}
          </span>
        )}
      </button>

      {/* Notification Dropdown */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-xl z-50 max-h-96 overflow-y-auto">
          <div className="p-4 border-b border-gray-200 flex justify-between items-center">
            <h3 className="font-semibold text-gray-900">
              {lang === 'ar' ? 'الإشعارات' : 'Notifications'}
            </h3>
            {unreadCount > 0 && (
              <button
                onClick={() => {
                  onMarkAllAsRead?.();
                  setIsOpen(false);
                }}
                className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
              >
                <CheckCheck size={14} />
                {lang === 'ar' ? 'اقرأ الكل' : 'Mark all read'}
              </button>
            )}
          </div>

          {userNotifications.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              {lang === 'ar' ? 'لا توجد إشعارات' : 'No notifications'}
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {userNotifications
                .sort(
                  (a, b) =>
                    new Date(b.createdAt).getTime() -
                    new Date(a.createdAt).getTime()
                )
                .map(notification => (
                  <div
                    key={notification.id}
                    className={`p-4 hover:bg-gray-50 transition-colors cursor-pointer ${
                      !notification.isRead ? 'bg-blue-50' : ''
                    }`}
                    onClick={() => {
                      if (!notification.isRead) {
                        onMarkAsRead?.(notification.id);
                      }
                    }}
                  >
                    <div className="flex justify-between items-start gap-3">
                      <div className="flex-1">
                        <p className="font-medium text-gray-900">
                          {getNotificationTitle(notification)}
                        </p>
                        <p className="text-sm text-gray-600 mt-1">
                          {notification.message}
                        </p>
                        <p className="text-xs text-gray-400 mt-2">
                          {new Date(
                            notification.createdAt
                          ).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-US')}
                        </p>
                      </div>
                      {!notification.isRead && (
                        <div className="w-2 h-2 bg-blue-600 rounded-full mt-1 flex-shrink-0" />
                      )}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

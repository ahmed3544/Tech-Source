import React, { useState } from 'react';
import { Bell, CheckCheck, Check, X } from 'lucide-react';
import { Notification, Language, ShiftSwapRequest, Employee } from '../types';

interface NotificationCenterProps {
  notifications: Notification[];
  currentUserId?: string;
  lang: Language;
  onMarkAsRead?: (notificationId: string) => void;
  onMarkAllAsRead?: () => void;
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({ notifications, currentUserId, lang, onMarkAsRead, onMarkAllAsRead }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [actingSwapId, setActingSwapId] = useState<string | null>(null);
  const userNotifications = currentUserId ? notifications.filter(n => n.recipientId === currentUserId) : [];
  const unreadCount = userNotifications.filter(n => !n.isRead).length;

  const getNotificationTitle = (notification: Notification) => {
    if (lang === 'ar') {
      const titles: Record<string, string> = {
        leave_requested: 'طلب إجازة جديد', leave_approved: 'تم قبول الإجازة', leave_rejected: 'تم رفض الإجازة',
        overtime_requested: 'طلب عمل إضافي جديد', overtime_approved: 'تم اعتماد العمل الإضافي', overtime_rejected: 'تم رفض Overtime',
        shift_changed: 'تم تغيير الشفت',
        shift_swap_requested: 'طلب تبديل شفت جديد', shift_swap_accepted: 'تمت الموافقة على Swap', shift_swap_rejected: 'تم رفض تبديل الشفت',
        admin_notice: 'إشعار إداري',
      };
      return titles[notification.type] || notification.title;
    }
    const titles: Record<string, string> = {
      shift_swap_requested: 'New Shift Swap Request', shift_swap_accepted: 'Shift Swap Accepted', shift_swap_rejected: 'Shift Swap Rejected',
    };
    return titles[notification.type] || notification.title;
  };

  const respondToSwap = async (notification: Notification, action: 'accept' | 'reject') => {
    if (!currentUserId || notification.type !== 'shift_swap_requested' || !notification.relatedShiftSwapId) return;
    setActingSwapId(notification.relatedShiftSwapId);
    try {
      const response = await fetch('/api/data');
      if (!response.ok) return;
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
      await fetch('/api/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ shiftSwapRequests: nextRequests, notifications: nextNotifications }) });
      onMarkAsRead?.(notification.id);
    } finally {
      setActingSwapId(null);
    }
  };

  return (
    <div className="relative flex items-center gap-1">
      <button onClick={() => setIsOpen(!isOpen)} className="relative p-2 text-slate-300 hover:text-white transition-colors" aria-label={lang === 'ar' ? 'الإشعارات' : 'Notifications'}>
        <Bell size={20} />
        {unreadCount > 0 && <span className="absolute top-0 right-0 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white transform translate-x-1/2 -translate-y-1/2 bg-red-500 rounded-full">{unreadCount}</span>}
      </button>
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-lg shadow-xl z-50 max-h-96 overflow-y-auto">
          <div className="p-4 border-b border-gray-200 flex justify-between items-center">
            <h3 className="font-semibold text-gray-900">{lang === 'ar' ? 'الإشعارات' : 'Notifications'}</h3>
            {unreadCount > 0 && <button onClick={() => { onMarkAllAsRead?.(); setIsOpen(false); }} className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"><CheckCheck size={14} />{lang === 'ar' ? 'اقرأ الكل' : 'Mark all read'}</button>}
          </div>
          {userNotifications.length === 0 ? <div className="p-8 text-center text-gray-500">{lang === 'ar' ? 'لا توجد إشعارات' : 'No notifications'}</div> : (
            <div className="divide-y divide-gray-200">
              {userNotifications.slice().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map(notification => (
                <div key={notification.id} className={`p-4 hover:bg-gray-50 transition-colors ${!notification.isRead ? 'bg-blue-50' : ''}`}>
                  <div className="flex justify-between items-start gap-3">
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{getNotificationTitle(notification)}</p>
                      <p className="text-sm text-gray-600 mt-1">{notification.message}</p>
                      <p className="text-xs text-gray-400 mt-2">{new Date(notification.createdAt).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-US')}</p>
                      {notification.type === 'shift_swap_requested' && notification.relatedShiftSwapId && (
                        <div className="flex gap-2 mt-3">
                          <button type="button" disabled={actingSwapId === notification.relatedShiftSwapId} onClick={() => void respondToSwap(notification, 'accept')} className="flex-1 rounded-lg bg-emerald-600 text-white px-3 py-2 text-xs font-black flex items-center justify-center gap-1 disabled:opacity-50"><Check size={14} />{lang === 'ar' ? 'موافقة' : 'Accept'}</button>
                          <button type="button" disabled={actingSwapId === notification.relatedShiftSwapId} onClick={() => void respondToSwap(notification, 'reject')} className="flex-1 rounded-lg bg-rose-600 text-white px-3 py-2 text-xs font-black flex items-center justify-center gap-1 disabled:opacity-50"><X size={14} />{lang === 'ar' ? 'رفض' : 'Reject'}</button>
                        </div>
                      )}
                    </div>
                    {!notification.isRead && notification.type !== 'shift_swap_requested' && <button type="button" className="w-2 h-2 bg-blue-600 rounded-full mt-1 flex-shrink-0" onClick={() => onMarkAsRead?.(notification.id)} aria-label={lang === 'ar' ? 'تحديد كمقروء' : 'Mark as read'} />}
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

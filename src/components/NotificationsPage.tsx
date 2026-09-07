import React, { useMemo } from 'react';
import { Bell, CheckCheck, Check, ArrowRight, ArrowLeft } from 'lucide-react';
import { Notification, Language } from '../types';

interface Props {
  notifications: Notification[];
  currentUserId?: string;
  lang: Language;
  onMarkAsRead?: (id: string) => void;
  onMarkAllAsRead?: () => void;
  onBack?: () => void;
}

export const NotificationsPage: React.FC<Props> = ({ notifications, currentUserId, lang, onMarkAsRead, onMarkAllAsRead, onBack }) => {
  const list = useMemo(() => currentUserId ? notifications.filter(n => n.recipientId === currentUserId).slice().sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) : [], [notifications, currentUserId]);
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
  return <section dir={lang === 'ar' ? 'rtl' : 'ltr'} className="min-h-[calc(100vh-72px)] w-full bg-slate-50 dark:bg-slate-950 px-3 sm:px-6 py-4 sm:py-6">
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="h-9 w-9 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800">{lang === 'ar' ? <ArrowRight size={17}/> : <ArrowLeft size={17}/>}</button>
          <div><h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">{lang === 'ar' ? 'الإشعارات' : 'Notifications'}</h1><p className="text-xs text-slate-500 dark:text-slate-400 font-bold mt-0.5">{lang === 'ar' ? `${list.length} إشعار • ${unread} غير مقروء` : `${list.length} notifications • ${unread} unread`}</p></div>
        </div>
        {unread > 0 && <button onClick={onMarkAllAsRead} className="h-9 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black flex items-center gap-1.5"><CheckCheck size={15}/>{lang === 'ar' ? 'قراءة الكل' : 'Mark all read'}</button>}
      </div>
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
        {list.length === 0 ? <div className="py-20 text-center text-slate-500 dark:text-slate-400"><Bell className="mx-auto mb-3 opacity-40" size={34}/><p className="font-bold">{lang === 'ar' ? 'لا توجد إشعارات' : 'No notifications'}</p></div> : <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {list.map(n => <article key={n.id} className={`p-4 sm:p-5 transition ${!n.isRead ? 'bg-emerald-50/60 dark:bg-emerald-950/20' : ''}`}>
            <div className="flex gap-3">
              <div className={`mt-0.5 h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${!n.isRead ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-300' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}><Bell size={17}/></div>
              <div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-3"><div><h2 className="text-sm font-black text-slate-900 dark:text-white">{title(n)}</h2><p className="text-sm text-slate-600 dark:text-slate-300 mt-1 leading-6">{n.message}</p><time className="block text-[11px] text-slate-400 mt-2 font-semibold">{new Date(n.createdAt).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-US')}</time></div>{!n.isRead && <button onClick={() => onMarkAsRead?.(n.id)} className="shrink-0 text-[11px] font-black text-emerald-600 dark:text-emerald-400 flex items-center gap-1"><Check size={13}/>{lang === 'ar' ? 'مقروء' : 'Read'}</button>}</div></div>
            </div>
          </article>)}
        </div>}
      </div>
    </div>
  </section>;
};

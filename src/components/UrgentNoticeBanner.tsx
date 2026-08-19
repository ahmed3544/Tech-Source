import React, { useState } from 'react';
import { Megaphone, AlertTriangle, CheckCircle, Edit3, X, Sparkles } from 'lucide-react';
import { UrgentNotice, Language } from '../types';
import { formatDate } from '../utils/helpers';

interface UrgentNoticeBannerProps {
  notice: UrgentNotice | null;
  onEditNotice?: () => void;
  lang: Language;
  isLeader?: boolean;
}

export const UrgentNoticeBanner: React.FC<UrgentNoticeBannerProps> = ({
  notice,
  onEditNotice,
  lang,
  isLeader = false,
}) => {
  const dismissKey = notice?.id ? `dismissed_notice_${notice.id}_${notice.updatedAt || ''}` : '';

  const [dismissed, setDismissed] = React.useState<boolean>(() => {
    if (!dismissKey) return false;
    return localStorage.getItem(dismissKey) === 'true';
  });

  React.useEffect(() => {
    if (dismissKey) {
      setDismissed(localStorage.getItem(dismissKey) === 'true');
    } else {
      setDismissed(false);
    }
  }, [dismissKey]);

  const handleDismiss = () => {
    setDismissed(true);
    if (dismissKey) {
      localStorage.setItem(dismissKey, 'true');
    }
  };

  if (!notice || !notice.active || !notice.message?.trim() || dismissed) {
    return null;
  }

  const formattedDate = notice.updatedAt
    ? formatDate(notice.updatedAt, lang)
    : '';

  return (
    <div className="relative z-20 max-w-7xl mx-auto px-4 sm:px-6 pt-3 pb-1 animate-in slide-in-from-top duration-300">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-rose-950 via-slate-900 to-amber-950 border-2 border-rose-500/80 shadow-2xl shadow-rose-950/50 p-4 sm:p-5">
        
        {/* Decorative background glow */}
        <div className="absolute -right-12 -top-12 w-36 h-36 bg-rose-500/20 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute -left-12 -bottom-12 w-36 h-36 bg-amber-500/20 rounded-full blur-2xl pointer-events-none" />

        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          
          {/* Icon & Message Container */}
          <div className="flex items-start gap-3.5 flex-1">
            <div className="p-3 rounded-2xl bg-rose-600/30 border border-rose-500/60 text-rose-300 shadow-inner flex-shrink-0 animate-bounce">
              <Megaphone className="w-6 h-6 text-rose-400" />
            </div>

            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-rose-600 text-white font-black text-xs uppercase tracking-wider shadow-md animate-pulse">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {lang === 'ar' ? 'أمر عاجل وتنبيه هام' : 'URGENT ANNOUNCEMENT'}
                </span>

                {notice.authorName && (
                  <span className="text-[11px] font-semibold text-rose-200/80 bg-rose-950/60 border border-rose-800/60 px-2.5 py-0.5 rounded-lg">
                    {notice.authorName.replace(/undefined/g, lang === 'ar' ? 'فريق القيادة' : 'Team Leader')}
                  </span>
                )}

                {formattedDate && (
                  <span className="text-[10px] text-slate-400">
                    {formattedDate}
                  </span>
                )}
              </div>

              <h4 className="text-sm font-bold text-white tracking-wide pt-0.5">
                {notice.title || (lang === 'ar' ? 'تنبيه ضروري لجميع الموظفين' : 'Urgent Notice')}
              </h4>

              <p className="text-xs sm:text-sm text-slate-100 font-medium leading-relaxed whitespace-pre-line bg-slate-950/40 p-3 rounded-xl border border-rose-500/30 mt-1">
                {notice.message}
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 self-end sm:self-center flex-shrink-0 pt-2 sm:pt-0">
            {isLeader && onEditNotice && (
              <button
                onClick={onEditNotice}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-bold transition shadow-sm"
                title={lang === 'ar' ? 'تعديل أو إلغاء التنبيه العاجل' : 'Edit Notice'}
              >
                <Edit3 className="w-3.5 h-3.5 text-amber-400" />
                <span>{lang === 'ar' ? 'تعديل التنويه' : 'Edit Notice'}</span>
              </button>
            )}

            <button
              onClick={handleDismiss}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold transition shadow-sm"
              title={lang === 'ar' ? 'تأكيد العلم بالطرح' : 'Acknowledge'}
            >
              <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
              <span>{lang === 'ar' ? 'علم وتم الفهم' : 'Got it'}</span>
            </button>
          </div>

        </div>
      </div>
    </div>
  );
};

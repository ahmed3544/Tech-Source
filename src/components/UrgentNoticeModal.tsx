import React, { useState, useEffect } from 'react';
import { Megaphone, AlertTriangle, CheckCircle2, Trash2, X, Send } from 'lucide-react';
import { UrgentNotice, Language } from '../types';

interface UrgentNoticeModalProps {
  isOpen: boolean;
  onClose: () => void;
  notice: UrgentNotice | null;
  onSaveNotice: (notice: UrgentNotice | null) => void;
  lang: Language;
  authorName?: string;
}

export const UrgentNoticeModal: React.FC<UrgentNoticeModalProps> = ({
  isOpen,
  onClose,
  notice,
  onSaveNotice,
  lang,
  authorName = 'الإدارة / Team Leader',
}) => {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [active, setActive] = useState(true);

  // Initialize form state ONLY when modal transitions from closed to open
  useEffect(() => {
    if (isOpen) {
      if (notice) {
        setTitle(notice.title || 'أمر عاجل وتنبيه هام');
        setMessage(notice.message || '');
        setActive(notice.active !== false);
      } else {
        setTitle('أمر عاجل وتنبيه هام لجميع الموظفين');
        setMessage('');
        setActive(true);
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) {
      alert(lang === 'ar' ? 'برجاء كتابة نص التنويه العاجل' : 'Please enter the notice message');
      return;
    }

    const updatedNotice: UrgentNotice = {
      id: notice?.id || `notice-${Date.now()}`,
      title: title.trim() || 'أمر عاجل وتنبيه هام',
      message: message.trim(),
      updatedAt: new Date().toISOString(),
      active: active,
      authorName: (authorName || '').replace(/undefined/g, lang === 'ar' ? 'فريق القيادة' : 'Team Leader'),
    };

    onSaveNotice(updatedNotice);
    onClose();
  };

  const handleDelete = () => {
    if (window.confirm(lang === 'ar' ? 'هل أنت تأكد من حذف وإيقاف التنويه العاجل؟' : 'Are you sure you want to delete this notice?')) {
      onSaveNotice(null);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-rose-500/40 rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="bg-gradient-to-r from-rose-950 via-slate-900 to-amber-950 p-5 border-b border-rose-500/30 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-400 animate-pulse">
              <Megaphone className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>{lang === 'ar' ? 'إعلان أمر عاجل وتنبيه هام' : 'Post Urgent Announcement'}</span>
                <span className="bg-rose-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
                  {lang === 'ar' ? 'ضروري' : 'Urgent'}
                </span>
              </h3>
              <p className="text-xs text-rose-300/80 mt-0.5">
                {lang === 'ar' 
                  ? 'سيظهر هذا التنبيه بصورة فورية وبارزة لجميع الموظفين على الصفحة الرئيسية' 
                  : 'This notice will immediately appear to all employees on their portals.'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5">
              {lang === 'ar' ? 'عنوان التنبيه' : 'Notice Title'}
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={lang === 'ar' ? 'مثال: تنبيه عاجل بشأن مواعيد الحضور أو تعليمات جديدة' : 'Notice title...'}
              className="w-full bg-slate-800 text-white text-sm rounded-xl px-3.5 py-2.5 border border-slate-700 focus:outline-none focus:border-rose-500 font-sans"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5">
              {lang === 'ar' ? 'نص الأمر العاجل / التنويه التفصيلي' : 'Notice Content'}
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              placeholder={lang === 'ar' ? 'اكتب التعليمات والأوامر العاجلة المطلوبة من جميع الموظفين...' : 'Enter the complete message...'}
              className="w-full bg-slate-800 text-white text-sm rounded-xl p-3.5 border border-slate-700 focus:outline-none focus:border-rose-500 font-sans leading-relaxed"
              required
            />
          </div>

          {/* Preset Samples */}
          <div>
            <label className="block text-[11px] font-bold text-slate-400 mb-1.5">
              {lang === 'ar' ? 'قوالب سريعة جاهزة:' : 'Quick templates:'}
            </label>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setTitle('تنبيه هام جداً بخصوص الالتزام بمواعيد العمل');
                  setMessage('برجاء من جميع الموظفين الالتزام التام بالبصمة في تمام الساعة 09:00 صباحاً وعدم التأخير لتجنب تطبيق الجزاءات الآلية وفق لائحة العمل.');
                }}
                className="text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 px-2.5 py-1 rounded-lg transition"
              >
                الالتزام بالمواعيد
              </button>
              <button
                type="button"
                onClick={() => {
                  setTitle('أمر عاجل بخصوص تسليم التخارير الأسبوعية');
                  setMessage('يرجى من جميع موظفي الأقسام إنهاء وتسليم التقارير المطلوبة قبل نهاية الدوام اليوم بدون تأخير.');
                }}
                className="text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 px-2.5 py-1 rounded-lg transition"
              >
                تسليم التقارير
              </button>
              <button
                type="button"
                onClick={() => {
                  setTitle('اجتماع طارئ لجميع فريق العمل');
                  setMessage('يرجى حضور جميع الموظفين اجتماع عاجل اليوم في تمام الساعة 02:00 مساءً لمناقشة خطة العمل.');
                }}
                className="text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 px-2.5 py-1 rounded-lg transition"
              >
                اجتماع طارئ
              </button>
            </div>
          </div>

          {/* Status Toggle */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-800/60 border border-slate-700/60">
            <div className="flex items-center gap-2">
              <AlertTriangle className={`w-4 h-4 ${active ? 'text-rose-400 animate-pulse' : 'text-slate-500'}`} />
              <span className="text-xs font-bold text-slate-200">
                {lang === 'ar' ? 'حالة التنويه (مفعل يظهر للجميع)' : 'Active Notice'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setActive(!active)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                active ? 'bg-rose-600' : 'bg-slate-700'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  active ? (lang === 'ar' ? '-translate-x-6' : 'translate-x-6') : (lang === 'ar' ? '-translate-x-1' : 'translate-x-1')
                }`}
              />
            </button>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-800">
            {notice ? (
              <button
                type="button"
                onClick={handleDelete}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-bold transition"
              >
                <Trash2 className="w-4 h-4" />
                <span>{lang === 'ar' ? 'إلغاء التنويه' : 'Delete Notice'}</span>
              </button>
            ) : <div />}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition"
              >
                {lang === 'ar' ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="submit"
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition shadow-lg shadow-rose-600/30"
              >
                <Send className="w-4 h-4" />
                <span>{lang === 'ar' ? 'نشر التنويه العاجل فوراً' : 'Publish Urgent Notice'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

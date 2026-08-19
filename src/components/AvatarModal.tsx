import React, { useState, useRef } from 'react';
import { Camera, Upload, Trash2, X, CheckCircle2, User } from 'lucide-react';
import { Employee, Language } from '../types';
import { UserAvatar } from './UserAvatar';

interface AvatarModalProps {
  isOpen: boolean;
  onClose: () => void;
  employee: Employee;
  onSaveAvatar: (newAvatarUrl: string) => void;
  lang: Language;
}

export const PRESET_AVATARS = [
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=250&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=250&q=80',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=250&q=80',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=250&q=80',
  'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=250&q=80',
  'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=250&q=80',
  'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=250&q=80',
  'https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=250&q=80',
];

export const AvatarModal: React.FC<AvatarModalProps> = ({
  isOpen,
  onClose,
  employee,
  onSaveAvatar,
  lang,
}) => {
  const [customUrl, setCustomUrl] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen || !employee) return null;

  const isLeader = employee.role === 'leader';

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_SIZE = 250;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_SIZE) {
            height = Math.round((height * MAX_SIZE) / width);
            width = MAX_SIZE;
          }
        } else {
          if (height > MAX_SIZE) {
            width = Math.round((width * MAX_SIZE) / height);
            height = MAX_SIZE;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          onSaveAvatar(dataUrl);
          onClose();
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl border border-slate-200 space-y-5 animate-in fade-in zoom-in-95">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-emerald-50 rounded-xl border border-emerald-100">
              <Camera className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-900 text-base">
                {lang === 'ar' ? 'تغيير صورة البروفايل' : 'Change Profile Photo'}
              </h3>
              <p className="text-[11px] text-slate-500 font-medium">
                {isLeader
                  ? (lang === 'ar' ? 'الصورة الشخصية للتيم ليدر (TL)' : 'Team Leader Profile Photo')
                  : (lang === 'ar' ? 'تحديث الصورة الشخصية للموظف' : 'Update Employee Photo')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Current Avatar Preview */}
        <div className="flex flex-col items-center justify-center p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2">
          <div className="relative group">
            <UserAvatar name={employee.nameEn || employee.nameAr} code={employee.code} avatar={employee.avatar} size="xl" />
            {isLeader && (
              <span className="absolute -top-1 -right-1 bg-amber-500 text-slate-950 text-[10px] font-black px-1.5 py-0.5 rounded-full border border-amber-300 shadow-xs">
                TL
              </span>
            )}
          </div>
          <div className="text-center">
            <span className="text-xs font-black text-slate-800 block">
              {lang === 'ar' ? employee.nameAr : employee.nameEn}
            </span>
            <span className="text-[10px] text-slate-400 font-mono">
              #{employee.code} • {isLeader ? 'تيم ليدر' : employee.jobTitleAr}
            </span>
          </div>
        </div>

        {/* Option 1: File Upload */}
        <div className="space-y-2">
          <label className="block text-xs font-bold text-slate-800">
            {lang === 'ar' ? '1. رفع صورة من جهازك أو موبايلك:' : '1. Upload photo from device:'}
          </label>
          <input
            type="file"
            ref={fileInputRef}
            accept="image/*"
            onChange={handleFileUpload}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full py-3 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-md transition flex items-center justify-center gap-2"
          >
            <Upload className="w-4 h-4 text-emerald-400" />
            <span>{lang === 'ar' ? 'اختيار ملف صورة...' : 'Choose image file...'}</span>
          </button>
        </div>

        {/* Option 2: Presets */}
        <div className="space-y-2 pt-2 border-t border-slate-100">
          <label className="block text-xs font-bold text-slate-800">
            {lang === 'ar' ? '2. أو اختر من الصور الجاهزة:' : '2. Or select a preset avatar:'}
          </label>
          <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
            {PRESET_AVATARS.map((url, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  onSaveAvatar(url);
                  onClose();
                }}
                className="w-10 h-10 rounded-full overflow-hidden border-2 border-slate-200 hover:border-emerald-500 transition hover:scale-105 focus:outline-none shrink-0"
              >
                <img src={url} alt={`Avatar ${idx}`} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              </button>
            ))}
          </div>
        </div>

        {/* Option 3: Direct URL */}
        <div className="space-y-2 pt-2 border-t border-slate-100">
          <label className="block text-xs font-bold text-slate-800">
            {lang === 'ar' ? '3. أو ادخل رابط صورة (URL):' : '3. Or enter direct image URL:'}
          </label>
          <div className="flex gap-2">
            <input
              type="url"
              placeholder="https://example.com/photo.jpg"
              value={customUrl}
              onChange={(e) => setCustomUrl(e.target.value)}
              className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono text-slate-900"
            />
            <button
              type="button"
              disabled={!customUrl.trim()}
              onClick={() => {
                if (customUrl.trim()) {
                  onSaveAvatar(customUrl.trim());
                  onClose();
                }
              }}
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-bold text-xs transition shrink-0"
            >
              {lang === 'ar' ? 'تطبيق' : 'Apply'}
            </button>
          </div>
        </div>

        {/* Option 4: Reset / Delete photo */}
        {employee.avatar && (
          <div className="pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => {
                onSaveAvatar('');
                onClose();
              }}
              className="w-full py-2 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs transition border border-rose-200 flex items-center justify-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{lang === 'ar' ? 'حذف الصورة الحالية واسترجاع الأيقونة' : 'Remove current photo'}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

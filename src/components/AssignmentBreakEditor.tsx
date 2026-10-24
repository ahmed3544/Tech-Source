import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Language, ShiftBreak } from '../types';

interface AssignmentBreakEditorProps {
  breaks: ShiftBreak[];
  shiftStart: string;
  shiftEnd: string;
  legacyBreaks?: ShiftBreak[];
  lang: Language;
  onChange: (breaks: ShiftBreak[]) => void;
  onCopyLegacy?: () => void;
}

const BREAK_TYPES: Array<{ value: string; ar: string; en: string }> = [
  { value: 'lunch', ar: 'غداء', en: 'Lunch' },
  { value: 'prayer', ar: 'صلاة', en: 'Prayer' },
  { value: 'rest', ar: 'راحة', en: 'Rest' },
  { value: 'other', ar: 'أخرى', en: 'Other' },
];

const timeToMinutes = (value: string) => {
  const [hours, minutes] = String(value || '').split(':').map(Number);
  return (hours || 0) * 60 + (minutes || 0);
};

const minutesToTime = (value: number) => {
  const minutes = ((Math.round(value) % 1440) + 1440) % 1440;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
};

const defaultBreakWindow = (startTime: string, endTime: string) => {
  const start = timeToMinutes(startTime);
  let end = timeToMinutes(endTime);
  if (end <= start) end += 1440;
  const duration = Math.max(1, Math.min(30, end - start));
  const breakStart = Math.max(start, start + Math.floor((end - start - duration) / 2));
  return [minutesToTime(breakStart), minutesToTime(breakStart + duration)] as const;
};

const durationMinutes = (start: string, end: string) => {
  const difference = timeToMinutes(end) - timeToMinutes(start);
  return difference > 0 ? difference : difference + 1440;
};

export const AssignmentBreakEditor: React.FC<AssignmentBreakEditorProps> = ({
  breaks,
  shiftStart,
  shiftEnd,
  legacyBreaks = [],
  lang,
  onChange,
  onCopyLegacy,
}) => {
  const updateBreak = (index: number, patch: Partial<ShiftBreak>) => {
    const next = breaks.map((item, itemIndex) => {
      if (itemIndex !== index) return item;
      const updated = { ...item, ...patch };
      if (patch.startTime || patch.endTime) {
        updated.durationMinutes = durationMinutes(updated.startTime, updated.endTime);
      }
      return updated;
    });
    onChange(next);
  };

  const addBreak = () => {
    const [startTime, endTime] = defaultBreakWindow(shiftStart, shiftEnd);
    onChange([...breaks, {
      id: `agent_break_${Date.now()}_${breaks.length}`,
      nameAr: 'غداء',
      nameEn: 'Lunch',
      startTime,
      endTime,
      durationMinutes: durationMinutes(startTime, endTime),
    }]);
  };

  const typeFor = (item: ShiftBreak) =>
    BREAK_TYPES.find(type => type.ar === item.nameAr || type.en === item.nameEn)?.value || 'other';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-sm font-black text-slate-900 dark:text-white">{lang === 'ar' ? 'بريكات الإيجنت لهذا اليوم' : 'Agent breaks for this day'}</h4>
          <p className="mt-1 text-xs text-slate-500">{lang === 'ar' ? 'هذه البريكات تخص الموظف المحدد فقط، حتى لو كان الشفت مشتركًا.' : 'These breaks belong only to this employee, even when the shift is shared.'}</p>
        </div>
        <button type="button" onClick={addBreak} className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-bold text-amber-800 hover:bg-amber-100">
          <Plus size={14} />{lang === 'ar' ? 'إضافة بريك' : 'Add break'}
        </button>
      </div>

      {!breaks.length && legacyBreaks.length > 0 && onCopyLegacy && (
        <button type="button" onClick={onCopyLegacy} className="w-full rounded-lg border border-dashed border-amber-300 px-3 py-2 text-start text-xs font-bold text-amber-800 hover:bg-amber-50">
          {lang === 'ar' ? 'نسخ بريكات الشفت القديمة لهذا الإيجنت فقط' : 'Copy legacy shift breaks to this agent only'}
        </button>
      )}

      {!breaks.length && (
        <div className="rounded-lg border border-dashed border-slate-200 p-3 text-center text-xs text-slate-500">
          {lang === 'ar' ? 'لا توجد بريكات محددة لهذا الإيجنت في هذا اليوم.' : 'No breaks assigned to this agent for this day.'}
        </div>
      )}

      <div className="space-y-2">
        {breaks.map((item, index) => (
          <div key={item.id} className="grid grid-cols-1 gap-2 rounded-lg border border-amber-100 bg-white dark:bg-slate-900 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
            <div className="space-y-2">
              <select value={typeFor(item)} onChange={event => {
                const selected = BREAK_TYPES.find(type => type.value === event.target.value) || BREAK_TYPES[3];
                updateBreak(index, { nameAr: selected.ar, nameEn: selected.en });
              }} className="w-full rounded-lg border border-gray-200 px-2.5 py-2 text-sm">
                {BREAK_TYPES.map(type => <option key={type.value} value={type.value}>{lang === 'ar' ? type.ar : type.en}</option>)}
              </select>
              <input type="text" value={item.nameAr} onChange={event => updateBreak(index, { nameAr: event.target.value })} placeholder={lang === 'ar' ? 'اسم البريك' : 'Break name in Arabic'} className="w-full rounded-lg border border-gray-200 px-2.5 py-2 text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs font-bold text-slate-600 dark:text-slate-400">{lang === 'ar' ? 'من' : 'From'}<input type="time" value={item.startTime} onChange={event => updateBreak(index, { startTime: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-2" /></label>
              <label className="text-xs font-bold text-slate-600 dark:text-slate-400">{lang === 'ar' ? 'إلى' : 'To'}<input type="time" value={item.endTime} onChange={event => updateBreak(index, { endTime: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-2" /></label>
              <div className="col-span-2 text-xs text-slate-500">{lang === 'ar' ? 'المدة: ' : 'Duration: '}{durationMinutes(item.startTime, item.endTime)} {lang === 'ar' ? 'دقيقة' : 'min'}</div>
            </div>
            <button type="button" onClick={() => onChange(breaks.filter((_, itemIndex) => itemIndex !== index))} className="self-start rounded-lg p-2 text-red-600 hover:bg-red-50" title={lang === 'ar' ? 'حذف البريك' : 'Delete break'}>
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import { Plus, Edit2, Trash2, X, Save, Coffee } from 'lucide-react';
import { Shift, ShiftBreak, Language } from '../types';

interface ShiftManagerProps {
  shifts: Shift[];
  lang: Language;
  onAddShift?: (shift: Shift) => void;
  onUpdateShift?: (shift: Shift) => void;
  onDeleteShift?: (shiftId: string) => void;
}

const DEFAULT_FORM: Partial<Shift> = {
  nameAr: '',
  nameEn: '',
  startTime: '09:00',
  endTime: '17:00',
  durationMinutes: 480,
  gracePeriodMinutes: 5,
  workDays: [0, 1, 2, 3, 4],
  breaks: [],
};

const BREAK_TYPES: Array<{ value: string; ar: string; en: string }> = [
  { value: 'lunch', ar: 'غداء', en: 'Lunch' },
  { value: 'prayer', ar: 'صلاة', en: 'Prayer' },
  { value: 'rest', ar: 'راحة', en: 'Rest' },
  { value: 'other', ar: 'أخرى', en: 'Other' },
];

const timeToMinutes = (value: string) => {
  const [h, m] = value.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

const getBreakDuration = (start: string, end: string) =>
  Math.max(0, timeToMinutes(end) - timeToMinutes(start));

export const ShiftManager: React.FC<ShiftManagerProps> = ({
  shifts,
  lang,
  onAddShift,
  onUpdateShift,
  onDeleteShift,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [editingShift, setEditingShift] = useState<Shift | null>(null);
  const [formData, setFormData] = useState<Partial<Shift>>(DEFAULT_FORM);

  const handleOpenForm = (shift?: Shift) => {
    if (shift) {
      setEditingShift(shift);
      setFormData({ ...shift, breaks: (shift.breaks || []).map(item => ({ ...item })) });
    } else {
      setEditingShift(null);
      setFormData({ ...DEFAULT_FORM, breaks: [] });
    }
    setIsOpen(true);
  };

  const updateBreak = (index: number, patch: Partial<ShiftBreak>) => {
    const breaks = [...(formData.breaks || [])];
    breaks[index] = { ...breaks[index], ...patch };
    if (patch.startTime || patch.endTime) {
      breaks[index].durationMinutes = getBreakDuration(breaks[index].startTime, breaks[index].endTime);
    }
    setFormData({ ...formData, breaks });
  };

  const addBreak = () => {
    const breaks = [...(formData.breaks || [])];
    breaks.push({
      id: `break_${Date.now()}_${breaks.length}`,
      nameAr: 'غداء',
      nameEn: 'Lunch',
      startTime: '13:00',
      endTime: '14:00',
      durationMinutes: 60,
    });
    setFormData({ ...formData, breaks });
  };

  const removeBreak = (index: number) => {
    setFormData({ ...formData, breaks: (formData.breaks || []).filter((_, i) => i !== index) });
  };

  const handleSaveShift = () => {
    if (!formData.nameAr || !formData.nameEn || !formData.startTime || !formData.endTime) {
      alert(lang === 'ar' ? 'الرجاء ملء اسم الشفت ووقت البداية والنهاية' : 'Please fill the shift name, start time and end time');
      return;
    }

    if (timeToMinutes(formData.endTime) <= timeToMinutes(formData.startTime)) {
      alert(lang === 'ar' ? 'وقت النهاية يجب أن يكون بعد وقت البداية' : 'End time must be after start time');
      return;
    }

    const normalizedBreaks = (formData.breaks || []).map(item => ({
      ...item,
      durationMinutes: getBreakDuration(item.startTime, item.endTime),
    }));

    for (let i = 0; i < normalizedBreaks.length; i += 1) {
      const item = normalizedBreaks[i];
      if (timeToMinutes(item.endTime) <= timeToMinutes(item.startTime)) {
        alert(lang === 'ar' ? `البريك رقم ${i + 1}: وقت النهاية يجب أن يكون بعد البداية` : `Break ${i + 1}: end time must be after start time`);
        return;
      }
      if (timeToMinutes(item.startTime) < timeToMinutes(formData.startTime) || timeToMinutes(item.endTime) > timeToMinutes(formData.endTime)) {
        alert(lang === 'ar' ? `البريك رقم ${i + 1} يجب أن يكون داخل وقت الشفت` : `Break ${i + 1} must be inside the shift time`);
        return;
      }
      for (let j = i + 1; j < normalizedBreaks.length; j += 1) {
        const other = normalizedBreaks[j];
        if (timeToMinutes(item.startTime) < timeToMinutes(other.endTime) && timeToMinutes(other.startTime) < timeToMinutes(item.endTime)) {
          alert(lang === 'ar' ? 'يوجد تداخل بين البريكات' : 'Breaks cannot overlap');
          return;
        }
      }
    }

    const shift: Shift = {
      id: editingShift?.id || `shift_${Date.now()}`,
      nameAr: formData.nameAr,
      nameEn: formData.nameEn,
      startTime: formData.startTime,
      endTime: formData.endTime,
      durationMinutes: Number(formData.durationMinutes) || 480,
      gracePeriodMinutes: Number(formData.gracePeriodMinutes) || 0,
      workDays: formData.workDays || [0, 1, 2, 3, 4],
      breaks: normalizedBreaks,
    };

    if (editingShift) onUpdateShift?.(shift);
    else onAddShift?.(shift);

    setIsOpen(false);
    setEditingShift(null);
  };

  const handleDeleteShift = (shiftId: string) => {
    if (confirm(lang === 'ar' ? 'هل أنت متأكد من الحذف؟' : 'Are you sure you want to delete?')) {
      onDeleteShift?.(shiftId);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-bold text-gray-900">{lang === 'ar' ? 'إدارة الشفتات' : 'Shift Management'}</h3>
        <button onClick={() => handleOpenForm()} className="flex items-center gap-2 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition text-sm font-semibold">
          <Plus size={16} /> {lang === 'ar' ? 'شفت جديد' : 'New Shift'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {shifts.map(shift => (
          <div key={shift.id} className="border border-gray-200 rounded-lg p-4 bg-white">
            <div className="flex justify-between items-start mb-3">
              <div>
                <h4 className="font-bold text-gray-900">{lang === 'ar' ? shift.nameAr : shift.nameEn}</h4>
                <p className="text-sm text-gray-600">{shift.startTime} - {shift.endTime}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => handleOpenForm(shift)} className="p-1 text-blue-600 hover:bg-blue-50 rounded transition" title={lang === 'ar' ? 'تعديل' : 'Edit'}><Edit2 size={16} /></button>
                <button onClick={() => handleDeleteShift(shift.id)} className="p-1 text-red-600 hover:bg-red-50 rounded transition" title={lang === 'ar' ? 'حذف' : 'Delete'}><Trash2 size={16} /></button>
              </div>
            </div>
            <div className="text-xs text-gray-500 space-y-1">
              <p>{lang === 'ar' ? 'المدة: ' : 'Duration: '}{shift.durationMinutes || 0} {lang === 'ar' ? 'دقيقة' : 'min'}</p>
              <p>{lang === 'ar' ? 'فترة الأمان: ' : 'Grace Period: '}{shift.gracePeriodMinutes} {lang === 'ar' ? 'دقيقة' : 'min'}</p>
              <p className="flex items-center gap-1"><Coffee size={13} /> {shift.breaks?.length || 0} {lang === 'ar' ? 'بريك' : 'breaks'}</p>
            </div>
            {!!shift.breaks?.length && (
              <div className="mt-3 pt-3 border-t border-gray-100 space-y-1">
                {shift.breaks.map(item => <div key={item.id} className="text-xs text-slate-600 flex justify-between"><span>{lang === 'ar' ? item.nameAr : item.nameEn}</span><span className="font-mono">{item.startTime} - {item.endTime}</span></div>)}
              </div>
            )}
          </div>
        ))}
      </div>

      {isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full mx-4 p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-5">
              <h4 className="text-lg font-bold">{editingShift ? (lang === 'ar' ? 'تعديل الشفت' : 'Edit Shift') : (lang === 'ar' ? 'شفت جديد' : 'New Shift')}</h4>
              <button onClick={() => setIsOpen(false)} className="text-gray-500 hover:text-gray-700"><X size={20} /></button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="block text-sm font-medium text-gray-700">{lang === 'ar' ? 'اسم الشفت (عربي)' : 'Shift Name (Arabic)'}<input type="text" value={formData.nameAr || ''} onChange={e => setFormData({ ...formData, nameAr: e.target.value })} className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg" /></label>
                <label className="block text-sm font-medium text-gray-700">{lang === 'ar' ? 'اسم الشفت (إنجليزي)' : 'Shift Name (English)'}<input type="text" value={formData.nameEn || ''} onChange={e => setFormData({ ...formData, nameEn: e.target.value })} className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg" /></label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="block text-sm font-medium text-gray-700">{lang === 'ar' ? 'وقت بداية الشفت' : 'Shift Start'}<input type="time" value={formData.startTime || '09:00'} onChange={e => setFormData({ ...formData, startTime: e.target.value })} className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg" /></label>
                <label className="block text-sm font-medium text-gray-700">{lang === 'ar' ? 'وقت نهاية الشفت' : 'Shift End'}<input type="time" value={formData.endTime || '17:00'} onChange={e => setFormData({ ...formData, endTime: e.target.value })} className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg" /></label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="block text-sm font-medium text-gray-700">{lang === 'ar' ? 'ساعات العمل الفعلية (دقيقة)' : 'Actual Work Duration (minutes)'}<input type="number" min="0" value={formData.durationMinutes ?? 480} onChange={e => setFormData({ ...formData, durationMinutes: Number(e.target.value) })} className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg" /></label>
                <label className="block text-sm font-medium text-gray-700">{lang === 'ar' ? 'فترة السماح (دقيقة)' : 'Grace Period (minutes)'}<input type="number" min="0" value={formData.gracePeriodMinutes ?? 0} onChange={e => setFormData({ ...formData, gracePeriodMinutes: Number(e.target.value) })} className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg" /></label>
              </div>

              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div><h5 className="font-black text-slate-900">{lang === 'ar' ? 'البريكات الخاصة بالشفت' : 'Shift Breaks'}</h5><p className="text-xs text-slate-500 mt-1">{lang === 'ar' ? 'حدد اسم ووقت كل بريك. البريكات تظهر للموظف في الجدول الأسبوعي.' : 'Configure each break. Breaks are shown to the employee in the weekly schedule.'}</p></div>
                  <button type="button" onClick={addBreak} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-amber-300 text-amber-800 text-xs font-bold hover:bg-amber-100"><Plus size={14} />{lang === 'ar' ? 'إضافة بريك' : 'Add break'}</button>
                </div>
                {(formData.breaks || []).length === 0 && <div className="text-xs text-slate-500 py-2">{lang === 'ar' ? 'لا توجد بريكات لهذا الشفت.' : 'No breaks configured for this shift.'}</div>}
                <div className="space-y-3">
                  {(formData.breaks || []).map((item, index) => (
                    <div key={item.id} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3 bg-white border border-amber-100 rounded-lg p-3">
                      <div className="space-y-2">
                        <select value={BREAK_TYPES.find(t => t.ar === item.nameAr)?.value || 'other'} onChange={e => { const type = BREAK_TYPES.find(t => t.value === e.target.value) || BREAK_TYPES[3]; updateBreak(index, { nameAr: type.ar, nameEn: type.en }); }} className="w-full px-2.5 py-2 border border-gray-200 rounded-lg text-sm"><option value="lunch">{lang === 'ar' ? 'غداء' : 'Lunch'}</option><option value="prayer">{lang === 'ar' ? 'صلاة' : 'Prayer'}</option><option value="rest">{lang === 'ar' ? 'راحة' : 'Rest'}</option><option value="other">{lang === 'ar' ? 'أخرى' : 'Other'}</option></select>
                        <input type="text" value={item.nameAr} onChange={e => updateBreak(index, { nameAr: e.target.value })} placeholder={lang === 'ar' ? 'اسم البريك بالعربي' : 'Arabic break name'} className="w-full px-2.5 py-2 border border-gray-200 rounded-lg text-sm" />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <label className="text-xs font-bold text-slate-600">{lang === 'ar' ? 'من' : 'From'}<input type="time" value={item.startTime} onChange={e => updateBreak(index, { startTime: e.target.value })} className="mt-1 w-full px-2 py-2 border border-gray-200 rounded-lg" /></label>
                        <label className="text-xs font-bold text-slate-600">{lang === 'ar' ? 'إلى' : 'To'}<input type="time" value={item.endTime} onChange={e => updateBreak(index, { endTime: e.target.value })} className="mt-1 w-full px-2 py-2 border border-gray-200 rounded-lg" /></label>
                        <div className="col-span-2 text-xs text-slate-500">{lang === 'ar' ? 'المدة: ' : 'Duration: '}{getBreakDuration(item.startTime, item.endTime)} {lang === 'ar' ? 'دقيقة' : 'min'}</div>
                      </div>
                      <button type="button" onClick={() => removeBreak(index)} className="self-start p-2 text-red-600 hover:bg-red-50 rounded-lg" title={lang === 'ar' ? 'حذف البريك' : 'Delete break'}><Trash2 size={16} /></button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button onClick={() => setIsOpen(false)} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-semibold">{lang === 'ar' ? 'إلغاء' : 'Cancel'}</button>
              <button onClick={handleSaveShift} className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold flex items-center justify-center gap-2"><Save size={16} />{lang === 'ar' ? 'حفظ الشفت' : 'Save Shift'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

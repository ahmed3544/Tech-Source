import React, { useState } from 'react';
import { Plus, Edit2, Trash2, X, Save } from 'lucide-react';
import { Shift, Language } from '../types';

interface ShiftManagerProps {
  shifts: Shift[];
  lang: Language;
  onAddShift?: (shift: Shift) => void;
  onUpdateShift?: (shift: Shift) => void;
  onDeleteShift?: (shiftId: string) => void;
}

const DEFAULT_FORM: Partial<Shift> = {
  startTime: '09:00',
  endTime: '17:00',
  durationMinutes: 480,
  gracePeriodMinutes: 5,
  workDays: [0, 1, 2, 3, 4],
};

const timeToMinutes = (value: string) => {
  const [h, m] = value.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

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
      setFormData({ ...shift });
    } else {
      setEditingShift(null);
      setFormData({ ...DEFAULT_FORM });
    }
    setIsOpen(true);
  };

  const handleSaveShift = () => {
    if (formData.startDate && formData.endDate && formData.endDate < formData.startDate) {
      alert(lang === 'ar' ? 'تاريخ النهاية يجب أن يكون بعد أو مساويًا لتاريخ البداية' : 'End date must be on or after the start date');
      return;
    }

    if (!formData.startTime || !formData.endTime) {
      alert(lang === 'ar' ? 'الرجاء تحديد وقت بداية ونهاية الشفت' : 'Please select the shift start and end time');
      return;
    }

    if (timeToMinutes(formData.endTime) <= timeToMinutes(formData.startTime)) {
      alert(lang === 'ar' ? 'وقت النهاية يجب أن يكون بعد وقت البداية' : 'End time must be after start time');
      return;
    }

    const shift: Shift = {
      id: editingShift?.id || `shift_${Date.now()}`,
      nameAr: String(formData.nameAr || '').trim() || `${formData.startTime} - ${formData.endTime}`,
      nameEn: String(formData.nameEn || '').trim() || `${formData.startTime} - ${formData.endTime}`,
      startTime: formData.startTime,
      endTime: formData.endTime,
      startDate: formData.startDate,
      endDate: formData.endDate,
      durationMinutes: Number(formData.durationMinutes) || 480,
      gracePeriodMinutes: Number(formData.gracePeriodMinutes) || 0,
      workDays: formData.workDays || [0, 1, 2, 3, 4],
      // Keep legacy shift-level values intact, but new breaks belong to daily employee assignments.
      breaks: editingShift?.breaks,
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
          <div key={shift.id} className="border border-gray-200 rounded-lg p-4 bg-white dark:bg-slate-900">
            <div className="flex justify-between items-start mb-3">
              <div>
                <h4 className="font-bold text-gray-900">{lang === 'ar' ? shift.nameAr : shift.nameEn}</h4>
                <p className="text-sm text-gray-600">{shift.startTime} - {shift.endTime}</p>
                {(shift.startDate || shift.endDate) && (
                  <p className="text-xs text-emerald-700 mt-1 font-semibold">
                    {lang === 'ar' ? 'الفترة: ' : 'Period: '}{shift.startDate || '—'} {lang === 'ar' ? 'إلى' : 'to'} {shift.endDate || '—'}
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={() => handleOpenForm(shift)} className="p-1 text-blue-600 hover:bg-blue-50 rounded transition" title={lang === 'ar' ? 'تعديل' : 'Edit'}><Edit2 size={16} /></button>
                <button onClick={() => handleDeleteShift(shift.id)} className="p-1 text-red-600 hover:bg-red-50 rounded transition" title={lang === 'ar' ? 'حذف' : 'Delete'}><Trash2 size={16} /></button>
              </div>
            </div>
            <div className="text-xs text-gray-500 space-y-1">
              <p>{lang === 'ar' ? 'المدة: ' : 'Duration: '}{shift.durationMinutes || 0} {lang === 'ar' ? 'دقيقة' : 'min'}</p>
              <p>{lang === 'ar' ? 'فترة الأمان: ' : 'Grace Period: '}{shift.gracePeriodMinutes} {lang === 'ar' ? 'دقيقة' : 'min'}</p>
            </div>
          </div>
        ))}
      </div>

      {isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl max-w-2xl w-full mx-4 p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-5">
              <h4 className="text-lg font-bold">{editingShift ? (lang === 'ar' ? 'تعديل الشفت' : 'Edit Shift') : (lang === 'ar' ? 'شفت جديد' : 'New Shift')}</h4>
              <button onClick={() => setIsOpen(false)} className="text-gray-500 hover:text-gray-700"><X size={20} /></button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="block text-sm font-medium text-gray-700">{lang === 'ar' ? 'اسم الشفت بالعربي' : 'Arabic shift name'}<input type="text" value={formData.nameAr || ''} onChange={e => setFormData({ ...formData, nameAr: e.target.value })} placeholder={lang === 'ar' ? 'مثال: شفت صباحي' : 'Example: Morning shift'} className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg" /></label>
                <label className="block text-sm font-medium text-gray-700">{lang === 'ar' ? 'اسم الشفت بالإنجليزية' : 'English shift name'}<input type="text" value={formData.nameEn || ''} onChange={e => setFormData({ ...formData, nameEn: e.target.value })} placeholder="Morning shift" className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg" /></label>
              </div>

              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <h5 className="font-black text-slate-900 dark:text-white mb-3">{lang === 'ar' ? 'تاريخ الشفت' : 'Shift Date Range'}</h5>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <label className="block text-sm font-medium text-gray-700">{lang === 'ar' ? 'من تاريخ' : 'From Date'}<input type="date" value={formData.startDate || ''} onChange={e => setFormData({ ...formData, startDate: e.target.value })} className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg" /></label>
                  <label className="block text-sm font-medium text-gray-700">{lang === 'ar' ? 'إلى تاريخ' : 'To Date'}<input type="date" value={formData.endDate || ''} onChange={e => setFormData({ ...formData, endDate: e.target.value })} className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg" /></label>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="block text-sm font-medium text-gray-700">{lang === 'ar' ? 'وقت بداية الشفت' : 'Shift Start'}<input type="time" value={formData.startTime || '09:00'} onChange={e => setFormData({ ...formData, startTime: e.target.value })} className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg" /></label>
                <label className="block text-sm font-medium text-gray-700">{lang === 'ar' ? 'وقت نهاية الشفت' : 'Shift End'}<input type="time" value={formData.endTime || '17:00'} onChange={e => setFormData({ ...formData, endTime: e.target.value })} className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg" /></label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="block text-sm font-medium text-gray-700">{lang === 'ar' ? 'ساعات العمل الفعلية (دقيقة)' : 'Actual Work Duration (minutes)'}<input type="number" min="0" value={formData.durationMinutes ?? 480} onChange={e => setFormData({ ...formData, durationMinutes: Number(e.target.value) })} className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg" /></label>
                <label className="block text-sm font-medium text-gray-700">{lang === 'ar' ? 'فترة السماح (دقيقة)' : 'Grace Period (minutes)'}<input type="number" min="0" value={formData.gracePeriodMinutes ?? 0} onChange={e => setFormData({ ...formData, gracePeriodMinutes: Number(e.target.value) })} className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg" /></label>
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

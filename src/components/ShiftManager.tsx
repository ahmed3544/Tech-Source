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

export const ShiftManager: React.FC<ShiftManagerProps> = ({
  shifts,
  lang,
  onAddShift,
  onUpdateShift,
  onDeleteShift,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [editingShift, setEditingShift] = useState<Shift | null>(null);
  const [formData, setFormData] = useState<Partial<Shift>>({
    nameAr: '',
    nameEn: '',
    startTime: '09:00',
    endTime: '17:00',
    durationMinutes: 480,
    gracePeriodMinutes: 5,
  });

  const handleOpenForm = (shift?: Shift) => {
    if (shift) {
      setEditingShift(shift);
      setFormData(shift);
    } else {
      setEditingShift(null);
      setFormData({
        nameAr: '',
        nameEn: '',
        startTime: '09:00',
        endTime: '17:00',
        durationMinutes: 480,
        gracePeriodMinutes: 5,
      });
    }
  };

  const handleSaveShift = () => {
    if (!formData.nameAr || !formData.nameEn || !formData.startTime || !formData.endTime) {
      alert(lang === 'ar' ? 'الرجاء ملء جميع الحقول' : 'Please fill all fields');
      return;
    }

    const shift: Shift = {
  id: editingShift?.id || `shift_${Date.now()}`,
  nameAr: formData.nameAr,
  nameEn: formData.nameEn,
  startTime: formData.startTime,
  endTime: formData.endTime,
  durationMinutes: formData.durationMinutes || 480,
  gracePeriodMinutes: formData.gracePeriodMinutes || 5,
  workDays: editingShift?.workDays ?? [0, 1, 2, 3, 4],
};

    if (editingShift) {
      onUpdateShift?.(shift);
    } else {
      onAddShift?.(shift);
    }

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
        <h3 className="text-lg font-bold text-gray-900">
          {lang === 'ar' ? 'إدارة الشفتات' : 'Shift Management'}
        </h3>
        <button
          onClick={() => {
            handleOpenForm();
            setIsOpen(true);
          }}
          className="flex items-center gap-2 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition text-sm font-semibold"
        >
          <Plus size={16} />
          {lang === 'ar' ? 'شفت جديد' : 'New Shift'}
        </button>
      </div>

      {/* Shifts List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {shifts.map(shift => (
          <div key={shift.id} className="border border-gray-200 rounded-lg p-4 bg-white">
            <div className="flex justify-between items-start mb-3">
              <div>
                <h4 className="font-bold text-gray-900">
                  {lang === 'ar' ? shift.nameAr : shift.nameEn}
                </h4>
                <p className="text-sm text-gray-600">
                  {shift.startTime} - {shift.endTime}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    handleOpenForm(shift);
                    setIsOpen(true);
                  }}
                  className="p-1 text-blue-600 hover:bg-blue-50 rounded transition"
                  title={lang === 'ar' ? 'تعديل' : 'Edit'}
                >
                  <Edit2 size={16} />
                </button>
                <button
                  onClick={() => handleDeleteShift(shift.id)}
                  className="p-1 text-red-600 hover:bg-red-50 rounded transition"
                  title={lang === 'ar' ? 'حذف' : 'Delete'}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
            <div className="text-xs text-gray-500 space-y-1">
              <p>
                {lang === 'ar' ? 'المدة: ' : 'Duration: '}{shift.durationMinutes} {lang === 'ar' ? 'دقيقة' : 'min'}
              </p>
              <p>
                {lang === 'ar' ? 'فترة الأمان: ' : 'Grace Period: '}{shift.gracePeriodMinutes} {lang === 'ar' ? 'دقيقة' : 'min'}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Form Modal */}
      {isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <div className="flex justify-between items-center mb-4">
              <h4 className="text-lg font-bold">
                {editingShift
                  ? lang === 'ar'
                    ? 'تعديل الشفت'
                    : 'Edit Shift'
                  : lang === 'ar'
                  ? 'شفت جديد'
                  : 'New Shift'}
              </h4>
              <button
                onClick={() => setIsOpen(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {lang === 'ar' ? 'اسم الشفت (عربي)' : 'Shift Name (Arabic)'}
                </label>
                <input
                  type="text"
                  value={formData.nameAr || ''}
                  onChange={e => setFormData({ ...formData, nameAr: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {lang === 'ar' ? 'اسم الشفت (إنجليزي)' : 'Shift Name (English)'}
                </label>
                <input
                  type="text"
                  value={formData.nameEn || ''}
                  onChange={e => setFormData({ ...formData, nameEn: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {lang === 'ar' ? 'وقت البداية' : 'Start Time'}
                  </label>
                  <input
                    type="time"
                    value={formData.startTime || '09:00'}
                    onChange={e => setFormData({ ...formData, startTime: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {lang === 'ar' ? 'وقت النهاية' : 'End Time'}
                  </label>
                  <input
                    type="time"
                    value={formData.endTime || '17:00'}
                    onChange={e => setFormData({ ...formData, endTime: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {lang === 'ar' ? 'المدة (دقيقة)' : 'Duration (minutes)'}
                  </label>
                  <input
                    type="number"
                    value={formData.durationMinutes || 480}
                    onChange={e => setFormData({ ...formData, durationMinutes: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {lang === 'ar' ? 'فترة الأمان (دقيقة)' : 'Grace Period (minutes)'}
                  </label>
                  <input
                    type="number"
                    value={formData.gracePeriodMinutes || 5}
                    onChange={e => setFormData({ ...formData, gracePeriodMinutes: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={() => setIsOpen(false)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition font-semibold"
              >
                {lang === 'ar' ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                onClick={handleSaveShift}
                className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition font-semibold flex items-center justify-center gap-2"
              >
                <Save size={16} />
                {lang === 'ar' ? 'حفظ' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

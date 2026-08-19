import React, { useState, useEffect } from 'react';
import { 
  Upload, 
  FileSpreadsheet, 
  FileText, 
  Building2, 
  Check, 
  AlertCircle, 
  X, 
  Download, 
  Users, 
  Sparkles,
  Database
} from 'lucide-react';
import { Employee, AttendanceRecord, Language } from '../types';
import { getTodayString } from '../utils/helpers';

interface DataImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  companyNameAr?: string;
  companyNameEn?: string;
  onUpdateCompany?: (nameAr: string, nameEn: string) => void;
  onImportEmployees: (newEmployees: Employee[], overwrite: boolean) => void;
  onImportAttendance: (records: AttendanceRecord[], overwrite: boolean) => void;
  employeesCount: number;
  lang: Language;
  initialTab?: 'employees' | 'raw_paste' | 'backup';
}

export function DataImportModal({
  isOpen,
  onClose,
  companyNameAr = '',
  companyNameEn = '',
  onUpdateCompany,
  onImportEmployees,
  onImportAttendance,
  employeesCount,
  lang,
  initialTab = 'backup',
}: DataImportModalProps) {
  const [activeTab, setActiveTab] = useState<'employees' | 'raw_paste' | 'backup'>(initialTab);

  useEffect(() => {
    if (isOpen && initialTab) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);
  const [rawText, setRawText] = useState('');
  const [overwrite, setOverwrite] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [nameAr, setNameAr] = useState(companyNameAr);
  const [nameEn, setNameEn] = useState(companyNameEn);

  useEffect(() => {
    setNameAr(companyNameAr);
    setNameEn(companyNameEn);
  }, [companyNameAr, companyNameEn]);

  const handleDownloadBackup = async () => {
    try {
      setIsProcessing(true);
      setErrorMsg('');
      setSuccessMsg('');
      const res = await fetch('/api/backup');
      if (!res.ok) throw new Error('فشل إنشاء أو تحميل النسخة الاحتياطية');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const timestamp = new Date().toISOString().split('T')[0];
      link.setAttribute('download', `server_data_backup_${timestamp}.json`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setSuccessMsg(lang === 'ar' ? 'تم تحضير وتحميل النسخة الاحتياطية بنجاح!' : 'Backup file downloaded successfully!');
    } catch (err: any) {
      setErrorMsg(err.message || 'Error downloading backup');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRestoreBackupFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsProcessing(true);
    setErrorMsg('');
    setSuccessMsg('');

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const text = evt.target?.result as string;
        const backupObj = JSON.parse(text);
        if (!backupObj || (!backupObj.employees && !Array.isArray(backupObj))) {
          throw new Error('ملف النسخة الاحتياطية غير صالح');
        }

        const res = await fetch('/api/backup/restore', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(backupObj)
        });
        const data = await res.json();
        if (data.success) {
          setSuccessMsg(lang === 'ar' ? 'تم استعادة النسخة الاحتياطية بنجاح! جاري تحديث الشاشة...' : 'Database restored successfully! Reloading...');
          setTimeout(() => {
            window.location.reload();
          }, 1500);
        } else {
          setErrorMsg(data.error || 'فشلت عملية الاستعادة');
        }
      } catch (err: any) {
        setErrorMsg(err.message || 'Error parsing backup file');
      } finally {
        setIsProcessing(false);
      }
    };
    reader.readAsText(file);
  };

  if (!isOpen) return null;

  const handleSaveCompany = (e: React.FormEvent) => {
    e.preventDefault();
    if (onUpdateCompany) {
      onUpdateCompany(nameAr, nameEn);
    }
    setSuccessMsg(lang === 'ar' ? 'تم تحديث اسم الشركة بنجاح!' : 'Company name updated successfully!');
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  const parseCSV = (text: string): Employee[] => {
    const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
    if (lines.length < 2) return [];

    const result: Employee[] = [];
    // Assume header is first line
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      // Split by comma or tab or semicolon
      const cols = line.split(/[,;\t]/).map(c => c.replace(/^["']|["']$/g, '').trim());
      if (cols.length < 2) continue;

      const code = cols[0] || `EMP-${100 + i}`;
      const nameArCol = cols[1] || `موظف ${i}`;
      const nameEnCol = cols[2] || cols[1] || `Employee ${i}`;
      const dept = cols[3] || 'General';
      const jobAr = cols[4] || 'موظف';
      const jobEn = cols[5] || cols[4] || 'Employee';
      const email = cols[6] || `emp${i}@company.com`;
      const phone = cols[7] || `+9665000000${i}`;
      const pin = cols[8] || `${1000 + i}`;

      result.push({
        id: `emp-imp-${Date.now()}-${i}`,
        code,
        nameAr: nameArCol,
        nameEn: nameEnCol,
        avatar: '',
        email,
        phone,
        department: dept,
        jobTitleAr: jobAr,
        jobTitleEn: jobEn,
        shiftId: 'shift-1',
        pin,
        joinedDate: getTodayString(),
        status: 'active',
      });
    }
    return result;
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMsg('');
    setSuccessMsg('');
    setIsProcessing(true);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const content = evt.target?.result as string;
        let importedEmps: Employee[] = [];

        if (file.name.endsWith('.json')) {
          const parsed = JSON.parse(content);
          if (Array.isArray(parsed)) {
            importedEmps = parsed.map((item, idx) => ({
              id: item.id || `emp-json-${Date.now()}-${idx}`,
              code: item.code || String(100 + idx),
              nameAr: item.nameAr || item.name || `موظف ${idx + 1}`,
              nameEn: item.nameEn || item.name || `Employee ${idx + 1}`,
              avatar: item.avatar || '',
              email: item.email || `user${idx}@company.sa`,
              phone: item.phone || '+966 50 000 0000',
              department: item.department || 'General',
              jobTitleAr: item.jobTitleAr || 'موظف',
              jobTitleEn: item.jobTitleEn || 'Employee',
              shiftId: item.shiftId || 'shift-1',
              pin: item.pin || '1234',
              joinedDate: item.joinedDate || getTodayString(),
              status: item.status || 'active',
            }));
          } else if (parsed.employees && Array.isArray(parsed.employees)) {
            if (parsed.companyNameAr) {
              onUpdateCompany(parsed.companyNameAr, parsed.companyNameEn || parsed.companyNameAr);
            }
            importedEmps = parsed.employees;
          }
        } else {
          // CSV / TXT / TSV
          importedEmps = parseCSV(content);
        }

        if (importedEmps.length === 0) {
          setErrorMsg(lang === 'ar' ? 'لم يتم العثور على موظفين في الملف المرفق. تأكد من تنسيق البيانات.' : 'No employees found in file. Please verify data format.');
        } else {
          onImportEmployees(importedEmps, overwrite);
          setSuccessMsg(lang === 'ar' ? `تم استيراد ${importedEmps.length} موظف بنجاح!` : `Successfully imported ${importedEmps.length} employees!`);
        }
      } catch (err: any) {
        setErrorMsg(lang === 'ar' ? 'حدث خطأ أثناء قراءة الملف: ' + err.message : 'Error reading file: ' + err.message);
      } finally {
        setIsProcessing(false);
      }
    };
    reader.readAsText(file);
  };

  const handleParseRawText = () => {
    if (!rawText.trim()) return;
    setErrorMsg('');
    setSuccessMsg('');
    setIsProcessing(true);

    try {
      let importedEmps: Employee[] = [];
      if (rawText.trim().startsWith('{') || rawText.trim().startsWith('[')) {
        const parsed = JSON.parse(rawText);
        if (Array.isArray(parsed)) {
          importedEmps = parsed;
        } else if (parsed.employees) {
          if (parsed.companyNameAr) {
            onUpdateCompany(parsed.companyNameAr, parsed.companyNameEn || parsed.companyNameAr);
          }
          importedEmps = parsed.employees;
        }
      } else {
        importedEmps = parseCSV(rawText);
      }

      if (importedEmps.length === 0) {
        setErrorMsg(lang === 'ar' ? 'تعذر استخراج بيانات الموظفين من النص المنسوخ.' : 'Failed to extract employee data from text.');
      } else {
        onImportEmployees(importedEmps, overwrite);
        setSuccessMsg(lang === 'ar' ? `تم استيراد ${importedEmps.length} موظف بنجاح!` : `Successfully imported ${importedEmps.length} employees!`);
        setRawText('');
      }
    } catch (err: any) {
      setErrorMsg(lang === 'ar' ? 'خطأ في تنسيق النص: ' + err.message : 'Invalid format: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadSampleCSV = () => {
    const csvContent = `كود الموظف,اسم الموظف بالعربي,English Name,القسم,المسمى الوظيفي,English Job,البريد الإلكتروني,رقم الهاتف,رمز PIN
101,محمد أحمد العتيبي,Mohammed Ahmed,CX,Senior Graphic Designer,Senior Graphic Designer,mohammed@company.sa,+966501234567,1234
102,سارة خالد الشمري,Sara Khaled,CX,CX Agent,CX Agent,sara@company.sa,+966559876543,2345
103,عبدالله علي الغامدي,Abdullah Ali,E-Commerce,E-Commerce Specialist,E-Commerce Specialist,abdullah@company.sa,+966543218765,3456`;

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'نموذج_استيراد_الموظفين.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-md animate-fade-in overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden my-8">
        
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">
                {lang === 'ar' ? 'استيراد البيانات والنسخة الاحتياطية' : 'Data Import & Backup Safety'}
              </h3>
              <p className="text-xs text-slate-400">
                {lang === 'ar' ? 'رفع ملفات Excel/CSV، النسخة الاحتياطية، أو لصق القوائم المباشرة' : 'Upload Excel/CSV files, backup database, or paste raw data'}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center hover:bg-slate-700 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-950/40 p-1">
          <button
            onClick={() => setActiveTab('backup')}
            className={`flex-1 py-2.5 px-3 text-xs sm:text-sm font-medium rounded-lg transition flex items-center justify-center gap-1.5 ${
              activeTab === 'backup' 
                ? 'bg-emerald-500 text-slate-950 font-bold shadow-sm' 
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Download className="w-4 h-4" />
            {lang === 'ar' ? 'النسخة الاحتياطية' : 'Backup & Safety'}
          </button>

          <button
            onClick={() => setActiveTab('employees')}
            className={`flex-1 py-2.5 px-4 text-xs sm:text-sm font-medium rounded-lg transition flex items-center justify-center gap-2 ${
              activeTab === 'employees' 
                ? 'bg-emerald-500 text-slate-950 font-bold shadow-sm' 
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            {lang === 'ar' ? 'رفع ملف الموظفين' : 'Upload Employees'}
          </button>

          <button
            onClick={() => setActiveTab('raw_paste')}
            className={`flex-1 py-2.5 px-3 text-xs sm:text-sm font-medium rounded-lg transition flex items-center justify-center gap-1.5 ${
              activeTab === 'raw_paste' 
                ? 'bg-emerald-500 text-slate-950 font-bold shadow-sm' 
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <FileText className="w-4 h-4" />
            {lang === 'ar' ? 'لصق نص' : 'Paste Text'}
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-6">
          
          {/* Notifications */}
          {successMsg && (
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center gap-3 text-sm animate-fade-in">
              <Check className="w-5 h-5 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {errorMsg && (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-center gap-3 text-sm animate-fade-in">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* TAB: File Upload (CSV / JSON) */}
          {activeTab === 'employees' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-300">
                  {lang === 'ar' ? 'اختيار ملف بيانات الموظفين (CSV, TSV, JSON)' : 'Select Employee Data File'}
                </label>
                <button
                  onClick={downloadSampleCSV}
                  className="text-xs text-emerald-400 hover:underline flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  {lang === 'ar' ? 'تحميل نموذج Excel / CSV جاهز' : 'Download Sample CSV'}
                </button>
              </div>

              <div className="border-2 border-dashed border-slate-700 hover:border-emerald-500/50 rounded-2xl p-8 text-center bg-slate-800/20 transition relative group">
                <input
                  type="file"
                  accept=".csv,.json,.txt,.tsv"
                  onChange={handleFileUpload}
                  disabled={isProcessing}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />
                <div className="flex flex-col items-center justify-center space-y-3 pointer-events-none">
                  <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center group-hover:scale-110 transition duration-300">
                    <Upload className="w-7 h-7" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">
                      {lang === 'ar' ? 'انقر هنا لاختيار الملف أو اسحبه إلى هذا النطاق' : 'Click to select file or drag & drop'}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      {lang === 'ar' ? 'يدعم ملفات CSV، TSV، ونصوص JSON' : 'Supports CSV, TSV, or JSON formats'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="overwrite-check-1"
                  checked={overwrite}
                  onChange={(e) => setOverwrite(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-emerald-500"
                />
                <label htmlFor="overwrite-check-1" className="text-xs text-slate-300 cursor-pointer">
                  {lang === 'ar' 
                    ? `استبدال الموظفين الحاليين بالكامل (العدد الحالي: ${employeesCount} موظف)` 
                    : `Overwrite existing employees list (Current: ${employeesCount})`}
                </label>
              </div>
            </div>
          )}

          {/* TAB 3: Raw Text Paste */}
          {activeTab === 'raw_paste' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  {lang === 'ar' 
                    ? 'انسخ والصق بيانات الموظفين (أسماء، أكواد، أقسام) بنسق CSV أو JSON:' 
                    : 'Paste Employee CSV or JSON data:'}
                </label>
                <textarea
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  rows={7}
                  placeholder={`101, محمد بن سعيد, Mohamed Said, IT, مدير نظم, mohamed@company.sa, 0501112233, 1234\n102, فاطمة علي, Fatima Ali, HR, أخصائية موارد, fatima@company.sa, 0504445566, 2345`}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-emerald-500 transition leading-relaxed"
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="overwrite-check-2"
                    checked={overwrite}
                    onChange={(e) => setOverwrite(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-emerald-500"
                  />
                  <label htmlFor="overwrite-check-2" className="text-xs text-slate-300 cursor-pointer">
                    {lang === 'ar' ? 'استبدال البيانات الحالية' : 'Overwrite current data'}
                  </label>
                </div>

                <button
                  onClick={handleParseRawText}
                  disabled={!rawText.trim() || isProcessing}
                  className="px-5 py-2.5 rounded-xl bg-emerald-500 text-slate-950 font-bold hover:bg-emerald-400 disabled:opacity-50 transition flex items-center gap-2 text-xs shadow-md"
                >
                  <Sparkles className="w-4 h-4" />
                  {lang === 'ar' ? 'معالجة وتطبيق البيانات' : 'Apply & Process Data'}
                </button>
              </div>
            </div>
          )}

          {/* TAB 4: Backup & Safety */}
          {activeTab === 'backup' && (
            <div className="space-y-5 animate-fade-in">
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20 shrink-0">
                    <Download className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">
                      {lang === 'ar' ? 'تصدير وتحميل النسخة الاحتياطية الكاملة' : 'Download Complete Database Backup'}
                    </h4>
                    <p className="text-xs text-slate-400">
                      {lang === 'ar' ? 'قم بتحميل ملف JSON يحتوي على كافة الموظفين، سجلات الحضور والانصراف، وطلبات الإجازات.' : 'Download a complete JSON snapshot of all employees, attendance records, and leave requests.'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadBackup}
                  disabled={isProcessing}
                  className="w-full py-3 rounded-xl bg-emerald-500 text-slate-950 font-bold hover:bg-emerald-400 transition flex items-center justify-center gap-2 text-xs shadow-md disabled:opacity-50"
                >
                  <Download className="w-4 h-4" />
                  <span>{lang === 'ar' ? 'تحميل النسخة الاحتياطية الآن (JSON)' : 'Download Backup File Now (JSON)'}</span>
                </button>
              </div>

              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center border border-blue-500/20 shrink-0">
                    <Upload className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">
                      {lang === 'ar' ? 'استعادة قاعدة البيانات من ملف نسخة احتياطية' : 'Restore Database from Backup File'}
                    </h4>
                    <p className="text-xs text-slate-400">
                      {lang === 'ar' ? 'حدد ملف النسخة الاحتياطية (server_data_backup_*.json) للاستعادة الآمنة.' : 'Select a backup file (server_data_backup_*.json) for safe database restoration.'}
                    </p>
                  </div>
                </div>
                <label className="w-full py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold transition flex items-center justify-center gap-2 text-xs cursor-pointer border border-slate-700">
                  <Upload className="w-4 h-4 text-emerald-400" />
                  <span>{lang === 'ar' ? 'اختر ملف النسخة الاحتياطية للاستعادة' : 'Select Backup File to Restore'}</span>
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleRestoreBackupFile}
                    className="hidden"
                    disabled={isProcessing}
                  />
                </label>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-emerald-400" />
            <span>
              {lang === 'ar' ? `عدد الموظفين المعرفين حالياً: ${employeesCount}` : `Current defined employees: ${employeesCount}`}
            </span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition"
          >
            {lang === 'ar' ? 'إغلاق Window' : 'Close'}
          </button>
        </div>

      </div>
    </div>
  );
}

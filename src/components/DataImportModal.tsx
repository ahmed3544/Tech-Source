import React, { useState, useEffect } from 'react';
import {
  Upload,
  FileSpreadsheet,
  FileText,
  Check,
  AlertCircle,
  X,
  Download,
  Users,
} from 'lucide-react';

import { Employee, AttendanceRecord, Language } from '../types';
import { getTodayString } from '../utils/helpers';

interface DataImportModalProps {
  isOpen: boolean;
  onClose: () => void;

  companyNameAr?: string;
  companyNameEn?: string;

  onUpdateCompany?: (nameAr: string, nameEn: string) => void;

  onImportEmployees: (
    newEmployees: Employee[],
    overwrite: boolean
  ) => void;

  // موجود للحفاظ على توافق المكون مع الملفات التي تستدعيه
  onImportAttendance: (
    records: AttendanceRecord[],
    overwrite: boolean
  ) => void;

  employeesCount: number;
  lang: Language;

  // لم نعد نستخدم backup
  initialTab?: 'employees' | 'raw_paste';
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
  initialTab = 'employees',
}: DataImportModalProps) {
  // منع تحذير TypeScript بسبب props المستخدمة للتوافق
  void onImportAttendance;
  void onUpdateCompany;

  const [activeTab, setActiveTab] = useState<'employees' | 'raw_paste'>(
    initialTab
  );

  const [rawText, setRawText] = useState('');
  const [overwrite, setOverwrite] = useState(false);

  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const [nameAr] = useState(companyNameAr);
  const [nameEn] = useState(companyNameEn);

  void nameAr;
  void nameEn;

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setSuccessMsg('');
      setErrorMsg('');
    }
  }, [isOpen, initialTab]);

  /*
   * ================================
   * CSV PARSER
   * ================================
   */

  const parseCSV = (text: string): Employee[] => {
    const lines = text
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0);

    if (lines.length < 2) {
      return [];
    }

    const result: Employee[] = [];

    // أول سطر Header
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();

      if (!line) continue;

      const cols = line
        .split(/[,;\t]/)
        .map((c) =>
          c.replace(/^["']|["']$/g, '').trim()
        );

      if (cols.length < 2) continue;

      const code =
        cols[0] || `EMP-${100 + i}`;

      const nameArCol =
        cols[1] || `موظف ${i}`;

      const nameEnCol =
        cols[2] || cols[1] || `Employee ${i}`;

      const dept =
        cols[3] || 'General';

      const jobAr =
        cols[4] || 'موظف';

      const jobEn =
        cols[5] || cols[4] || 'Employee';

      const email =
        cols[6] || `emp${i}@company.com`;

      const phone =
        cols[7] || `+2010000000${i}`;

      const pin =
        cols[8] || `${1000 + i}`;

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

  /*
   * ================================
   * FILE UPLOAD
   * ================================
   */

  const handleFileUpload = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
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

        /*
         * JSON
         */
        if (file.name.toLowerCase().endsWith('.json')) {
          const parsed = JSON.parse(content);

          if (Array.isArray(parsed)) {
            importedEmps = parsed.map(
              (item: any, idx: number) => ({
                id:
                  item.id ||
                  `emp-json-${Date.now()}-${idx}`,

                code:
                  item.code ||
                  String(100 + idx),

                nameAr:
                  item.nameAr ||
                  item.name ||
                  `موظف ${idx + 1}`,

                nameEn:
                  item.nameEn ||
                  item.name ||
                  `Employee ${idx + 1}`,

                avatar:
                  item.avatar || '',

                email:
                  item.email ||
                  `user${idx}@company.com`,

                phone:
                  item.phone ||
                  '+20 100 000 0000',

                department:
                  item.department ||
                  'General',

                jobTitleAr:
                  item.jobTitleAr ||
                  'موظف',

                jobTitleEn:
                  item.jobTitleEn ||
                  'Employee',

                shiftId:
                  item.shiftId ||
                  'shift-1',

                pin:
                  item.pin ||
                  '1234',

                joinedDate:
                  item.joinedDate ||
                  getTodayString(),

                status:
                  item.status ||
                  'active',
              })
            );
          } else if (
            parsed &&
            parsed.employees &&
            Array.isArray(parsed.employees)
          ) {
            importedEmps = parsed.employees;
          }
        }

        /*
         * CSV / TXT / TSV
         */
        else {
          importedEmps = parseCSV(content);
        }

        /*
         * النتيجة
         */
        if (importedEmps.length === 0) {
          setErrorMsg(
            lang === 'ar'
              ? 'لم يتم العثور على موظفين في الملف المرفق. تأكد من تنسيق البيانات.'
              : 'No employees found in file. Please verify data format.'
          );
        } else {
          onImportEmployees(
            importedEmps,
            overwrite
          );

          setSuccessMsg(
            lang === 'ar'
              ? `تم استيراد ${importedEmps.length} موظف بنجاح!`
              : `Successfully imported ${importedEmps.length} employees!`
          );
        }
      } catch (err: any) {
        setErrorMsg(
          lang === 'ar'
            ? 'حدث خطأ أثناء قراءة الملف: ' +
                (err?.message || 'خطأ غير معروف')
            : 'Error reading file: ' +
                (err?.message || 'Unknown error')
        );
      } finally {
        setIsProcessing(false);

        // السماح باختيار نفس الملف مرة أخرى
        e.target.value = '';
      }
    };

    reader.onerror = () => {
      setErrorMsg(
        lang === 'ar'
          ? 'تعذر قراءة الملف.'
          : 'Unable to read the file.'
      );

      setIsProcessing(false);
    };

    reader.readAsText(file, 'UTF-8');
  };

  /*
   * ================================
   * RAW TEXT IMPORT
   * ================================
   */

  const handleParseRawText = () => {
    if (!rawText.trim()) {
      setErrorMsg(
        lang === 'ar'
          ? 'من فضلك أدخل بيانات الموظفين أولاً.'
          : 'Please enter employee data first.'
      );

      return;
    }

    setErrorMsg('');
    setSuccessMsg('');
    setIsProcessing(true);

    try {
      let importedEmps: Employee[] = [];

      const trimmed = rawText.trim();

      /*
       * JSON
       */
      if (
        trimmed.startsWith('{') ||
        trimmed.startsWith('[')
      ) {
        const parsed = JSON.parse(trimmed);

        if (Array.isArray(parsed)) {
          importedEmps = parsed.map(
            (item: any, idx: number) => ({
              id:
                item.id ||
                `emp-text-${Date.now()}-${idx}`,

              code:
                item.code ||
                String(100 + idx),

              nameAr:
                item.nameAr ||
                item.name ||
                `موظف ${idx + 1}`,

              nameEn:
                item.nameEn ||
                item.name ||
                `Employee ${idx + 1}`,

              avatar:
                item.avatar || '',

              email:
                item.email ||
                `user${idx}@company.com`,

              phone:
                item.phone ||
                '+20 100 000 0000',

              department:
                item.department ||
                'General',

              jobTitleAr:
                item.jobTitleAr ||
                'موظف',

              jobTitleEn:
                item.jobTitleEn ||
                'Employee',

              shiftId:
                item.shiftId ||
                'shift-1',

              pin:
                item.pin ||
                '1234',

              joinedDate:
                item.joinedDate ||
                getTodayString(),

              status:
                item.status ||
                'active',
            })
          );
        } else if (
          parsed &&
          parsed.employees &&
          Array.isArray(parsed.employees)
        ) {
          importedEmps = parsed.employees;
        }
      }

      /*
       * CSV / TSV / TXT
       */
      else {
        importedEmps = parseCSV(trimmed);
      }

      if (importedEmps.length === 0) {
        setErrorMsg(
          lang === 'ar'
            ? 'تعذر استخراج بيانات الموظفين من النص المنسوخ.'
            : 'Failed to extract employee data from text.'
        );
      } else {
        onImportEmployees(
          importedEmps,
          overwrite
        );

        setSuccessMsg(
          lang === 'ar'
            ? `تم استيراد ${importedEmps.length} موظف بنجاح!`
            : `Successfully imported ${importedEmps.length} employees!`
        );

        setRawText('');
      }
    } catch (err: any) {
      setErrorMsg(
        lang === 'ar'
          ? 'خطأ في تنسيق النص: ' +
              (err?.message || 'خطأ غير معروف')
          : 'Invalid format: ' +
              (err?.message || 'Unknown error')
      );
    } finally {
      setIsProcessing(false);
    }
  };

  /*
   * ================================
   * SAMPLE CSV
   * ================================
   */

  const downloadSampleCSV = () => {
    const csvContent = `كود الموظف,اسم الموظف بالعربي,English Name,القسم,المسمى الوظيفي,English Job,البريد الإلكتروني,رقم الهاتف,رمز PIN
101,محمد أحمد,Mohammed Ahmed,CX,موظف,Employee,mohammed@company.com,+201012345678,1234
102,سارة خالد,Sara Khaled,CX,موظف,Employee,sara@company.com,+201012345679,2345
103,عبدالله علي,Abdullah Ali,E-Commerce,موظف,Employee,abdullah@company.com,+201012345680,3456`;

    const blob = new Blob(
      ['\uFEFF' + csvContent],
      {
        type: 'text/csv;charset=utf-8;',
      }
    );

    const url =
      URL.createObjectURL(blob);

    const link =
      document.createElement('a');

    link.href = url;

    link.setAttribute(
      'download',
      'نموذج_استيراد_الموظفين.csv'
    );

    document.body.appendChild(link);

    link.click();

    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  };

  /*
   * ================================
   * MODAL
   * ================================
   */

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="
        fixed inset-0 z-50
        flex items-center justify-center
        p-4
        bg-slate-950/75
        backdrop-blur-md
        animate-fade-in
        overflow-y-auto
      "
    >
      <div
        className="
          bg-slate-900
          border border-slate-800
          rounded-2xl
          w-full max-w-2xl
          shadow-2xl
          overflow-hidden
          my-8
        "
      >

        {/* ================= HEADER ================= */}

        <div
          className="
            p-5
            border-b border-slate-800
            flex items-center justify-between
            bg-slate-900/50
          "
        >
          <div className="flex items-center gap-3">
            <div
              className="
                w-10 h-10
                rounded-xl
                bg-emerald-500/10
                border border-emerald-500/20
                text-emerald-400
                flex items-center justify-center
              "
            >
              <FileSpreadsheet className="w-5 h-5" />
            </div>

            <div>
              <h3 className="text-lg font-bold text-white">
                {lang === 'ar'
                  ? 'استيراد بيانات الموظفين'
                  : 'Import Employee Data'}
              </h3>

              <p className="text-xs text-slate-400">
                {lang === 'ar'
                  ? 'رفع ملف الموظفين أو لصق البيانات مباشرة'
                  : 'Upload employee files or paste data directly'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="
              w-8 h-8
              rounded-lg
              bg-slate-800
              text-slate-400
              hover:text-white
              flex items-center justify-center
              hover:bg-slate-700
              transition
            "
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ================= TABS ================= */}

        <div
          className="
            flex
            border-b border-slate-800
            bg-slate-950/40
            p-1
          "
        >
          <button
            onClick={() =>
              setActiveTab('employees')
            }
            className={`
              flex-1
              py-2.5
              px-4
              text-xs sm:text-sm
              font-medium
              rounded-lg
              transition
              flex items-center
              justify-center
              gap-2
              ${
                activeTab === 'employees'
                  ? 'bg-emerald-500 text-slate-950 font-bold shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }
            `}
          >
            <FileSpreadsheet className="w-4 h-4" />

            {lang === 'ar'
              ? 'رفع ملف الموظفين'
              : 'Upload Employees'}
          </button>

          <button
            onClick={() =>
              setActiveTab('raw_paste')
            }
            className={`
              flex-1
              py-2.5
              px-4
              text-xs sm:text-sm
              font-medium
              rounded-lg
              transition
              flex items-center
              justify-center
              gap-2
              ${
                activeTab === 'raw_paste'
                  ? 'bg-emerald-500 text-slate-950 font-bold shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }
            `}
          >
            <FileText className="w-4 h-4" />

            {lang === 'ar'
              ? 'لصق نص'
              : 'Paste Text'}
          </button>
        </div>

        {/* ================= BODY ================= */}

        <div className="p-6 space-y-6">

          {/* SUCCESS */}

          {successMsg && (
            <div
              className="
                p-4
                rounded-xl
                bg-emerald-500/10
                border border-emerald-500/30
                text-emerald-400
                flex items-center
                gap-3
                text-sm
                animate-fade-in
              "
            >
              <Check className="w-5 h-5 shrink-0" />

              <span>
                {successMsg}
              </span>
            </div>
          )}

          {/* ERROR */}

          {errorMsg && (
            <div
              className="
                p-4
                rounded-xl
                bg-rose-500/10
                border border-rose-500/30
                text-rose-400
                flex items-center
                gap-3
                text-sm
                animate-fade-in
              "
            >
              <AlertCircle className="w-5 h-5 shrink-0" />

              <span>
                {errorMsg}
              </span>
            </div>
          )}

          {/* ================= EMPLOYEE FILE TAB ================= */}

          {activeTab === 'employees' && (
            <div className="space-y-5">

              <div className="flex items-center justify-between gap-3">
                <label className="text-xs font-semibold text-slate-300">
                  {lang === 'ar'
                    ? 'اختيار ملف بيانات الموظفين'
                    : 'Select Employee Data File'}
                </label>

                <button
                  onClick={downloadSampleCSV}
                  className="
                    text-xs
                    text-emerald-400
                    hover:underline
                    flex items-center
                    gap-1.5
                  "
                >
                  <Download className="w-3.5 h-3.5" />

                  {lang === 'ar'
                    ? 'تحميل نموذج CSV'
                    : 'Download Sample CSV'}
                </button>
              </div>

              {/* OVERWRITE */}

              <label
                className="
                  flex items-center
                  gap-3
                  p-3
                  rounded-xl
                  bg-slate-950
                  border border-slate-800
                  cursor-pointer
                "
              >
                <input
                  type="checkbox"
                  checked={overwrite}
                  onChange={(e) =>
                    setOverwrite(e.target.checked)
                  }
                  className="
                    w-4 h-4
                    accent-emerald-500
                  "
                />

                <div>
                  <div className="text-sm font-semibold text-white">
                    {lang === 'ar'
                      ? 'استبدال البيانات الموجودة'
                      : 'Overwrite existing data'}
                  </div>

                  <div className="text-xs text-slate-500">
                    {lang === 'ar'
                      ? 'فعّل هذا الخيار إذا كنت تريد استبدال الموظفين الحاليين بالبيانات المستوردة.'
                      : 'Enable this to replace existing employees with imported data.'}
                  </div>
                </div>
              </label>

              {/* FILE DROP */}

              <div
                className="
                  border-2
                  border-dashed
                  border-slate-700
                  hover:border-emerald-500/50
                  rounded-2xl
                  p-10
                  text-center
                  bg-slate-800/20
                  transition
                  relative
                  group
                "
              >
                <input
                  type="file"
                  accept=".csv,.json,.txt,.tsv"
                  onChange={handleFileUpload}
                  disabled={isProcessing}
                  className="
                    absolute inset-0
                    w-full h-full
                    opacity-0
                    cursor-pointer
                    z-10
                  "
                />

                <div className="flex flex-col items-center gap-3 pointer-events-none">

                  <div
                    className="
                      w-14 h-14
                      rounded-2xl
                      bg-emerald-500/10
                      border border-emerald-500/20
                      text-emerald-400
                      flex items-center
                      justify-center
                    "
                  >
                    <Upload className="w-7 h-7" />
                  </div>

                  <div>
                    <p className="text-sm font-bold text-white">
                      {isProcessing
                        ? (
                          lang === 'ar'
                            ? 'جاري معالجة الملف...'
                            : 'Processing file...'
                        )
                        : (
                          lang === 'ar'
                            ? 'اضغط لاختيار ملف الموظفين'
                            : 'Click to select employee file'
                        )}
                    </p>

                    <p className="text-xs text-slate-500 mt-1">
                      CSV / TSV / TXT / JSON
                    </p>
                  </div>

                </div>
              </div>

              {/* FORMAT INFO */}

              <div
                className="
                  p-4
                  rounded-xl
                  bg-slate-950
                  border border-slate-800
                "
              >
                <p className="text-xs font-bold text-slate-300 mb-2">
                  {lang === 'ar'
                    ? 'ترتيب أعمدة CSV:'
                    : 'CSV column order:'}
                </p>

                <p className="text-[11px] text-slate-500 leading-6">
                  كود الموظف → الاسم بالعربي → الاسم بالإنجليزي
                  → القسم → المسمى الوظيفي → المسمى بالإنجليزي
                  → البريد → الهاتف → PIN
                </p>
              </div>

            </div>
          )}

          {/* ================= RAW TEXT TAB ================= */}

          {activeTab === 'raw_paste' && (
            <div className="space-y-5">

              <div>
                <label className="text-sm font-semibold text-slate-200">
                  {lang === 'ar'
                    ? 'الصق بيانات الموظفين هنا'
                    : 'Paste employee data here'}
                </label>

                <p className="text-xs text-slate-500 mt-1">
                  {lang === 'ar'
                    ? 'يمكنك لصق CSV أو TSV أو JSON.'
                    : 'You can paste CSV, TSV or JSON.'}
                </p>
              </div>

              {/* OVERWRITE */}

              <label
                className="
                  flex items-center
                  gap-3
                  p-3
                  rounded-xl
                  bg-slate-950
                  border border-slate-800
                  cursor-pointer
                "
              >
                <input
                  type="checkbox"
                  checked={overwrite}
                  onChange={(e) =>
                    setOverwrite(e.target.checked)
                  }
                  className="
                    w-4 h-4
                    accent-emerald-500
                  "
                />

                <div>
                  <div className="text-sm font-semibold text-white">
                    {lang === 'ar'
                      ? 'استبدال البيانات الموجودة'
                      : 'Overwrite existing data'}
                  </div>

                  <div className="text-xs text-slate-500">
                    {lang === 'ar'
                      ? 'استبدال الموظفين الحاليين بالبيانات الجديدة.'
                      : 'Replace existing employees with the new data.'}
                  </div>
                </div>
              </label>

              <textarea
                value={rawText}
                onChange={(e) =>
                  setRawText(e.target.value)
                }
                placeholder={
                  lang === 'ar'
                    ? `مثال:
101,أحمد محمد,Ahmed Mohamed,CX,موظف,Employee,ahmed@company.com,01000000000,1234
102,محمد علي,Mohamed Ali,IT,موظف,Employee,mohamed@company.com,01000000001,1235`
                    : `Example:
101,Ahmed Mohamed,Ahmed Mohamed,CX,Employee,Employee,ahmed@company.com,01000000000,1234`
                }
                className="
                  w-full
                  min-h-[260px]
                  p-4
                  rounded-xl
                  bg-slate-950
                  border border-slate-700
                  focus:border-emerald-500
                  focus:outline-none
                  text-sm
                  text-slate-200
                  placeholder:text-slate-600
                  resize-y
                  font-mono
                "
                dir="auto"
              />

              <button
                onClick={handleParseRawText}
                disabled={
                  isProcessing ||
                  !rawText.trim()
                }
                className="
                  w-full
                  py-3
                  rounded-xl
                  bg-emerald-500
                  hover:bg-emerald-400
                  disabled:bg-slate-700
                  disabled:text-slate-500
                  text-slate-950
                  font-bold
                  transition
                "
              >
                {isProcessing
                  ? (
                    lang === 'ar'
                      ? 'جاري الاستيراد...'
                      : 'Importing...'
                  )
                  : (
                    lang === 'ar'
                      ? 'استيراد الموظفين'
                      : 'Import Employees'
                  )}
              </button>

            </div>
          )}

        </div>

        {/* ================= FOOTER ================= */}

        <div
          className="
            p-4
            border-t border-slate-800
            bg-slate-950/60
            flex items-center
            justify-between
            gap-4
            text-xs
            text-slate-400
          "
        >
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-emerald-400" />

            <span>
              {lang === 'ar'
                ? `عدد الموظفين المعرفين حالياً: ${employeesCount}`
                : `Current defined employees: ${employeesCount}`}
            </span>
          </div>

          <button
            onClick={onClose}
            className="
              px-4 py-2
              rounded-lg
              bg-slate-800
              text-slate-300
              hover:text-white
              hover:bg-slate-700
              transition
            "
          >
            {lang === 'ar'
              ? 'إغلاق'
              : 'Close'}
          </button>
        </div>

      </div>
    </div>
  );
}
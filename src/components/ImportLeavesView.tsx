import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { 
  UploadCloud, 
  FileSpreadsheet, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  Download, 
  RefreshCw, 
  FileCheck, 
  ArrowRight,
  Database,
  Building2,
  Calendar,
  User,
  Info,
  ChevronRight,
  Sparkles
} from 'lucide-react';
import { Employee, LeaveRequest, LeaveType, Language } from '../types';
import { formatDate } from '../utils/helpers';

interface ImportLeavesViewProps {
  employees: Employee[];
  existingLeaves: LeaveRequest[];
  onImportSuccess: (newRecords: LeaveRequest[], summary: ImportSummary) => Promise<void>;
  currentUser: Employee | null;
  lang: Language;
  onDeleteFutureRecords?: () => void;
}

export interface ParsedRow {
  rowIndex: number;
  agentName: string;
  department: string;
  rawDate: string;
  formattedDate: string; // YYYY-MM-DD
  reason: string;
  excuseType: string;
  mappedType: LeaveType;
  matchedEmployee?: Employee;
  status: 'valid' | 'invalid_employee' | 'invalid_date' | 'duplicate';
  errorReason?: string;
}

export interface ImportSummary {
  totalRows: number;
  importedCount: number;
  updatedCount: number;
  skippedCount: number;
  failedCount: number;
}

// Arabic normalization helper for employee name matching
function normalizeArabicText(text: string): string {
  if (!text) return '';
  return text
    .trim()
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[\u064B-\u0652]/g, '') // Remove diacritics
    .replace(/\s+/g, ' ');
}

// Extract and normalize first two names from an employee or agent name
function getNormalizedFirstTwoNames(text: string): string {
  if (!text) return '';
  const normalized = normalizeArabicText(text);
  const parts = normalized.split(/\s+/).filter(Boolean);
  if (parts.length <= 2) return parts.join(' ');
  return `${parts[0]} ${parts[1]}`;
}

// Map Arabic / English excuse strings to LeaveType
function mapExcuseTypeToLeaveType(rawType: string): LeaveType {
  const norm = normalizeArabicText(rawType);
  if (norm.includes('اذن') || norm.includes('ساعه') || norm.includes('ساعتين') || norm.includes('permission')) {
    return 'permission';
  }
  if (norm.includes('سنوي') || norm.includes('annual')) {
    return 'annual';
  }
  if (norm.includes('عارض') || norm.includes('casual')) {
    return 'casual';
  }
  if (norm.includes('اعتياد') || norm.includes('regular')) {
    return 'regular';
  }
  if (norm.includes('مرض') || norm.includes('sick')) {
    return 'sick';
  }
  if (norm.includes('وضع') || norm.includes('maternity')) {
    return 'maternity';
  }
  if (norm.includes('ابوه') || norm.includes('paternity')) {
    return 'paternity';
  }
  if (norm.includes('دراس') || norm.includes('امتحان') || norm.includes('study')) {
    return 'study';
  }
  if (norm.includes('حج') || norm.includes('عمره') || norm.includes('hajj')) {
    return 'hajj';
  }
  if (norm.includes('طارئ') || norm.includes('emergency')) {
    return 'emergency';
  }
  return 'permission'; // Default fallback
}

// Parse Excel serial dates or standard text dates
function parseExcelDate(val: any): string {
  if (!val) return '';
  
  if (typeof val === 'number') {
    // Excel serial number date
    const dateObj = XLSX.SSF.parse_date_code(val);
    if (dateObj) {
      const y = dateObj.y;
      const m = String(dateObj.m).padStart(2, '0');
      const d = String(dateObj.d).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  }

  const str = String(val).trim();
  if (!str) return '';

  // Check if YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }

  // Check DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmyMatch) {
    const d = String(dmyMatch[1]).padStart(2, '0');
    const m = String(dmyMatch[2]).padStart(2, '0');
    const y = dmyMatch[3];
    return `${y}-${m}-${d}`;
  }

  // Fallback JavaScript date parse
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return '';
}

export const ImportLeavesView: React.FC<ImportLeavesViewProps> = ({
  employees,
  existingLeaves,
  onImportSuccess,
  currentUser,
  lang,
  onDeleteFutureRecords,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [stage, setStage] = useState<'upload' | 'preview' | 'summary'>('upload');
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [failedRows, setFailedRows] = useState<ParsedRow[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Unified Sub-Tab State
  const [activeSubTab, setActiveSubTab] = useState<'leaves_import' | 'backup'>('leaves_import');
  const [backupSuccess, setBackupSuccess] = useState('');
  const [backupError, setBackupError] = useState('');
  const [isProcessingBackup, setIsProcessingBackup] = useState(false);

  const handleDownloadBackup = async () => {
    try {
      setIsProcessingBackup(true);
      setBackupError('');
      setBackupSuccess('');
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
      setBackupSuccess(lang === 'ar' ? 'تم تحضير وتحميل النسخة الاحتياطية بنجاح!' : 'Backup file downloaded successfully!');
    } catch (err: any) {
      setBackupError(err.message || 'Error downloading backup');
    } finally {
      setIsProcessingBackup(false);
    }
  };

  const handleRestoreBackupFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsProcessingBackup(true);
    setBackupError('');
    setBackupSuccess('');

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
          setBackupSuccess(lang === 'ar' ? 'تم استعادة النسخة الاحتياطية بنجاح! جاري تحديث الشاشة...' : 'Database restored successfully! Reloading...');
          setTimeout(() => {
            window.location.reload();
          }, 1500);
        } else {
          setBackupError(data.error || 'فشلت عملية الاستعادة');
        }
      } catch (err: any) {
        setBackupError(err.message || 'Error parsing backup file');
      } finally {
        setIsProcessingBackup(false);
      }
    };
    reader.readAsText(file);
  };

  // Column matching keys (supports exact & common variations)
  const findColumnValue = (row: Record<string, any>, targetKeys: string[]): string => {
    const keys = Object.keys(row);
    for (const targetKey of targetKeys) {
      const targetNorm = normalizeArabicText(targetKey);
      for (const k of keys) {
        if (normalizeArabicText(k) === targetNorm) {
          return row[k] !== undefined && row[k] !== null ? String(row[k]).trim() : '';
        }
      }
    }
    // Partial search fallback
    for (const targetKey of targetKeys) {
      const targetNorm = normalizeArabicText(targetKey);
      for (const k of keys) {
        if (normalizeArabicText(k).includes(targetNorm)) {
          return row[k] !== undefined && row[k] !== null ? String(row[k]).trim() : '';
        }
      }
    }
    return '';
  };

  const handleFileSelect = (selectedFile: File) => {
    if (!selectedFile) return;
    setFile(selectedFile);
    setIsParsing(true);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rawJson: Record<string, any>[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

        if (!rawJson || rawJson.length === 0) {
          alert(lang === 'ar' ? 'الملف المرفق فارغ أو لا يحتوي على بيانات صالحة' : 'File is empty or contains no valid rows');
          setIsParsing(false);
          return;
        }

        // Process rows and validate against employees & duplicates
        const processed: ParsedRow[] = rawJson.map((row, idx) => {
          const agentName = findColumnValue(row, ['Agent Name', 'اسم الموظف', 'اسم الوكيل', 'الموظف', 'الاسم', 'Agent']);
          const department = findColumnValue(row, ['Department', 'القسم', 'الإدارة', 'Dept']);
          const rawDate = findColumnValue(row, ['Date', 'التاريخ', 'تاريخ الإجازة', 'تاريخ الإذن', 'تاريخ الطلب']);
          const reason = findColumnValue(row, ['Reason', 'السبب', 'سبب الإجازة', 'السبب / الملاحظات', 'ملاحظات', 'Notes']);
          const excuseType = findColumnValue(row, ['Excuse Type', 'نوع الإجازة', 'نوع الإذن', 'نوع الخروج', 'النوع', 'Type']);

          const formattedDate = parseExcelDate(rawDate);

          // Find matching employee by name (matching full name or first two names)
          const normAgentName = normalizeArabicText(agentName);
          const agentFirstTwo = getNormalizedFirstTwoNames(agentName);

          let matchedEmp = employees.find(emp => {
            const empNameAr = normalizeArabicText(emp.nameAr);
            const empNameEn = normalizeArabicText(emp.nameEn);
            const empArFirstTwo = getNormalizedFirstTwoNames(emp.nameAr);
            const empEnFirstTwo = getNormalizedFirstTwoNames(emp.nameEn);

            return (
              empNameAr === normAgentName || 
              empNameEn === normAgentName ||
              (empArFirstTwo && agentFirstTwo && empArFirstTwo === agentFirstTwo) ||
              (empEnFirstTwo && agentFirstTwo && empEnFirstTwo === agentFirstTwo) ||
              (empNameAr && normAgentName && empNameAr.includes(normAgentName)) ||
              (normAgentName && empNameAr && normAgentName.includes(empNameAr))
            );
          });

          // Determine status & error reason
          let status: ParsedRow['status'] = 'valid';
          let errorReason: string | undefined = undefined;

          if (!agentName) {
            status = 'invalid_employee';
            errorReason = lang === 'ar' ? 'اسم الموظف مفقود بالصف' : 'Missing employee name';
          } else if (!matchedEmp) {
            status = 'invalid_employee';
            errorReason = lang === 'ar' ? `الموظف "${agentName}" غير مسجل بالمنظومة` : `Employee "${agentName}" not found`;
          } else if (!formattedDate) {
            status = 'invalid_date';
            errorReason = lang === 'ar' ? `صيغة التاريخ غير صحيحة (${rawDate})` : `Invalid date format (${rawDate})`;
          } else {
            // Check for duplicates: same employeeId, date, and excuseType
            const mappedType = mapExcuseTypeToLeaveType(excuseType);
            const isDuplicate = existingLeaves.some(l => 
              l.employeeId === matchedEmp?.id &&
              l.startDate === formattedDate &&
              (l.type === mappedType || mapExcuseTypeToLeaveType(l.type) === mappedType)
            );

            if (isDuplicate) {
              status = 'duplicate';
              errorReason = lang === 'ar' ? 'سجل إجازة/إذن مكرر لنفس الموظف والتاريخ والنوع' : 'Duplicate leave/excuse record exists for date & type';
            }
          }

          return {
            rowIndex: idx + 2, // Excel 1-indexed row header
            agentName: agentName || (lang === 'ar' ? 'غير محدد' : 'N/A'),
            department: department || matchedEmp?.department || (lang === 'ar' ? 'عام' : 'General'),
            rawDate,
            formattedDate,
            reason: reason || (lang === 'ar' ? 'استيراد جماعي للإجازات والأذونات' : 'Bulk imported leave/excuse'),
            excuseType: excuseType || (lang === 'ar' ? 'إذن خروج' : 'Permission'),
            mappedType: mapExcuseTypeToLeaveType(excuseType),
            matchedEmployee: matchedEmp,
            status,
            errorReason
          };
        });

        setParsedRows(processed);
        setStage('preview');
      } catch (err) {
        console.error('Error parsing file:', err);
        alert(lang === 'ar' ? 'حدث خطأ أثناء قراءة ملف Excel/CSV' : 'Error parsing Excel/CSV file');
      } finally {
        setIsParsing(false);
      }
    };
    reader.readAsArrayBuffer(selectedFile);
  };

  const handleConfirmImport = async () => {
    setIsImporting(true);

    const validRows = parsedRows.filter(r => r.status === 'valid');
    const duplicateRows = parsedRows.filter(r => r.status === 'duplicate');
    const failed = parsedRows.filter(r => r.status === 'invalid_employee' || r.status === 'invalid_date');

    const createdBy = currentUser?.nameAr || currentUser?.nameEn || 'تيم ليدر';
    const createdAt = new Date().toISOString();

    // Map valid rows into LeaveRequest objects
    const newLeaveRecords: LeaveRequest[] = validRows.map((row, idx) => ({
      id: `imported-leave-${row.matchedEmployee!.id}-${row.formattedDate}-${Date.now()}-${idx}`,
      employeeId: row.matchedEmployee!.id,
      type: row.mappedType,
      startDate: row.formattedDate,
      endDate: row.formattedDate,
      reason: `${row.reason} [تم الاستيراد بواسطة: ${createdBy}]`,
      status: 'approved', // Bulk imported leaves are pre-approved
      createdAt,
      reviewedBy: createdBy,
      reviewNotes: `استيراد من ملف Excel (${row.excuseType})`
    }));

    const summaryData: ImportSummary = {
      totalRows: parsedRows.length,
      importedCount: validRows.length,
      updatedCount: 0,
      skippedCount: duplicateRows.length,
      failedCount: failed.length
    };

    setSummary(summaryData);
    setFailedRows([...failed, ...duplicateRows]);

    try {
      await onImportSuccess(newLeaveRecords, summaryData);
      setStage('summary');
    } catch (err) {
      console.error('Error executing import batch:', err);
      alert(lang === 'ar' ? 'حدث خطأ أثناء حفظ السجلات' : 'Error saving imported records');
    } finally {
      setIsImporting(false);
    }
  };

  const handleExportFailedRowsExcel = () => {
    if (failedRows.length === 0) return;

    const dataToExport = failedRows.map(row => ({
      'رقم الصف / Row': row.rowIndex,
      'Agent Name': row.agentName,
      'Department': row.department,
      'Date': row.rawDate || row.formattedDate,
      'Reason': row.reason,
      'Excuse Type': row.excuseType,
      'سبب الفشل / Failure Reason': row.errorReason || 'مكرر أو خطأ بالبيانات'
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Failed_Rows');

    const fileName = `Failed_Leaves_Report_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  const handleReset = () => {
    setFile(null);
    setParsedRows([]);
    setSummary(null);
    setFailedRows([]);
    setStage('upload');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const previewList = parsedRows.slice(0, 20);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6 animate-fade-in dir-rtl">
      {/* Header Title Section */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-white shadow-xl relative overflow-hidden space-y-4">
        <div className="absolute top-0 left-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none -translate-x-1/2 -translate-y-1/2" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-emerald-400 text-xs font-mono font-bold tracking-wider uppercase">
              <Sparkles className="w-4 h-4" />
              <span>{lang === 'ar' ? 'وحدة البيانات والنسخ الاحتياطي' : 'Data & Backup Engine'}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center gap-3">
              <Database className="w-8 h-8 text-emerald-400" />
              <span>{lang === 'ar' ? 'النسخة الاحتياطية واستيراد البيانات' : 'Database Backup & Data Import'}</span>
            </h1>
            <p className="text-slate-400 text-xs sm:text-sm max-w-2xl">
              {lang === 'ar' 
                ? 'إدارة شاملة لاستيراد طلبات الإجازات والأذونات من ملفات Excel، وحفظ/استعادة النسخ الاحتياطية لقاعدة البيانات.' 
                : 'Comprehensive management to import leave requests from Excel files and export/restore database backups.'}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs px-3 py-1.5 rounded-xl font-mono font-bold flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5" />
              <span>{lang === 'ar' ? 'حفظ تلقائي مباشر' : 'Live Sync Enabled'}</span>
            </span>
          </div>
        </div>

        {/* Sub-Tab Navigation Bar */}
        <div className="relative z-10 flex border-t border-slate-800 pt-4 gap-2">
          <button
            onClick={() => setActiveSubTab('leaves_import')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all ${
              activeSubTab === 'leaves_import'
                ? 'bg-emerald-500 text-slate-950 shadow-md'
                : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>{lang === 'ar' ? 'استيراد الإجازات والأذونات (Excel)' : 'Import Leaves (Excel)'}</span>
          </button>

          <button
            onClick={() => setActiveSubTab('backup')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all ${
              activeSubTab === 'backup'
                ? 'bg-emerald-500 text-slate-950 shadow-md'
                : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Database className="w-4 h-4" />
            <span>{lang === 'ar' ? 'النسخة الاحتياطية والأمان (JSON)' : 'Database Backup (JSON)'}</span>
          </button>
        </div>
      </div>

      {/* SECTION: DATABASE BACKUP & RESTORE */}
      {activeSubTab === 'backup' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 space-y-6 shadow-xl animate-fade-in">
          {backupSuccess && (
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center gap-3 text-sm animate-fade-in">
              <CheckCircle2 className="w-5 h-5 shrink-0" />
              <span>{backupSuccess}</span>
            </div>
          )}

          {backupError && (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-center gap-3 text-sm animate-fade-in">
              <XCircle className="w-5 h-5 shrink-0" />
              <span>{backupError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Card 1: Download Backup */}
            <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-6 space-y-4 hover:border-emerald-500/50 transition">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
                <Download className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-white">
                  {lang === 'ar' ? 'تصدير وتحميل النسخة الاحتياطية' : 'Download Complete Backup'}
                </h3>
                <p className="text-xs text-slate-400">
                  {lang === 'ar'
                    ? 'حفظ جميع سجلات الحضور، الموظفين، والإجازات في ملف JSON آمن للاحتفاظ به على جهازك.'
                    : 'Download a complete JSON snapshot of all system attendance, employee records, and leaves.'}
                </p>
              </div>
              <button
                onClick={handleDownloadBackup}
                disabled={isProcessingBackup}
                className="w-full py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold transition flex items-center justify-center gap-2 text-sm shadow-md disabled:opacity-50 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>{lang === 'ar' ? 'تحميل النسخة الاحتياطية الآن (JSON)' : 'Download Backup File Now (JSON)'}</span>
              </button>
            </div>

            {/* Card 2: Restore Backup */}
            <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-6 space-y-4 hover:border-sky-500/50 transition">
              <div className="w-12 h-12 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center justify-center">
                <Database className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-white">
                  {lang === 'ar' ? 'استعادة قاعدة البيانات من ملف' : 'Restore Database from File'}
                </h3>
                <p className="text-xs text-slate-400">
                  {lang === 'ar'
                    ? 'حدد ملف النسخة الاحتياطية (server_data_backup_*.json) للاستعادة الآمنة.'
                    : 'Select a backup file (server_data_backup_*.json) for safe database restoration.'}
                </p>
              </div>
              <label className="w-full py-3 px-4 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold transition flex items-center justify-center gap-2 text-sm shadow-md cursor-pointer text-center">
                <Database className="w-4 h-4" />
                <span>{lang === 'ar' ? 'اختر ملف النسخة الاحتياطية للاستعادة' : 'Select Backup File to Restore'}</span>
                <input
                  type="file"
                  accept=".json"
                  onChange={handleRestoreBackupFile}
                  disabled={isProcessingBackup}
                  className="hidden"
                />
              </label>
            </div>

            {/* Card 3: Delete Future Attendance Records */}
            {onDeleteFutureRecords && (
              <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-6 space-y-4 hover:border-amber-500/50 transition md:col-span-2">
                <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <span>{lang === 'ar' ? 'تنظيف السجلات المستقبلية (مسح الأخطاء)' : 'Clean Future Attendance Records'}</span>
                    <span className="text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full border border-amber-500/30">
                      {lang === 'ar' ? 'خاص بالليدر' : 'Admin Only'}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    {lang === 'ar'
                      ? 'حذف جميع سجلات الحضور التي تم إنشاؤها بتواريخ مستقبلية (بعد تاريخ اليوم) دون المساس بأي من سجلات اليوم أو السجلات التاريخية أو بيانات الموظفين والإجازات.'
                      : 'Delete attendance records accidentally created for future dates after today, preserving all historical records and settings.'}
                  </p>
                </div>
                <button
                  onClick={onDeleteFutureRecords}
                  className="py-3 px-6 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold transition flex items-center justify-center gap-2 text-sm shadow-md cursor-pointer"
                >
                  <AlertTriangle className="w-4 h-4" />
                  <span>{lang === 'ar' ? 'حذف سجلات الحضور المستقبلية' : 'Delete Future Attendance Records'}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SECTION: EXCEL LEAVES IMPORT */}
      {activeSubTab === 'leaves_import' && (
        <>

      {/* STEP 1: FILE UPLOAD ZONE */}
      {stage === 'upload' && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-8 shadow-xl text-center space-y-6">
          <div 
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-slate-700 hover:border-emerald-500/80 bg-slate-950/60 hover:bg-slate-900/80 transition-all rounded-2xl p-10 cursor-pointer flex flex-col items-center justify-center gap-4 group"
          >
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
              accept=".xlsx, .xls, .csv" 
              className="hidden" 
            />
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform">
              <UploadCloud className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-bold text-white">
                {lang === 'ar' ? 'اسحب ملف Excel أو CSV هنا أو انقر للاختيار' : 'Drag & drop Excel or CSV file here, or click to browse'}
              </h3>
              <p className="text-xs text-slate-400">
                {lang === 'ar' ? 'يدعم صيغ .XLSX, .XLS, .CSV بحجم يصل إلى 20MB' : 'Supports .XLSX, .XLS, .CSV files up to 20MB'}
              </p>
            </div>
          </div>

          {/* Column Guidelines Box */}
          <div className="bg-slate-800/50 border border-slate-700/60 rounded-xl p-5 text-right space-y-3">
            <div className="flex items-center gap-2 text-amber-400 font-bold text-xs">
              <Info className="w-4 h-4" />
              <span>{lang === 'ar' ? 'الأعمدة المطلوبة في الملف:' : 'Required Sheet Columns:'}</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
              <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-700 text-center font-mono text-emerald-300 font-bold">
                1. Agent Name
              </div>
              <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-700 text-center font-mono text-slate-300 font-bold">
                2. Department
              </div>
              <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-700 text-center font-mono text-amber-300 font-bold">
                3. Date
              </div>
              <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-700 text-center font-mono text-sky-300 font-bold">
                4. Reason
              </div>
              <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-700 text-center font-mono text-purple-300 font-bold">
                5. Excuse Type
              </div>
            </div>
          </div>
        </div>
      )}

      {/* STEP 2: PREVIEW (FIRST 20 ROWS) & CONFIRMATION */}
      {stage === 'preview' && (
        <div className="space-y-6">
          {/* Quick Metrics Header */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl text-right">
              <span className="text-slate-400 text-xs block">{lang === 'ar' ? 'إجمالي الصفوف' : 'Total Rows'}</span>
              <span className="text-2xl font-black text-white font-mono">{parsedRows.length}</span>
            </div>
            <div className="bg-emerald-950/40 border border-emerald-800/60 p-4 rounded-xl text-right">
              <span className="text-emerald-400 text-xs block">{lang === 'ar' ? 'جاهز للاستيراد' : 'Valid Rows'}</span>
              <span className="text-2xl font-black text-emerald-400 font-mono">
                {parsedRows.filter(r => r.status === 'valid').length}
              </span>
            </div>
            <div className="bg-amber-950/40 border border-amber-800/60 p-4 rounded-xl text-right">
              <span className="text-amber-400 text-xs block">{lang === 'ar' ? 'سجلات مكررة (ستتجاوز)' : 'Duplicates (Skipped)'}</span>
              <span className="text-2xl font-black text-amber-400 font-mono">
                {parsedRows.filter(r => r.status === 'duplicate').length}
              </span>
            </div>
            <div className="bg-rose-950/40 border border-rose-800/60 p-4 rounded-xl text-right">
              <span className="text-rose-400 text-xs block">{lang === 'ar' ? 'صفوف بها أخطاء' : 'Errors / Failed'}</span>
              <span className="text-2xl font-black text-rose-400 font-mono">
                {parsedRows.filter(r => r.status === 'invalid_employee' || r.status === 'invalid_date').length}
              </span>
            </div>
          </div>

          {/* Preview Table Notice */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <FileCheck className="w-5 h-5 text-emerald-400" />
                  <span>{lang === 'ar' ? 'معاينة أول 20 صف من الملف' : 'Preview First 20 Rows'}</span>
                </h3>
                <p className="text-xs text-slate-400">
                  {lang === 'ar' 
                    ? 'يرجى مراجعة البيانات ومطابقة اسم الموظف والتاريخ قبل البدء في عملية الحفظ' 
                    : 'Please review row matching and validation status before confirming import.'}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleReset}
                  disabled={isImporting}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl transition"
                >
                  {lang === 'ar' ? 'إلغاء واختيار ملف آخر' : 'Cancel & Re-upload'}
                </button>
                <button
                  onClick={handleConfirmImport}
                  disabled={isImporting || parsedRows.filter(r => r.status === 'valid').length === 0}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-black text-xs rounded-xl shadow-lg shadow-emerald-950/50 flex items-center gap-2 transition disabled:opacity-50"
                >
                  {isImporting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>{lang === 'ar' ? 'جاري الاستيراد والدفع...' : 'Importing & Syncing...'}</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>{lang === 'ar' ? 'تأكيد واستيراد السجلات الصالحة' : 'Confirm & Import Valid Rows'}</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto rounded-xl border border-slate-800">
              <table className="w-full text-right text-xs text-slate-300">
                <thead className="bg-slate-950 text-slate-400 font-bold border-b border-slate-800">
                  <tr>
                    <th className="p-3">#</th>
                    <th className="p-3">Agent Name (الموظف)</th>
                    <th className="p-3">Department (القسم)</th>
                    <th className="p-3">Date (التاريخ)</th>
                    <th className="p-3">Excuse Type (النوع)</th>
                    <th className="p-3">Reason (السبب)</th>
                    <th className="p-3 text-center">حالة المطابقة والصف</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 bg-slate-900/60">
                  {previewList.map((row) => (
                    <tr key={row.rowIndex} className="hover:bg-slate-800/40">
                      <td className="p-3 font-mono text-slate-500">{row.rowIndex}</td>
                      <td className="p-3 font-bold text-white">
                        <div>{row.agentName}</div>
                        {row.matchedEmployee && (
                          <div className="text-[10px] text-emerald-400 font-mono">
                            ✓ تم الربط بـ: {row.matchedEmployee.nameAr} ({row.matchedEmployee.code})
                          </div>
                        )}
                      </td>
                      <td className="p-3 text-slate-400">{row.department}</td>
                      <td className="p-3 font-mono text-amber-300">{row.formattedDate || row.rawDate}</td>
                      <td className="p-3">
                        <span className="bg-purple-950/80 text-purple-300 border border-purple-800/50 px-2.5 py-1 rounded-md text-[11px] font-bold">
                          {row.excuseType}
                        </span>
                      </td>
                      <td className="p-3 text-slate-300 max-w-xs truncate" title={row.reason}>
                        {row.reason}
                      </td>
                      <td className="p-3 text-center">
                        {row.status === 'valid' && (
                          <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2.5 py-1 rounded-full text-[11px] font-bold inline-flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>جاهز</span>
                          </span>
                        )}
                        {row.status === 'duplicate' && (
                          <span className="bg-amber-500/10 text-amber-400 border border-amber-500/30 px-2.5 py-1 rounded-full text-[11px] font-bold inline-flex items-center gap-1">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            <span>مكرر (بيتجاوز)</span>
                          </span>
                        )}
                        {(row.status === 'invalid_employee' || row.status === 'invalid_date') && (
                          <span className="bg-rose-500/10 text-rose-400 border border-rose-500/30 px-2.5 py-1 rounded-full text-[11px] font-bold inline-flex items-center gap-1" title={row.errorReason}>
                            <XCircle className="w-3.5 h-3.5" />
                            <span>{row.errorReason}</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {parsedRows.length > 20 && (
              <p className="text-center text-xs text-slate-500 font-mono py-2">
                ... وعرض {parsedRows.length - 20} صف إضافي سيتم معالجتها عند التأكيد.
              </p>
            )}
          </div>
        </div>
      )}

      {/* STEP 3: IMPORT SUMMARY DASHBOARD & REPORT EXPORT */}
      {stage === 'summary' && summary && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
          <div className="flex items-center gap-3 text-emerald-400 border-b border-slate-800 pb-4">
            <CheckCircle2 className="w-7 h-7" />
            <div>
              <h2 className="text-xl font-black text-white">
                {lang === 'ar' ? 'ملخص عملية الاستيراد' : 'Import Execution Summary'}
              </h2>
              <p className="text-xs text-slate-400">
                {lang === 'ar' ? 'تمت معالجة الملف وتحديث قاعدة البيانات بنجاح' : 'File processed and database synced successfully.'}
              </p>
            </div>
          </div>

          {/* 5 Cards Dashboard Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-center">
              <span className="text-slate-400 text-xs block">{lang === 'ar' ? 'إجمالي الصفوف' : 'Total Rows'}</span>
              <span className="text-2xl font-black text-white font-mono">{summary.totalRows}</span>
            </div>

            <div className="bg-emerald-950/50 p-4 rounded-xl border border-emerald-800 text-center">
              <span className="text-emerald-400 text-xs block">{lang === 'ar' ? 'تم الاستيراد' : 'Imported'}</span>
              <span className="text-2xl font-black text-emerald-400 font-mono">{summary.importedCount}</span>
            </div>

            <div className="bg-blue-950/50 p-4 rounded-xl border border-blue-800 text-center">
              <span className="text-blue-400 text-xs block">{lang === 'ar' ? 'تم التحديث' : 'Updated'}</span>
              <span className="text-2xl font-black text-blue-400 font-mono">{summary.updatedCount}</span>
            </div>

            <div className="bg-amber-950/50 p-4 rounded-xl border border-amber-800 text-center">
              <span className="text-amber-400 text-xs block">{lang === 'ar' ? 'تم التجاوز (مكرر)' : 'Skipped'}</span>
              <span className="text-2xl font-black text-amber-400 font-mono">{summary.skippedCount}</span>
            </div>

            <div className="bg-rose-950/50 p-4 rounded-xl border border-rose-800 text-center">
              <span className="text-rose-400 text-xs block">{lang === 'ar' ? 'الصفوف الفاشلة' : 'Failed'}</span>
              <span className="text-2xl font-black text-rose-400 font-mono">{summary.failedCount}</span>
            </div>
          </div>

          {/* Actions & Excel Failure Report Download */}
          <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-950/80 p-5 rounded-xl border border-slate-800">
            <div>
              {failedRows.length > 0 ? (
                <div className="text-xs text-rose-300 font-semibold">
                  ⚠️ يوجد {failedRows.length} صف تعذر استيرادها أو تم تجاوزها. يمكنك تحميل تقرير الأخطاء الآن.
                </div>
              ) : (
                <div className="text-xs text-emerald-400 font-semibold">
                  ✓ تم استيراد جميع الصفوف المرفقة بالكامل دون أي أخطاء!
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              {failedRows.length > 0 && (
                <button
                  onClick={handleExportFailedRowsExcel}
                  className="px-4 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl shadow-lg flex items-center gap-2 transition"
                >
                  <Download className="w-4 h-4" />
                  <span>{lang === 'ar' ? 'تحميل تقرير الأخطاء (Excel)' : 'Download Failure Excel'}</span>
                </button>
              )}

              <button
                onClick={handleReset}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-black text-xs rounded-xl shadow-lg flex items-center gap-2 transition"
              >
                <RefreshCw className="w-4 h-4" />
                <span>{lang === 'ar' ? 'استيراد ملف جديد' : 'Import New File'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
};

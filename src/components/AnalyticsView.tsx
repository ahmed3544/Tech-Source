import React, { useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  CartesianGrid,
  Legend
} from 'recharts';

import {
  BarChart3,
  Search,
  UserCheck,
  UserX,
  Clock,
  Palmtree,
  FileSpreadsheet,
  Calendar,
  Zap,
  Activity,
  Award
} from 'lucide-react';

import {
  AttendanceRecord,
  Employee,
  LeaveRequest,
  Language
} from '../types';

import {
  formatHoursToHHMM,
  formatTime,
  exportToCSV,
  getStatusText,
  toWesternDigits,
  calculateWorkDaysInPeriod,
  isWeekend
} from '../utils/helpers';

interface AnalyticsViewProps {
  records: AttendanceRecord[];
  employees: Employee[];
  leaveRequests?: LeaveRequest[];
  lang: Language;
  globalSearchTerm?: string;
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({
  records,
  employees,
  leaveRequests = [],
  lang,
  globalSearchTerm
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDept, setSelectedDept] = useState('all');

  const [selectedEmpId, setSelectedEmpId] = useState<string>(
    employees[0]?.id || ''
  );

  const [reportPeriod, setReportPeriod] = useState<
    'daily' | 'weekly' | 'monthly'
  >('monthly');

  const [selectedMonth, setSelectedMonth] =
    useState<string>('2026-08');

  React.useEffect(() => {
    if (globalSearchTerm) {
      setSearchQuery(globalSearchTerm);
    }
  }, [globalSearchTerm]);

  // =========================================================
  // TEAM MONTHLY REPORT
  // =========================================================

  const teamMonthlyData = employees.map(emp => {
    const empMonthRecords = records.filter(r => {
      if (r.employeeId !== emp.id) return false;

      if (selectedMonth === 'all') {
        return true;
      }

      return r.date.startsWith(selectedMonth);
    });

    const weekendDays = empMonthRecords.filter(
      r =>
        r.status === 'weekend' ||
        (isWeekend(r.date) && !r.checkIn)
    ).length;

    const presentDays = empMonthRecords.filter(
      r =>
        r.checkIn &&
        r.status !== 'on_leave' &&
        r.status !== 'absent' &&
        r.status !== 'weekend' &&
        !isWeekend(r.date)
    ).length;

    const absentDays = empMonthRecords.filter(
      r =>
        r.status === 'absent' &&
        !isWeekend(r.date)
    ).length;

    const lateDays = empMonthRecords.filter(
      r =>
        (
          r.status === 'late' ||
          (r.lateMinutes && r.lateMinutes > 0)
        ) &&
        !isWeekend(r.date)
    ).length;

    const leaveDays = empMonthRecords.filter(
      r =>
        r.status === 'on_leave' &&
        !isWeekend(r.date)
    ).length;

    const lateMins = empMonthRecords.reduce(
      (acc, r) =>
        acc +
        (!isWeekend(r.date)
          ? r.lateMinutes || 0
          : 0),
      0
    );

    const workedHours = empMonthRecords.reduce(
      (acc, r) =>
        acc +
        (
          !isWeekend(r.date) || r.checkIn
            ? r.workHours || 0
            : 0
        ),
      0
    );

    const overtimeHoursTotal =
      empMonthRecords.reduce(
        (acc, r) =>
          acc + (r.overtimeHours || 0),
        0
      );

    const minusHoursTotal =
      empMonthRecords.reduce(
        (acc, r) =>
          acc + ((r as any).minusHours || 0),
        0
      );

    return {
      emp,
      overtimeHoursTotal,
      minusHoursTotal,
      presentDays,
      absentDays,
      lateDays,
      leaveDays,
      weekendDays,
      lateMins,
      workedHours
    };
  });

  // =========================================================
  // EXPORT TEAM REPORT
  // =========================================================

  const handleExportTeamMonthlyReport = () => {
    const monthLabel =
      selectedMonth === '2026-07'
        ? 'July_2026'
        : selectedMonth === '2026-06'
        ? 'June_2026'
        : selectedMonth === '2026-05'
        ? 'May_2026'
        : selectedMonth;

    const exportData = teamMonthlyData.map(item => ({
      'كود الموظف': item.emp.code,
      'الاسم بالعربي': item.emp.nameAr,
      'الاسم بالإنجليزية': item.emp.nameEn,
      'القسم': item.emp.department,

      'الدور':
        item.emp.role === 'leader'
          ? 'تيم ليدر'
          : 'موظف',

      'أيام الحضور':
        item.presentDays,

      'أيام الغياب':
        item.absentDays,

      'أيام العطلات الأسبوعية':
        item.weekendDays,

      'أيام التأخير':
        item.lateDays,

      'دقائق التأخير الإجمالية':
        item.lateMins,

      'أيام الإجازات':
        item.leaveDays,

      'ساعات العمل الإجمالية':
        formatHoursToHHMM(
          item.workedHours
        ),

      'ساعات العمل الإضافي':
        formatHoursToHHMM(
          item.overtimeHoursTotal
        ),

      'ساعات النقص':
        formatHoursToHHMM(
          item.minusHoursTotal
        )
    }));

    exportToCSV(
      exportData,
      `Team_Leader_Report_${monthLabel}`
    );
  };

  // =========================================================
  // EMPLOYEE SEARCH
  // =========================================================

  const filteredEmployees = employees.filter(emp => {
    const query =
      searchQuery.toLowerCase().trim();

    const matchesQuery =
      !query ||
      emp.nameAr.includes(searchQuery) ||
      emp.nameEn
        .toLowerCase()
        .includes(query) ||
      emp.code
        .toLowerCase()
        .includes(query);

    const matchesDept =
      selectedDept === 'all' ||
      emp.department === selectedDept;

    return matchesQuery && matchesDept;
  });

  // =========================================================
  // SELECTED EMPLOYEE
  // =========================================================

  const targetEmployee =
    employees.find(
      e => e.id === selectedEmpId
    ) || employees[0];

  const empRecords = records.filter(
    r =>
      r.employeeId ===
      targetEmployee?.id
  );

  // =========================================================
  // EMPLOYEE STATISTICS
  // =========================================================

  const totalPresentDays =
    empRecords.filter(
      r =>
        r.checkIn &&
        r.status !== 'on_leave' &&
        r.status !== 'absent' &&
        r.status !== 'weekend' &&
        !isWeekend(r.date)
    ).length;

  const totalWeekendDays =
    empRecords.filter(
      r =>
        r.status === 'weekend' ||
        (isWeekend(r.date) && !r.checkIn)
    ).length;

  const totalAbsentDays =
    empRecords.filter(
      r =>
        r.status === 'absent' &&
        !isWeekend(r.date)
    ).length;

  const totalLateDays =
    empRecords.filter(
      r =>
        (
          r.status === 'late' ||
          (r.lateMinutes &&
            r.lateMinutes > 0)
        ) &&
        !isWeekend(r.date)
    ).length;

  const totalWorkedHours =
    empRecords.reduce(
      (acc, r) =>
        acc +
        (
          !isWeekend(r.date) ||
          r.checkIn
            ? r.workHours || 0
            : 0
        ),
      0
    );

  const totalOvertimeHours =
    empRecords.reduce(
      (acc, r) =>
        acc + (r.overtimeHours || 0),
      0
    );

  const totalMinusHours =
    empRecords.reduce(
      (acc, r) =>
        acc +
        ((r as any).minusHours || 0),
      0
    );

  const totalLateMinutes =
    empRecords.reduce(
      (acc, r) =>
        acc +
        (
          !isWeekend(r.date)
            ? r.lateMinutes || 0
            : 0
        ),
      0
    );

  // =========================================================
  // LEAVE CALCULATIONS
  // =========================================================

  const calculateLeaveDaysCount = (
    types: string[]
  ) => {
    return leaveRequests
      .filter(
        l =>
          l.employeeId ===
            targetEmployee?.id &&
          l.status === 'approved' &&
          types.includes(l.type)
      )
      .reduce(
        (acc, req) =>
          acc +
          calculateWorkDaysInPeriod(
            req.startDate,
            req.endDate
          ),
        0
      );
  };

  const usedCasualDays =
    calculateLeaveDaysCount([
      'casual',
      'emergency'
    ]);

  const usedRegularDays =
    calculateLeaveDaysCount([
      'regular',
      'annual'
    ]);

  const usedSickDays =
    calculateLeaveDaysCount([
      'sick'
    ]);

  const casualBalance =
    targetEmployee?.casualLeaveBalance ?? 7;

  const regularBalance =
    targetEmployee?.regularLeaveBalance ?? 8;

  const sickBalance =
    targetEmployee?.sickLeaveBalance ?? 30;

  // =========================================================
  // EXPORT EMPLOYEE REPORT
  // =========================================================

  const handleExportEmployeeReport = () => {
  if (!targetEmployee) return;

  const isEnglish = lang === 'en';

  const exportData = empRecords.map(r => ({
    [isEnglish ? 'Employee Code' : 'كود الموظف']:
      targetEmployee.code,

    [isEnglish ? 'Employee Name (Arabic)' : 'اسم الموظف بالعربي']:
      targetEmployee.nameAr,

    [isEnglish ? 'Employee Name (English)' : 'اسم الموظف بالإنجليزية']:
      targetEmployee.nameEn,

    [isEnglish ? 'Department' : 'القسم']:
      targetEmployee.department,

    [isEnglish ? 'Date' : 'التاريخ']:
      r.date,

    [isEnglish ? 'Check-in Time' : 'وقت الدخول']:
      r.checkIn
        ? formatTime(r.checkIn, lang)
        : '--:--',

    [isEnglish ? 'Check-out Time' : 'وقت الخروج']:
      r.checkOut
        ? formatTime(r.checkOut, lang)
        : '--:--',

    [isEnglish ? 'Work Hours' : 'ساعات العمل']:
      r.checkOut
        ? formatHoursToHHMM(r.workHours || 0)
        : '--',

    [isEnglish ? 'Overtime' : 'العمل الإضافي']:
      r.checkOut
        ? formatHoursToHHMM(
            r.overtimeHours || 0
          )
        : '--',

    [isEnglish ? 'Shortage Hours' : 'ساعات النقص']:
      r.checkOut
        ? formatHoursToHHMM(
            (r as any).minusHours || 0
          )
        : '--',

    [isEnglish ? 'Late Minutes' : 'التأخير بالدقائق']:
      r.lateMinutes || 0,

    [isEnglish ? 'Status' : 'الحالة']:
      getStatusText(
        r.status,
        lang,
        r.leaveType,
        r.notes
      ),

    [isEnglish ? 'Notes' : 'ملاحظات']:
      r.notes || ''
  }));

  exportToCSV(
    exportData,
    `Report_${targetEmployee.code}_${targetEmployee.nameEn.replace(
      /\s+/g,
      '_'
    )}`
  );
};


// =========================================================
// CHART DATA
// =========================================================

const weeklyData = [
  {
    day: lang === 'en' ? 'Sunday' : 'الأحد',
    present: 7,
    late: 1,
    absent: 0
  },
  {
    day: lang === 'en' ? 'Monday' : 'الإثنين',
    present: 8,
    late: 0,
    absent: 0
  },
  {
    day: lang === 'en' ? 'Tuesday' : 'الثلاثاء',
    present: 6,
    late: 2,
    absent: 0
  },
  {
    day: lang === 'en' ? 'Wednesday' : 'الأربعاء',
    present: 7,
    late: 1,
    absent: 0
  },
  {
    day: lang === 'en' ? 'Thursday' : 'الخميس',
    present: 5,
    late: 2,
    absent: 1
  }
];


// =========================================================
// STATUS COUNTS
// =========================================================

const statusCounts = {
  on_time:
    records.filter(
      r => r.status === 'on_time'
    ).length,

  late:
    records.filter(
      r =>
        r.status === 'late' ||
        (r.lateMinutes &&
          r.lateMinutes > 0)
    ).length,

  early_leave:
    records.filter(
      r =>
        r.status === 'early_leave'
    ).length,

  overtime:
    records.filter(
      r =>
        r.status === 'overtime' ||
        (r.overtimeHours &&
          r.overtimeHours > 0)
    ).length,

  absent:
    records.filter(
      r => r.status === 'absent'
    ).length,

  on_leave:
    records.filter(
      r => r.status === 'on_leave'
    ).length
};


// =========================================================
// PIE CHART
// =========================================================

const rawPieData = [
  {
    name:
      lang === 'en'
        ? 'On Time'
        : 'حاضر في الوقت',
    value: statusCounts.on_time,
    color: '#10b981'
  },
  {
    name:
      lang === 'en'
        ? 'Late'
        : 'متأخر',
    value: statusCounts.late,
    color: '#f59e0b'
  },
  {
    name:
      lang === 'en'
        ? 'Overtime'
        : 'ساعات إضافية',
    value: statusCounts.overtime,
    color: '#8b5cf6'
  },
  {
    name:
      lang === 'en'
        ? 'Early Leave'
        : 'انصراف مبكر',
    value: statusCounts.early_leave,
    color: '#f97316'
  },
  {
    name:
      lang === 'en'
        ? 'Absent'
        : 'غائب',
    value: statusCounts.absent,
    color: '#ef4444'
  },
  {
    name:
      lang === 'en'
        ? 'On Leave'
        : 'في إجازة',
    value: statusCounts.on_leave,
    color: '#0284c7'
  }
];

const filteredPieData =
  rawPieData.filter(
    item => item.value > 0
  );

const pieData =
  filteredPieData.length > 0
    ? filteredPieData
    : [
        {
          name:
            lang === 'en'
              ? 'No Data'
              : 'لا توجد بيانات',
          value: 1,
          color: '#cbd5e1'
        }
      ];


// =========================================================
// DEPARTMENT HOURS
// =========================================================

const deptHoursData = [
  {
    department: 'CX',
    hours: 38,
    overtime: 1
  },
  {
    department: 'E-Commerce',
    hours: 45,
    overtime: 5.5
  },
  {
    department: 'Quality',
    hours: 40,
    overtime: 0.8
  }
];


// =========================================================
// RENDER
// =========================================================

return (
  <div
    className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6 animate-fade-in"
    dir={lang === 'ar' ? 'rtl' : 'ltr'}
  >

      {/* =====================================================
          EMPLOYEE REPORT
      ===================================================== */}

      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-6">

        {/* HEADER */}

        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-slate-100">

          <div>

            <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2.5 flex-wrap">

              <Search className="w-5 h-5 text-emerald-600" />

              <span>
                {lang === 'ar'
                  ? 'قسم Overall Search والتقارير الشاملة'
                  : 'Overall Search & Employee Reports'}
              </span>

              <span
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#0d2240] text-white text-xs font-bold border border-blue-900 shadow-sm shrink-0"
                dir="ltr"
              >

                <img
                  src="logo.png"
                  alt="Tech Source"
                  className="w-4 h-4 object-contain bg-white rounded-full p-0.5"
                  onError={e => {
                    e.currentTarget.style.display =
                      'none';
                  }}
                />

                <span>
                  TECH SOURCE GDS
                </span>

              </span>

            </h2>

            <p className="text-xs text-slate-500 mt-1">
              {lang === 'ar'
                ? 'البحث عن أي موظف بالاسم أو الكود وعرض تقرير كامل بحضوره وغيابه وتصديره لاكسل'
                : 'Search any employee by name or code and export detailed report'}
            </p>

          </div>

          <div className="flex items-center gap-2">

            <button
              onClick={
                handleExportEmployeeReport
              }
              disabled={!targetEmployee}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs shadow-md transition-all"
            >

              <FileSpreadsheet className="w-4 h-4" />

              <span>
                {lang === 'ar'
                  ? 'تصدير التقرير لشيت اكسيل (Excel)'
                  : 'Export Report to Excel'}
              </span>

            </button>

          </div>

        </div>

        {/* SEARCH */}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">

          {/* SEARCH INPUT */}

          <div className="relative">

            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              {lang === 'ar'
                ? 'البحث باسم الموظف أو الكود'
                : 'Search Name or Code'}
            </label>

            <div className="relative">

              <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />

              <input
                type="text"
                value={searchQuery}
                onChange={e =>
                  setSearchQuery(
                    e.target.value
                  )
                }
                placeholder={
                  lang === 'ar'
                    ? 'ادخل الاسم أو الكود (EMP001)...'
                    : 'Type name or EMP code...'
                }
                className="w-full text-xs pr-9 pl-3 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 font-sans"
              />

            </div>

          </div>

          {/* DEPARTMENT */}

          <div>

            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              {lang === 'ar'
                ? 'التصفية حسب القسم'
                : 'Filter by Department'}
            </label>

            <select
              value={selectedDept}
              onChange={e =>
                setSelectedDept(
                  e.target.value
                )
              }
              className="w-full text-xs bg-white border border-slate-200 rounded-xl px-3 py-2.5 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 font-sans"
            >

              <option value="all">
                {lang === 'ar'
                  ? 'جميع الأقسام'
                  : 'All Departments'}
              </option>

              <option value="CX">
                CX
              </option>

              <option value="E-Commerce">
                E-Commerce
              </option>

              <option value="Quality">
                Quality
              </option>

            </select>

          </div>

          {/* EMPLOYEE SELECT */}

          <div>

            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              {lang === 'ar'
                ? 'اختيار الموظف'
                : 'Select Employee'}
            </label>

            <select
              value={selectedEmpId}
              onChange={e =>
                setSelectedEmpId(
                  e.target.value
                )
              }
              className="w-full text-xs bg-white border border-slate-200 rounded-xl px-3 py-2.5 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 font-sans"
            >

              {filteredEmployees.length > 0 ? (
                filteredEmployees.map(emp => (
                  <option
                    key={emp.id}
                    value={emp.id}
                  >
                    {emp.code} - {emp.nameAr}
                  </option>
                ))
              ) : (
                <option value="">
                  {lang === 'ar'
                    ? 'لا يوجد موظفون'
                    : 'No employees found'}
                </option>
              )}

            </select>

          </div>

        </div>

        {/* =====================================================
            EMPLOYEE SUMMARY CARDS
        ===================================================== */}

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">

          {/* PRESENT */}

          <div className="bg-emerald-50/70 p-3.5 rounded-2xl border border-emerald-200 text-emerald-950 space-y-1">

            <div className="flex items-center justify-between text-xs font-bold text-emerald-800">

              <span>
                {lang === 'en'
                  ? 'Actual Attendance Days'
                  : 'أيام الحضور الفعلية'}
              </span>

              <UserCheck className="w-4 h-4 text-emerald-600" />

            </div>

            <div className="text-2xl font-black font-mono text-emerald-700">
              {toWesternDigits(
                totalPresentDays
              )}
            </div>

            <div className="text-[10px] text-emerald-600 font-medium">
              {lang === 'en'
                ? 'Actual Working Days'
                : 'أيام دوام فعلية'}
            </div>

          </div>

          {/* WEEKEND */}

          <div className="bg-teal-50/70 p-3.5 rounded-2xl border border-teal-200 text-teal-950 space-y-1">

            <div className="flex items-center justify-between text-xs font-bold text-teal-800">

              <span>
                {lang === 'en'
                  ? 'Weekly Off Days'
                  : 'العطلات الأسبوعية'}
              </span>

              <Palmtree className="w-4 h-4 text-teal-600" />

            </div>

            <div className="text-2xl font-black font-mono text-teal-700">
              {toWesternDigits(
                totalWeekendDays
              )}
            </div>

            <div className="text-[10px] text-teal-600 font-medium">
              {lang === 'en'
                ? 'Friday & Saturday'
                : 'جمعة وسبت'}
            </div>

          </div>

          {/* ABSENT */}

          <div className="bg-rose-50/70 p-3.5 rounded-2xl border border-rose-200 text-rose-950 space-y-1">

            <div className="flex items-center justify-between text-xs font-bold text-rose-800">

              <span>
                {lang === 'en'
                  ? 'Absent Days'
                  : 'عدد أيام الغياب'}
              </span>

              <UserX className="w-4 h-4 text-rose-600" />

            </div>

            <div className="text-2xl font-black font-mono text-rose-700">
              {toWesternDigits(
                totalAbsentDays
              )}
            </div>

            <div className="text-[10px] text-rose-600 font-medium">
              {lang === 'en'
                ? 'Without Approved Leave'
                : 'بدون إجازة معتمدة'}
            </div>

          </div>

          {/* LATE */}

          <div className="bg-amber-50/70 p-3.5 rounded-2xl border border-amber-200 text-amber-950 space-y-1">

            <div className="flex items-center justify-between text-xs font-bold text-amber-800">

              <span>
                {lang === 'en'
                  ? 'Late Days'
                  : 'أيام التأخير'}
              </span>

              <Clock className="w-4 h-4 text-amber-600" />

            </div>

            <div className="text-2xl font-black font-mono text-amber-700">
              {toWesternDigits(
                totalLateDays
              )}
            </div>

            <div className="text-[10px] text-amber-600 font-medium">

              {lang === 'en'
                ? `Total ${toWesternDigits(
                    totalLateMinutes
                  )} Minutes`
                : `إجمالي ${toWesternDigits(
                    totalLateMinutes
                  )} دقيقة`}

            </div>

          </div>

          {/* REGULAR */}

          <div className="bg-emerald-100/80 p-3.5 rounded-2xl border border-emerald-300 text-emerald-950 space-y-1">

            <div className="flex items-center justify-between text-xs font-bold text-emerald-900">

              <span>
                {lang === 'en'
                  ? 'Annual Leave'
                  : 'إجازة اعتيادية'}
              </span>

              <Palmtree className="w-4 h-4 text-emerald-700" />

            </div>

            <div className="text-2xl font-black font-mono text-emerald-800">
              {toWesternDigits(
                usedRegularDays
              )}
            </div>

            <div className="text-[10px] text-emerald-700 font-medium">

              {lang === 'en'
                ? `Balance: ${toWesternDigits(
                    regularBalance
                  )} Days`
                : `الرصيد: ${toWesternDigits(
                    regularBalance
                  )} يوم`}

            </div>

          </div>

          {/* CASUAL */}

          <div className="bg-amber-100/80 p-3.5 rounded-2xl border border-amber-300 text-amber-950 space-y-1">

            <div className="flex items-center justify-between text-xs font-bold text-amber-900">

              <span>
                {lang === 'en'
                  ? 'Casual Leave'
                  : 'إجازة عارضة'}
              </span>

              <Zap className="w-4 h-4 text-amber-700" />

            </div>

            <div className="text-2xl font-black font-mono text-amber-800">
              {toWesternDigits(
                usedCasualDays
              )}
            </div>

            <div className="text-[10px] text-amber-700 font-medium">

              {lang === 'en'
                ? `Balance: ${toWesternDigits(
                    casualBalance
                  )} Days`
                : `الرصيد: ${toWesternDigits(
                    casualBalance
                  )} يوم`}

            </div>

          </div>

          {/* SICK */}

          <div className="bg-rose-100/80 p-3.5 rounded-2xl border border-rose-300 text-rose-950 space-y-1">

            <div className="flex items-center justify-between text-xs font-bold text-rose-900">

              <span>
                {lang === 'en'
                  ? 'Sick Leave'
                  : 'إجازة مرضية'}
              </span>

              <Activity className="w-4 h-4 text-rose-700" />

            </div>

            <div className="text-2xl font-black font-mono text-rose-800">
              {toWesternDigits(
                usedSickDays
              )}
            </div>

            <div className="text-[10px] text-rose-700 font-medium">

              {lang === 'en'
                ? `Balance: ${toWesternDigits(
                    sickBalance
                  )} Days`
                : `الرصيد: ${toWesternDigits(
                    sickBalance
                  )} يوم`}

            </div>

          </div>

          {/* WORK HOURS */}

          <div className="bg-blue-50/70 p-3.5 rounded-2xl border border-blue-200 text-blue-950 space-y-1">

            <div className="flex items-center justify-between text-xs font-bold text-blue-800">

              <span>
                {lang === 'en'
                  ? 'Work Hours'
                  : 'ساعات العمل'}
              </span>

              <Award className="w-4 h-4 text-blue-600" />

            </div>

            <div className="text-2xl font-black font-mono text-blue-700">
              {formatHoursToHHMM(
                totalWorkedHours
              )}
            </div>

            <div className="text-[10px] text-blue-600 font-medium">

              {lang === 'en'
                ? 'Total Work Hours'
                : 'إجمالي ساعات العمل'}

            </div>

          </div>

        </div>

        {/* =====================================================
            EXTRA HOURS
        ===================================================== */}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">

          {/* OVERTIME */}

          <div className="bg-purple-50 p-4 rounded-2xl border border-purple-200">

            <div className="text-xs font-bold text-purple-800">
              {lang === 'en'
                ? 'Total Overtime'
                : 'إجمالي العمل الإضافي'}
            </div>

            <div className="text-2xl font-black font-mono text-purple-700 mt-1">
              {formatHoursToHHMM(
                totalOvertimeHours
              )}
            </div>

          </div>

          {/* SHORTAGE */}

          <div className="bg-red-50 p-4 rounded-2xl border border-red-200">

            <div className="text-xs font-bold text-red-800">
              {lang === 'en'
                ? 'Total Shortage Hours'
                : 'إجمالي ساعات النقص'}
            </div>

            <div className="text-2xl font-black font-mono text-red-700 mt-1">
              {formatHoursToHHMM(
                totalMinusHours
              )}
            </div>

          </div>

          {/* COMPLIANCE */}

          <div className="bg-slate-900 text-white p-4 rounded-2xl border border-slate-800">

            <div className="text-xs font-bold text-slate-300">
              {lang === 'en'
                ? 'Compliance Rate'
                : 'نسبة الالتزام'}
            </div>

            <div className="text-2xl font-black font-mono text-emerald-400 mt-1">

              {totalPresentDays > 0
                ? `${toWesternDigits(
                    Math.max(
                      0,
                      Math.round(
                        (
                          (
                            totalPresentDays -
                            totalLateDays
                          ) /
                          totalPresentDays
                        ) *
                          100
                      )
                    )
                  )}%`
                : '--'}

            </div>

          </div>

        </div>

        {/* =====================================================
            ATTENDANCE TABLE
        ===================================================== */}

        <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white">

          <div className="bg-slate-50 p-3.5 border-b border-slate-200 flex items-center justify-between">

            <h4 className="font-bold text-slate-900 text-xs flex items-center gap-2">

              <Calendar className="w-4 h-4 text-emerald-600" />

              <span>
                {lang === 'ar'
                  ? `أيام الحضور بالتواريخ ووقت تسجيل الدخول والخروج للموظف (${
                      targetEmployee?.nameAr || ''
                    })`
                  : `Attendance details for ${
                      targetEmployee?.nameEn || ''
                    }`}
              </span>

            </h4>

            <span className="text-[11px] font-mono text-slate-500 font-semibold">

              {toWesternDigits(
                empRecords.length
              )}{' '}

              {lang === 'ar'
                ? 'سجلات'
                : 'records'}

            </span>

          </div>

          <div className="overflow-x-auto">

            <table className="w-full text-right text-xs">

              <thead>
  <tr className="bg-slate-100 text-slate-600 font-bold border-b border-slate-200 whitespace-nowrap">

    <th className="py-3 px-4 whitespace-nowrap">
      {lang === 'ar' ? 'التاريخ' : 'Date'}
    </th>

    <th className="py-3 px-4 whitespace-nowrap">
      {lang === 'ar'
        ? 'وقت تسجيل الدخول (12H)'
        : 'Check-in Time (12H)'}
    </th>

    <th className="py-3 px-4 whitespace-nowrap">
      {lang === 'ar'
        ? 'وقت تسجيل الخروج (12H)'
        : 'Check-out Time (12H)'}
    </th>

    <th className="py-3 px-4 whitespace-nowrap">
      {lang === 'ar'
        ? 'ساعات العمل'
        : 'Work Hours'}
    </th>

    <th className="py-3 px-4 whitespace-nowrap">
      {lang === 'ar'
        ? 'العمل الإضافي'
        : 'Overtime'}
    </th>

    <th className="py-3 px-4 whitespace-nowrap">
      {lang === 'ar'
        ? 'ساعات النقص'
        : 'Shortage Hours'}
    </th>

    <th className="py-3 px-4 whitespace-nowrap">
      {lang === 'ar'
        ? 'دقائق التأخير'
        : 'Late Minutes'}
    </th>

    <th className="py-3 px-4 whitespace-nowrap">
      {lang === 'ar'
        ? 'الحالة'
        : 'Status'}
    </th>

  </tr>
</thead>

              <tbody className="divide-y divide-slate-100 font-sans">

                {empRecords.length > 0 ? (

                  empRecords.map(r => (

                    <tr
                      key={r.id}
                      className="hover:bg-slate-50 transition-colors"
                    >

                      <td className="py-3 px-4 font-mono font-bold text-slate-800">
                        {toWesternDigits(
                          r.date
                        )}
                      </td>

                      <td className="py-3 px-4 font-mono font-bold text-emerald-700">

                        {r.checkIn
                          ? formatTime(
                              r.checkIn,
                              lang
                            )
                          : '--:--'}

                      </td>

                      <td className="py-3 px-4 font-mono font-bold text-slate-800">

                        {r.checkOut
                          ? formatTime(
                              r.checkOut,
                              lang
                            )
                          : '--:--'}

                      </td>

                      <td className="py-3 px-4 font-mono font-bold text-blue-700">

                        {r.checkOut
                          ? formatHoursToHHMM(
                              r.workHours ||
                                0
                            )
                          : '--'}

                      </td>

                      <td className="py-3 px-4 font-mono font-bold text-purple-700">

                        {r.checkOut
                          ? formatHoursToHHMM(
                              r.overtimeHours ||
                                0
                            )
                          : '--'}

                      </td>

                      <td className="py-3 px-4 font-mono font-bold text-red-700">

                        {r.checkOut
                          ? formatHoursToHHMM(
                              (r as any)
                                .minusHours ||
                                0
                            )
                          : '--'}

                      </td>

                      <td className="py-3 px-4 font-mono font-bold text-amber-700">

                        {toWesternDigits(
                          r.lateMinutes ||
                            0
                        )}

                      </td>

                      <td className="py-3 px-4">

                        <span
                          className="inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-bold whitespace-nowrap"
                        >
                          {getStatusText(
                            r.status,
                            lang,
                            r.leaveType,
                            r.notes
                          )}
                        </span>

                      </td>

                    </tr>

                  ))

                ) : (

                  <tr>

                    <td
                      colSpan={8}
                      className="py-10 text-center text-slate-400 font-medium"
                    >
                      {lang === 'ar'
                        ? 'لا توجد سجلات حضور لهذا الموظف'
                        : 'No attendance records found for this employee'}
                    </td>

                  </tr>

                )}

              </tbody>

            </table>

          </div>

        </div>

      </div>

      {/* =====================================================
          SYSTEM ANALYTICS
      ===================================================== */}

      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex items-center justify-between">

        <div>

          <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">

            <BarChart3 className="w-5 h-5 text-emerald-600" />

            <span>
              {lang === 'ar'
                ? 'إحصائيات المنظومة ككل'
                : 'System-Wide Analytics'}
            </span>

          </h2>

          <p className="text-xs text-slate-500 mt-1">
            {lang === 'ar'
              ? 'مؤشرات الأداء العامة، مقارنة الأقسام، والتأخير الأسبوعي'
              : 'Performance indicators & department comparison'}
          </p>

        </div>

      </div>

      {/* =====================================================
          CHARTS
      ===================================================== */}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* WEEKLY */}

        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">

          <div className="flex items-center justify-between">

            <h3 className="font-bold text-slate-900 text-sm">
              {lang === 'ar'
                ? 'معدل الحضور اليومي الأسبوعي'
                : 'Weekly Attendance Rate'}
            </h3>

            <span className="text-xs text-slate-400 font-mono">
              {lang === 'ar'
                ? 'الأسبوع الحالي'
                : 'Current Week'}
            </span>

          </div>

          <div className="h-64">

            <ResponsiveContainer
              width="100%"
              height="100%"
            >

              <BarChart data={weeklyData}>

                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="#f1f5f9"
                />

                <XAxis
                  dataKey="day"
                  stroke="#64748b"
                  fontSize={11}
                />

                <YAxis
                  stroke="#64748b"
                  fontSize={11}
                />

                <Tooltip
                  contentStyle={{
                    borderRadius: '12px',
                    borderColor: '#e2e8f0',
                    fontSize: '12px'
                  }}
                />

                <Legend
                  wrapperStyle={{
                    fontSize: '11px'
                  }}
                />

                <Bar
                  dataKey="present"
                  name="حاضر في الوقت"
                  fill="#10b981"
                  radius={[6, 6, 0, 0]}
                />

                <Bar
                  dataKey="late"
                  name="متأخر"
                  fill="#f59e0b"
                  radius={[6, 6, 0, 0]}
                />

                <Bar
                  dataKey="absent"
                  name="غائب"
                  fill="#ef4444"
                  radius={[6, 6, 0, 0]}
                />

              </BarChart>

            </ResponsiveContainer>

          </div>

        </div>

        {/* PIE */}

        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">

          <h3 className="font-bold text-slate-900 text-sm">
            {lang === 'ar'
              ? 'توزيع حالات الحضور والانصراف'
              : 'Attendance Status Breakdown'}
          </h3>

          <div className="h-64 flex items-center justify-center">

            <ResponsiveContainer
              width="100%"
              height="100%"
            >

              <PieChart>

                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={5}
                  dataKey="value"
                >

                  {pieData.map(
                    (entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={entry.color}
                      />
                    )
                  )}

                </Pie>

                <Tooltip
                  contentStyle={{
                    borderRadius: '12px',
                    fontSize: '12px'
                  }}
                />

                <Legend
                  wrapperStyle={{
                    fontSize: '11px'
                  }}
                />

              </PieChart>

            </ResponsiveContainer>

          </div>

        </div>

      </div>

      {/* =====================================================
          DEPARTMENT
      ===================================================== */}

      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">

        <h3 className="font-bold text-slate-900 text-sm">
          {lang === 'ar'
            ? 'إجمالي ساعات العمل والإضافي حسب القسم'
            : 'Work & Overtime Hours by Department'}
        </h3>

        <div className="h-72">

          <ResponsiveContainer
            width="100%"
            height="100%"
          >

            <AreaChart
              data={deptHoursData}
            >

              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="#f1f5f9"
              />

              <XAxis
                dataKey="department"
                stroke="#64748b"
                fontSize={11}
              />

              <YAxis
                stroke="#64748b"
                fontSize={11}
              />

              <Tooltip
                contentStyle={{
                  borderRadius: '12px',
                  fontSize: '12px'
                }}
              />

              <Legend
                wrapperStyle={{
                  fontSize: '11px'
                }}
              />

              <Area
                type="monotone"
                dataKey="hours"
                name="ساعات العمل الأساسية"
                stroke="#0284c7"
                fill="#e0f2fe"
                strokeWidth={2}
              />

              <Area
                type="monotone"
                dataKey="overtime"
                name="الساعات الإضافية"
                stroke="#8b5cf6"
                fill="#f3e8ff"
                strokeWidth={2}
              />

            </AreaChart>

          </ResponsiveContainer>

        </div>

      </div>

    </div>
  );
};
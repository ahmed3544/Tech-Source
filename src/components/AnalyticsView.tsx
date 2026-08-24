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
  CheckCircle2,
  ShieldCheck,
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

import { UserAvatar } from './UserAvatar';

import {
  formatHoursToHHMM,
  formatTime,
  exportToCSV,
  getStatusBadgeStyle,
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
  globalSearchTerm,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  React.useEffect(() => {
    if (globalSearchTerm) {
      setSearchQuery(globalSearchTerm);
    }
  }, [globalSearchTerm]);

  const [selectedDept, setSelectedDept] = useState('all');
  const [selectedEmpId, setSelectedEmpId] = useState<string>(
    employees[0]?.id || ''
  );

  const [reportPeriod, setReportPeriod] = useState<
    'daily' | 'weekly' | 'monthly'
  >('monthly');

  const [selectedMonth, setSelectedMonth] = useState<string>('2026-08');

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

    const overtimeHoursTotal = empMonthRecords.reduce(
      (acc, r) =>
        acc + (r.overtimeHours || 0),
      0
    );

    const minusHoursTotal = empMonthRecords.reduce(
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
      workedHours,
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

      'أيام الحضور': item.presentDays,
      'أيام الغياب': item.absentDays,

      'أيام العطلات الأسبوعية':
        item.weekendDays,

      'أيام التأخير':
        item.lateDays,

      'دقائق التأخير الإجمالية':
        item.lateMins,

      'أيام الإجازات':
        item.leaveDays,

      'ساعات العمل الإجمالية':
        formatHoursToHHMM(item.workedHours),

      'ساعات العمل الإضافي':
        formatHoursToHHMM(item.overtimeHoursTotal),

      'ساعات النقص':
        formatHoursToHHMM(item.minusHoursTotal),
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
    const matchesQuery =
      emp.nameAr.includes(searchQuery) ||
      emp.nameEn
        .toLowerCase()
        .includes(searchQuery.toLowerCase()) ||
      emp.code
        .toLowerCase()
        .includes(searchQuery.toLowerCase());

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
    r => r.employeeId === targetEmployee?.id
  );

  // =========================================================
  // EMPLOYEE STATISTICS
  // =========================================================

  const totalPresentDays = empRecords.filter(
    r =>
      r.checkIn &&
      r.status !== 'on_leave' &&
      r.status !== 'absent' &&
      r.status !== 'weekend' &&
      !isWeekend(r.date)
  ).length;

  const totalWeekendDays = empRecords.filter(
    r =>
      r.status === 'weekend' ||
      (isWeekend(r.date) && !r.checkIn)
  ).length;

  const totalAbsentDays = empRecords.filter(
    r =>
      r.status === 'absent' &&
      !isWeekend(r.date)
  ).length;

  const totalLateDays = empRecords.filter(
    r =>
      (
        r.status === 'late' ||
        (r.lateMinutes && r.lateMinutes > 0)
      ) &&
      !isWeekend(r.date)
  ).length;

  const totalLeaveDays = empRecords.filter(
    r =>
      r.status === 'on_leave' &&
      !isWeekend(r.date)
  ).length;

  const totalWorkedHours = empRecords.reduce(
    (acc, r) =>
      acc +
      (
        !isWeekend(r.date) || r.checkIn
          ? r.workHours || 0
          : 0
      ),
    0
  );

  const totalOvertimeHours = empRecords.reduce(
    (acc, r) =>
      acc + (r.overtimeHours || 0),
    0
  );

  const totalMinusHours = empRecords.reduce(
    (acc, r) =>
      acc + ((r as any).minusHours || 0),
    0
  );

  const totalLateMinutes = empRecords.reduce(
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
          l.employeeId === targetEmployee?.id &&
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

    const exportData = empRecords.map(r => ({
      'كود الموظف':
        targetEmployee.code,

      'اسم الموظف بالعربي':
        targetEmployee.nameAr,

      'اسم الموظف بالإنجليزية':
        targetEmployee.nameEn,

      'القسم':
        targetEmployee.department,

      'التاريخ':
        r.date,

      'وقت الدخول':
        r.checkIn
          ? formatTime(r.checkIn, lang)
          : '--:--',

      'وقت الخروج':
        r.checkOut
          ? formatTime(r.checkOut, lang)
          : '--:--',

      'ساعات العمل':
        r.checkOut
          ? formatHoursToHHMM(
              r.workHours || 0
            )
          : '--',

      'العمل الإضافي':
        r.checkOut
          ? formatHoursToHHMM(
              r.overtimeHours || 0
            )
          : '--',

      'ساعات النقص':
        r.checkOut
          ? formatHoursToHHMM(
              (r as any).minusHours || 0
            )
          : '--',

      'التأخير بالدقائق':
        r.lateMinutes || 0,

      'الحالة':
        getStatusText(
          r.status,
          lang,
          r.leaveType,
          r.notes
        ),

      'ملاحظات':
        r.notes || '',
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
      day: 'الأحد',
      present: 7,
      late: 1,
      absent: 0
    },
    {
      day: 'الإثنين',
      present: 8,
      late: 0,
      absent: 0
    },
    {
      day: 'الثلاثاء',
      present: 6,
      late: 2,
      absent: 0
    },
    {
      day: 'الأربعاء',
      present: 7,
      late: 1,
      absent: 0
    },
    {
      day: 'الخميس',
      present: 5,
      late: 2,
      absent: 1
    }
  ];

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
        r => r.status === 'early_leave'
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
      ).length,
  };

  const rawPieData = [
    {
      name: 'حاضر في الوقت',
      value: statusCounts.on_time,
      color: '#10b981'
    },
    {
      name: 'متأخر',
      value: statusCounts.late,
      color: '#f59e0b'
    },
    {
      name: 'ساعات إضافية',
      value: statusCounts.overtime,
      color: '#8b5cf6'
    },
    {
      name: 'انصراف مبكر',
      value: statusCounts.early_leave,
      color: '#f97316'
    },
    {
      name: 'غائب',
      value: statusCounts.absent,
      color: '#ef4444'
    },
    {
      name: 'في إجازة',
      value: statusCounts.on_leave,
      color: '#0284c7'
    }
  ];

  const pieData =
    rawPieData.filter(
      item => item.value > 0
    ).length > 0
      ? rawPieData.filter(
          item => item.value > 0
        )
      : [
          {
            name: 'لا توجد بيانات',
            value: 1,
            color: '#cbd5e1'
          }
        ];

  const deptHoursData = [
    {
      department: 'CX',
      hours: 38.0,
      overtime: 1.0
    },
    {
      department: 'E-Commerce',
      hours: 45.0,
      overtime: 5.5
    },
    {
      department: 'Quality',
      hours: 40.0,
      overtime: 0.8
    }
  ];

  // =========================================================
  // RENDER
  // =========================================================

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6 animate-fade-in">

      {/* =====================================================
          EMPLOYEE REPORT
      ===================================================== */}

      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-6">

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
                    (
                      e.currentTarget as HTMLElement
                    ).style.display = 'none';
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
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md transition-all"
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

          <div>

            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              {lang === 'ar'
                ? 'اختيار الموظف لعرض التقرير'
                : 'Select Employee'}
            </label>

            <select
              value={selectedEmpId}
              onChange={e =>
                setSelectedEmpId(
                  e.target.value
                )
              }
              className="w-full text-xs bg-white border border-slate-200 rounded-xl px-3 py-2.5 font-bold font-sans text-slate-900"
            >
              {filteredEmployees.map(
                emp => (
                  <option
                    key={emp.id}
                    value={emp.id}
                  >
                    {emp.nameAr} ({emp.code}) -{' '}
                    {emp.department}
                  </option>
                )
              )}
            </select>

          </div>

        </div>

        {/* EMPLOYEE */}

        {targetEmployee ? (
          <div className="space-y-6">

            {/* PROFILE */}

            <div className="bg-[#0d2240] text-white p-5 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-md border border-blue-900">

              <div className="flex items-center gap-4">

                <UserAvatar
                  name={
                    targetEmployee.nameEn ||
                    targetEmployee.nameAr
                  }
                  code={
                    targetEmployee.code
                  }
                  size="xl"
                />

                <div>

                  <div className="flex items-center gap-2">

                    <h3 className="text-xl font-extrabold text-white">
                      {lang === 'ar'
                        ? targetEmployee.nameAr
                        : targetEmployee.nameEn}
                    </h3>

                    <span className="text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono font-bold px-2 py-0.5 rounded">
                      #{targetEmployee.code}
                    </span>

                  </div>

                  <p className="text-xs text-slate-300 mt-0.5">
                    {targetEmployee.jobTitleAr}{' '}
                    |{' '}
                    <span className="text-emerald-400 font-semibold">
                      {targetEmployee.department}
                    </span>
                  </p>

                  <p className="text-[11px] text-slate-400 mt-1 font-mono">
                    الورديّة:{' '}
                    <span className="text-emerald-300 font-bold">
                      09:00 AM - 05:00 PM
                    </span>{' '}
                    | الحالة:{' '}
                    <span className="text-emerald-300">
                      نشط
                    </span>
                  </p>

                </div>

              </div>

              {/* PERIOD */}

              <div className="flex items-center gap-1.5 bg-slate-800/80 p-1 rounded-xl border border-slate-700">

                <button
                  onClick={() =>
                    setReportPeriod(
                      'daily'
                    )
                  }
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                    reportPeriod === 'daily'
                      ? 'bg-emerald-500 text-slate-950'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {lang === 'ar'
                    ? 'تقرير يومي'
                    : 'Daily'}
                </button>

                <button
                  onClick={() =>
                    setReportPeriod(
                      'weekly'
                    )
                  }
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                    reportPeriod === 'weekly'
                      ? 'bg-emerald-500 text-slate-950'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {lang === 'ar'
                    ? 'تقرير أسبوعي'
                    : 'Weekly'}
                </button>

                <button
                  onClick={() =>
                    setReportPeriod(
                      'monthly'
                    )
                  }
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                    reportPeriod === 'monthly'
                      ? 'bg-emerald-500 text-slate-950'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {lang === 'ar'
                    ? 'تقرير شهري'
                    : 'Monthly'}
                </button>

              </div>

            </div>

            {/* KPI */}

            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">

              {/* PRESENT */}

              <div className="bg-emerald-50/70 p-3.5 rounded-2xl border border-emerald-200 text-emerald-950 space-y-1">

                <div className="flex items-center justify-between text-xs font-bold text-emerald-800">

                  <span>
                    أيام الحضور الفعلية
                  </span>

                  <UserCheck className="w-4 h-4 text-emerald-600" />

                </div>

                <div className="text-2xl font-black font-mono text-emerald-700">
                  {toWesternDigits(
                    totalPresentDays
                  )}
                </div>

                <div className="text-[10px] text-emerald-600 font-medium">
                  أيام دوام فعلية
                </div>

              </div>

              {/* WEEKEND */}

              <div className="bg-teal-50/70 p-3.5 rounded-2xl border border-teal-200 text-teal-950 space-y-1">

                <div className="flex items-center justify-between text-xs font-bold text-teal-800">

                  <span>
                    العطلات الأسبوعية
                  </span>

                  <Palmtree className="w-4 h-4 text-teal-600" />

                </div>

                <div className="text-2xl font-black font-mono text-teal-700">
                  {toWesternDigits(
                    totalWeekendDays
                  )}
                </div>

                <div className="text-[10px] text-teal-600 font-medium">
                  جمعة وسبت
                </div>

              </div>

              {/* ABSENT */}

              <div className="bg-rose-50/70 p-3.5 rounded-2xl border border-rose-200 text-rose-950 space-y-1">

                <div className="flex items-center justify-between text-xs font-bold text-rose-800">

                  <span>
                    عدد أيام الغياب
                  </span>

                  <UserX className="w-4 h-4 text-rose-600" />

                </div>

                <div className="text-2xl font-black font-mono text-rose-700">
                  {toWesternDigits(
                    totalAbsentDays
                  )}
                </div>

                <div className="text-[10px] text-rose-600 font-medium">
                  بدون إجازة معتمدة
                </div>

              </div>

              {/* LATE */}

              <div className="bg-amber-50/70 p-3.5 rounded-2xl border border-amber-200 text-amber-950 space-y-1">

                <div className="flex items-center justify-between text-xs font-bold text-amber-800">

                  <span>
                    أيام التأخير
                  </span>

                  <Clock className="w-4 h-4 text-amber-600" />

                </div>

                <div className="text-2xl font-black font-mono text-amber-700">
                  {toWesternDigits(
                    totalLateDays
                  )}
                </div>

                <div className="text-[10px] text-amber-600 font-medium">
                  إجمالي{' '}
                  {toWesternDigits(
                    totalLateMinutes
                  )}{' '}
                  دقيقة
                </div>

              </div>

              {/* REGULAR */}

              <div className="bg-emerald-100/80 p-3.5 rounded-2xl border border-emerald-300 text-emerald-950 space-y-1">

                <div className="flex items-center justify-between text-xs font-bold text-emerald-900">

                  <span>
                    إجازة اعتيادية
                  </span>

                  <Palmtree className="w-4 h-4 text-emerald-700" />

                </div>

                <div className="text-2xl font-black font-mono text-emerald-800">
                  {toWesternDigits(
                    usedRegularDays
                  )}
                </div>

                <div className="text-[10px] text-emerald-700 font-medium">
                  الرصيد:{' '}
                  {toWesternDigits(
                    regularBalance
                  )}{' '}
                  يوم
                </div>

              </div>

              {/* CASUAL */}

              <div className="bg-amber-100/80 p-3.5 rounded-2xl border border-amber-300 text-amber-950 space-y-1">

                <div className="flex items-center justify-between text-xs font-bold text-amber-900">

                  <span>
                    إجازة عارضة
                  </span>

                  <Zap className="w-4 h-4 text-amber-700" />

                </div>

                <div className="text-2xl font-black font-mono text-amber-800">
                  {toWesternDigits(
                    usedCasualDays
                  )}
                </div>

                <div className="text-[10px] text-amber-700 font-medium">
                  الرصيد:{' '}
                  {toWesternDigits(
                    casualBalance
                  )}{' '}
                  يوم
                </div>

              </div>

              {/* SICK */}

              <div className="bg-rose-100/80 p-3.5 rounded-2xl border border-rose-300 text-rose-950 space-y-1">

                <div className="flex items-center justify-between text-xs font-bold text-rose-900">

                  <span>
                    إجازة مرضية
                  </span>

                  <Activity className="w-4 h-4 text-rose-700" />

                </div>

                <div className="text-2xl font-black font-mono text-rose-800">
                  {toWesternDigits(
                    usedSickDays
                  )}
                </div>

                <div className="text-[10px] text-rose-700 font-medium">
                  الرصيد:{' '}
                  {toWesternDigits(
                    sickBalance
                  )}{' '}
                  يوم
                </div>

              </div>

              {/* WORK HOURS */}

              <div className="bg-blue-50/70 p-3.5 rounded-2xl border border-blue-200 text-blue-950 space-y-1">

                <div className="flex items-center justify-between text-xs font-bold text-blue-800">

                  <span>
                    ساعات العمل
                  </span>

                  <Award className="w-4 h-4 text-blue-600" />

                </div>

                <div className="text-2xl font-black font-mono text-blue-700">
                  {formatHoursToHHMM(
                    totalWorkedHours
                  )}
                </div>

                <div className="text-[10px] text-blue-600 font-medium">
                  إجمالي ساعات العمل
                </div>

              </div>

            </div>

            {/* EXTRA HOURS */}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">

              <div className="bg-purple-50 p-4 rounded-2xl border border-purple-200">

                <div className="text-xs font-bold text-purple-800">
                  إجمالي العمل الإضافي
                </div>

                <div className="text-2xl font-black font-mono text-purple-700 mt-1">
                  {formatHoursToHHMM(
                    totalOvertimeHours
                  )}
                </div>

              </div>

              <div className="bg-red-50 p-4 rounded-2xl border border-red-200">

                <div className="text-xs font-bold text-red-800">
                  إجمالي ساعات النقص
                </div>

                <div className="text-2xl font-black font-mono text-red-700 mt-1">
                  {formatHoursToHHMM(
                    totalMinusHours
                  )}
                </div>

              </div>

              <div className="bg-slate-900 text-white p-4 rounded-2xl border border-slate-800">

                <div className="text-xs font-bold text-slate-300">
                  نسبة الالتزام
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

            {/* ATTENDANCE TABLE */}

            <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white">

              <div className="bg-slate-50 p-3.5 border-b border-slate-200 flex items-center justify-between">

                <h4 className="font-bold text-slate-900 text-xs flex items-center gap-2">

                  <Calendar className="w-4 h-4 text-emerald-600" />

                  <span>
                    أيام الحضور بالتواريخ ووقت تسجيل الدخول والخروج للموظف (
                    {targetEmployee.nameAr}
                    )
                  </span>

                </h4>

                <span className="text-[11px] font-mono text-slate-500 font-semibold">
                  {toWesternDigits(
                    empRecords.length
                  )}{' '}
                  سجلات
                </span>

              </div>

              <div className="overflow-x-auto">

                <table className="w-full text-right text-xs">

                  <thead>

                    <tr className="bg-slate-100 text-slate-600 font-bold border-b border-slate-200 whitespace-nowrap">

                      <th className="py-3 px-4 whitespace-nowrap">
                        التاريخ
                      </th>

                      <th className="py-3 px-4 whitespace-nowrap">
                        وقت تسجيل الدخول (12H)
                      </th>

                      <th className="py-3 px-4 whitespace-nowrap">
                        وقت تسجيل الخروج (12H)
                      </th>

                      <th className="py-3 px-4 whitespace-nowrap">
                        ساعات العمل
                      </th>

                      <th className="py-3 px-4 whitespace-nowrap">
                        العمل الإضافي
                      </th>

                      <th className="py-3 px-4 whitespace-nowrap">
                        ساعات النقص
                      </th>

                      <th className="py-3 px-4 whitespace-nowrap">
                        دقائق التأخير
                      </th>

                      <th className="py-3 px-4 whitespace-nowrap">
                        الحالة
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

                          <td className="py-3 px-4 font-mono font-bold text-red-600">
                            {r.checkOut
                              ? formatHoursToHHMM(
                                  (r as any)
                                    .minusHours ||
                                    0
                                )
                              : '--'}
                          </td>

                          <td className="py-3 px-4 font-mono text-amber-700 font-bold">
                            {r.lateMinutes
                              ? `+${toWesternDigits(
                                  r.lateMinutes
                                )} د`
                              : '-'}
                          </td>

                          <td className="py-3 px-4">

                            <span
                              className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${getStatusBadgeStyle(
                                r.status
                              )}`}
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
                          className="py-8 text-center text-slate-400"
                        >
                          لا توجد سجلات حضور تاريخية مسجلة لهذا الموظف
                        </td>

                      </tr>

                    )}

                  </tbody>

                </table>

              </div>

            </div>

          </div>

        ) : (

          <div className="py-12 text-center text-slate-400">
            يرجى تحديد موظف لعرض التقرير
          </div>

        )}

      </div>

      {/* =====================================================
          TEAM LEADER MONTHLY REPORT
      ===================================================== */}

      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-5">

        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-slate-100">

          <div>

            <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">

              <ShieldCheck className="w-5 h-5 text-amber-500" />

              <span>
                {lang === 'ar'
                  ? 'تقارير التيم ليدر والإدارة بالأشهر السابقة'
                  : 'Team Leader Reports for Previous Months'}
              </span>

            </h2>

            <p className="text-xs text-slate-500 mt-1">
              {lang === 'ar'
                ? 'عرض الحضور والتأخير والإجازات لجميع أعضاء الفريق مصنفة حسب الشهر المختار'
                : 'View attendance, late minutes, and leave records per month'}
            </p>

          </div>

          <div className="flex flex-wrap items-center gap-3">

            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl">

              <span className="text-xs font-bold text-slate-600">
                اختيار الشهر:
              </span>

              <select
                value={selectedMonth}
                onChange={e =>
                  setSelectedMonth(
                    e.target.value
                  )
                }
                className="text-xs font-bold bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-slate-900 focus:outline-none"
              >

                <option value="2026-08">
                  الشهر الحالي (أغسطس 2026)
                </option>

                <option value="2026-07">
                  يوليو 2026
                </option>

                <option value="2026-06">
                  يونيو 2026
                </option>

                <option value="2026-05">
                  مايو 2026
                </option>

                <option value="2026-04">
                  أبريل 2026
                </option>

                <option value="all">
                  جميع الأشهر
                </option>

              </select>

            </div>

            <button
              onClick={
                handleExportTeamMonthlyReport
              }
              className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-amber-300 border border-amber-500/30 font-bold text-xs rounded-xl shadow-sm transition"
            >

              <FileSpreadsheet className="w-4 h-4 text-amber-400" />

              <span>
                تصدير تقرير الفريق للأكسيل
              </span>

            </button>

          </div>

        </div>

        <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white">

          <div className="overflow-x-auto">

            <table className="w-full text-right text-xs">

              <thead className="bg-slate-900 text-white font-bold whitespace-nowrap">

                <tr>

                  <th className="p-3 whitespace-nowrap">
                    الموظف
                  </th>

                  <th className="p-3 whitespace-nowrap">
                    القسم / الدور
                  </th>

                  <th className="p-3 text-center whitespace-nowrap">
                    أيام الحضور
                  </th>

                  <th className="p-3 text-center whitespace-nowrap">
                    أيام التأخير
                  </th>

                  <th className="p-3 text-center whitespace-nowrap">
                    إجمالي دقائق التأخير
                  </th>

                  <th className="p-3 text-center whitespace-nowrap">
                    أيام الغياب
                  </th>

                  <th className="p-3 text-center whitespace-nowrap">
                    الإجازات
                  </th>

                  <th className="p-3 text-center whitespace-nowrap">
                    إجمالي ساعات العمل
                  </th>

                  <th className="p-3 text-center whitespace-nowrap">
                    إجمالي العمل الإضافي
                  </th>

                  <th className="p-3 text-center whitespace-nowrap">
                    ساعات النقص
                  </th>

                  <th className="p-3 text-center whitespace-nowrap">
                    نسبة الالتزام
                  </th>

                </tr>

              </thead>

              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">

                {teamMonthlyData.map(
                  ({
                    emp,
                    presentDays,
                    absentDays,
                    lateDays,
                    leaveDays,
                    lateMins,
                    workedHours,
                    overtimeHoursTotal,
                    minusHoursTotal
                  }) => {

                    const totalDays =
                      presentDays +
                      absentDays;

                    const score =
                      totalDays > 0
                        ? Math.round(
                            (
                              (
                                presentDays -
                                lateDays
                              ) /
                              Math.max(
                                1,
                                totalDays
                              )
                            ) *
                              100
                          )
                        : 100;

                    return (

                      <tr
                        key={emp.id}
                        className="hover:bg-slate-50 transition"
                      >

                        <td className="p-3 font-bold text-slate-900">

                          <div className="flex items-center gap-2">

                            <span>
                              {emp.nameAr}
                            </span>

                            {emp.role ===
                              'leader' && (

                              <span className="text-[10px] bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded-full font-bold">
                                تيم ليدر
                              </span>

                            )}

                          </div>

                        </td>

                        <td className="p-3 text-slate-500">
                          {emp.department}
                        </td>

                        <td className="p-3 text-center font-mono font-bold text-emerald-700">
                          {presentDays} يوم
                        </td>

                        <td className="p-3 text-center font-mono font-bold text-amber-700">
                          {lateDays} يوم
                        </td>

                        <td className="p-3 text-center font-mono font-bold text-amber-800">
                          {lateMins} دقيقة
                        </td>

                        <td className="p-3 text-center font-mono font-bold text-rose-700">
                          {absentDays} يوم
                        </td>

                        <td className="p-3 text-center font-mono font-bold text-sky-700">
                          {leaveDays} يوم
                        </td>

                        <td className="p-3 text-center font-mono font-bold text-slate-900">
                          {formatHoursToHHMM(
                            workedHours
                          )}
                        </td>

                        <td className="p-3 text-center font-mono font-bold text-purple-700">
                          {formatHoursToHHMM(
                            overtimeHoursTotal
                          )}
                        </td>

                        <td className="p-3 text-center font-mono font-bold text-red-700">
                          {formatHoursToHHMM(
                            minusHoursTotal
                          )}
                        </td>

                        <td className="p-3 text-center font-mono font-bold">

                          <span
                            className={`px-2 py-1 rounded text-[11px] ${
                              score >= 90
                                ? 'bg-emerald-100 text-emerald-800'
                                : score >= 75
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {score}%
                          </span>

                        </td>

                      </tr>

                    );
                  }
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

      {/* CHARTS */}

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
              الأسبوع الحالي
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
                  radius={[
                    6,
                    6,
                    0,
                    0
                  ]}
                />

                <Bar
                  dataKey="late"
                  name="متأخر"
                  fill="#f59e0b"
                  radius={[
                    6,
                    6,
                    0,
                    0
                  ]}
                />

                <Bar
                  dataKey="absent"
                  name="غائب"
                  fill="#ef4444"
                  radius={[
                    6,
                    6,
                    0,
                    0
                  ]}
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
                        fill={
                          entry.color
                        }
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

      {/* DEPARTMENT */}

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
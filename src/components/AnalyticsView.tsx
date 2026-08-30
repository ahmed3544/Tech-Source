import React, { useEffect, useMemo, useState } from 'react';

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
  Award,
  Users,
  Download

} from 'lucide-react';

import {
  AttendanceRecord,
  Employee,
  LeaveRequest,
  Language
} from '../types';
import * as XLSX from 'xlsx';

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

  // =========================================================
  // GLOBAL SEARCH
  // =========================================================

  useEffect(() => {
    if (globalSearchTerm !== undefined) {
      setSearchQuery(globalSearchTerm);
    }
  }, [globalSearchTerm]);

  // =========================================================
  // AVAILABLE MONTHS
  // =========================================================

  const availableMonths = useMemo(() => {
    const months = new Set<string>();

    records.forEach(record => {
      if (record.date) {
        months.add(record.date.substring(0, 7));
      }
    });

    months.add('2026-08');

    return Array.from(months).sort((a, b) =>
      b.localeCompare(a)
    );
  }, [records]);

  // =========================================================
  // MONTH LABEL
  // =========================================================

  const getMonthLabel = (month: string) => {
    if (month === 'all') {
      return lang === 'ar'
        ? 'كل الشهور'
        : 'All Months';
    }

    const [year, monthNumber] = month.split('-');
    const date = new Date(
      Number(year),
      Number(monthNumber) - 1,
      1
    );

    return date.toLocaleDateString(
      lang === 'ar' ? 'ar-EG' : 'en-US',
      {
        month: 'long',
        year: 'numeric'
      }
    );
  };

  // =========================================================
  // FILTER EMPLOYEES
  // =========================================================

  const filteredEmployees = useMemo(() => {
    const query = searchQuery
      .toLowerCase()
      .trim();

    return employees.filter(emp => {
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
  }, [
    employees,
    searchQuery,
    selectedDept
  ]);

  // =========================================================
  // KEEP SELECTED EMPLOYEE VALID
  // =========================================================

  useEffect(() => {
    if (
      filteredEmployees.length > 0 &&
      !filteredEmployees.some(
        emp => emp.id === selectedEmpId
      )
    ) {
      setSelectedEmpId(
        filteredEmployees[0].id
      );
    }

    if (filteredEmployees.length === 0) {
      setSelectedEmpId('');
    }
  }, [
    filteredEmployees,
    selectedEmpId
  ]);

  // =========================================================
  // SELECTED EMPLOYEE
  // =========================================================

  const targetEmployee =
    employees.find(
      employee =>
        employee.id === selectedEmpId
    ) || filteredEmployees[0] || employees[0];

  // =========================================================
  // EMPLOYEE RECORDS
  // =========================================================

  const empRecords = useMemo(() => {
    if (!targetEmployee) return [];

    return records
      .filter(
        record =>
          record.employeeId ===
          targetEmployee.id
      )
      .sort((a, b) =>
        a.date.localeCompare(b.date)
      );
  }, [
    records,
    targetEmployee
  ]);

  // =========================================================
  // TEAM MONTHLY REPORT
  // =========================================================

  const teamMonthlyData = useMemo(() => {
    return employees.map(emp => {
      const empMonthRecords =
        records.filter(record => {
          if (
            record.employeeId !==
            emp.id
          ) {
            return false;
          }

          if (selectedMonth === 'all') {
            return true;
          }

          return record.date.startsWith(
            selectedMonth
          );
        });

      // -----------------------------------------------------
      // WEEKEND DAYS
      // -----------------------------------------------------

      const weekendDays =
        empMonthRecords.filter(
          record =>
            record.status === 'weekend' ||
            (
              isWeekend(record.date) &&
              !record.checkIn
            )
        ).length;

      // -----------------------------------------------------
      // PRESENT DAYS
      // -----------------------------------------------------

      const presentDays =
        empMonthRecords.filter(
          record =>
            record.checkIn &&
            record.status !== 'on_leave' &&
            record.status !== 'absent' &&
            record.status !== 'weekend' &&
            !isWeekend(record.date)
        ).length;

      // -----------------------------------------------------
      // ABSENT DAYS
      // -----------------------------------------------------

      const absentDays =
        empMonthRecords.filter(
          record =>
            record.status === 'absent' &&
            !isWeekend(record.date)
        ).length;

      // -----------------------------------------------------
      // LATE DAYS
      // -----------------------------------------------------

      const lateDays =
        empMonthRecords.filter(
          record =>
            (
              record.status === 'late' ||
              (
                record.lateMinutes &&
                record.lateMinutes > 0
              )
            ) &&
            !isWeekend(record.date)
        ).length;

      // -----------------------------------------------------
      // LEAVE DAYS
      // -----------------------------------------------------

      const leaveDays =
        empMonthRecords.filter(
          record =>
            record.status === 'on_leave' &&
            !isWeekend(record.date)
        ).length;

      // -----------------------------------------------------
      // LATE MINUTES
      // -----------------------------------------------------

      const lateMins =
        empMonthRecords.reduce(
          (total, record) => {
            if (isWeekend(record.date)) {
              return total;
            }

            return (
              total +
              (record.lateMinutes || 0)
            );
          },
          0
        );

      // -----------------------------------------------------
      // WORKED HOURS
      // -----------------------------------------------------

      const workedHours =
        empMonthRecords.reduce(
          (total, record) => {
            if (
              !isWeekend(record.date) ||
              record.checkIn
            ) {
              return (
                total +
                (record.workHours || 0)
              );
            }

            return total;
          },
          0
        );

      // -----------------------------------------------------
      // OVERTIME
      // -----------------------------------------------------

      const overtimeHoursTotal =
        empMonthRecords.reduce(
          (total, record) =>
            total +
            (record.overtimeHours || 0),
          0
        );

      // -----------------------------------------------------
      // SHORTAGE
      // -----------------------------------------------------

      const minusHoursTotal =
        empMonthRecords.reduce(
          (total, record) =>
            total +
            ((record as any).minusHours || 0),
          0
        );

      // -----------------------------------------------------
      // COMPLIANCE
      // -----------------------------------------------------

      const complianceRate =
        presentDays > 0
          ? Math.max(
              0,
              Math.round(
                (
                  (
                    presentDays -
                    lateDays
                  ) /
                  presentDays
                ) *
                  100
              )
            )
          : 0;

      return {
        emp,
        recordsCount:
          empMonthRecords.length,
        overtimeHoursTotal,
        minusHoursTotal,
        presentDays,
        absentDays,
        lateDays,
        leaveDays,
        weekendDays,
        lateMins,
        workedHours,
        complianceRate
      };
    });
  }, [
    employees,
    records,
    selectedMonth
  ]);

  // =========================================================
  // TEAM TOTALS
  // =========================================================

  const teamTotals = useMemo(() => {
    return teamMonthlyData.reduce(
      (total, item) => {
        total.presentDays +=
          item.presentDays;

        total.absentDays +=
          item.absentDays;

        total.leaveDays +=
          item.leaveDays;

        total.weekendDays +=
          item.weekendDays;

        total.lateDays +=
          item.lateDays;

        total.lateMins +=
          item.lateMins;

        total.workedHours +=
          item.workedHours;

        total.overtimeHours +=
          item.overtimeHoursTotal;

        total.minusHours +=
          item.minusHoursTotal;

        return total;
      },
      {
        presentDays: 0,
        absentDays: 0,
        leaveDays: 0,
        weekendDays: 0,
        lateDays: 0,
        lateMins: 0,
        workedHours: 0,
        overtimeHours: 0,
        minusHours: 0
      }
    );
  }, [teamMonthlyData]);

  // =========================================================
  // TEAM COMPLIANCE
  // =========================================================

  const teamComplianceRate =
    teamTotals.presentDays > 0
      ? Math.max(
          0,
          Math.round(
            (
              (
                teamTotals.presentDays -
                teamTotals.lateDays
              ) /
              teamTotals.presentDays
            ) *
              100
          )
        )
      : 0;

  // =========================================================
  // EXPORT TEAM MONTHLY REPORT
  // =========================================================

  const handleExportTeamMonthlyReport =
    () => {
      // =========================================================
      // EXPORT TEAM MONTHLY REPORT
      // =========================================================

      const isEnglish = lang === 'en';

      const exportData = teamMonthlyData.map(item => ({
        [isEnglish ? 'Employee Code' : 'كود الموظف']:
          item.emp.code,

        [isEnglish ? 'Employee Name' : 'اسم الموظف']:
          isEnglish
            ? item.emp.nameEn
            : item.emp.nameAr,

        [isEnglish ? 'Department' : 'القسم']:
          item.emp.department,

        [isEnglish ? 'Present Days' : 'أيام الحضور']:
          item.presentDays,

        [isEnglish ? 'Absent Days' : 'أيام الغياب']:
          item.absentDays,

        [isEnglish ? 'Leave Days' : 'أيام الإجازات']:
          item.leaveDays,

        [isEnglish ? 'Late Days' : 'أيام التأخير']:
          item.lateDays,

        [isEnglish ? 'Late Minutes' : 'دقائق التأخير']:
          item.lateMins,

        [isEnglish ? 'Work Hours' : 'ساعات العمل']:
          formatHoursToHHMM(item.workedHours),

        [isEnglish ? 'Overtime Hours' : 'ساعات العمل الإضافي']:
          formatHoursToHHMM(item.overtimeHoursTotal),

        [isEnglish ? 'Shortage Hours' : 'ساعات النقص']:
          formatHoursToHHMM(item.minusHoursTotal),

        [isEnglish ? 'Compliance' : 'نسبة الالتزام']:
          `${item.complianceRate}%`
      }));

      const totalRow = {
        [isEnglish ? 'Employee Code' : 'كود الموظف']:
          'TOTAL',

        [isEnglish ? 'Employee Name' : 'اسم الموظف']:
          isEnglish
            ? 'Team Total'
            : 'إجمالي الفريق',

        [isEnglish ? 'Department' : 'القسم']:
          'ALL',

        [isEnglish ? 'Present Days' : 'أيام الحضور']:
          teamTotals.presentDays,

        [isEnglish ? 'Absent Days' : 'أيام الغياب']:
          teamTotals.absentDays,

        [isEnglish ? 'Leave Days' : 'أيام الإجازات']:
          teamTotals.leaveDays,

        [isEnglish ? 'Late Days' : 'أيام التأخير']:
          teamTotals.lateDays,

        [isEnglish ? 'Late Minutes' : 'دقائق التأخير']:
          teamTotals.lateMins,

        [isEnglish ? 'Work Hours' : 'ساعات العمل']:
          formatHoursToHHMM(teamTotals.workedHours),

        [isEnglish ? 'Overtime Hours' : 'ساعات العمل الإضافي']:
          formatHoursToHHMM(teamTotals.overtimeHours),

        [isEnglish ? 'Shortage Hours' : 'ساعات النقص']:
          formatHoursToHHMM(teamTotals.minusHours),

        [isEnglish ? 'Compliance' : 'نسبة الالتزام']:
          `${teamComplianceRate}%`
      };

      exportToCSV(
        [...exportData, totalRow],
        `Overall_Report_${selectedMonth}`
      );
    };

  // =========================================================
  // EXPORT EMPLOYEE REPORT
  // =========================================================

  const handleExportEmployeeReport =    () => {
      if (!targetEmployee) {
        return;
      }

      const isEnglish =
        lang === 'en';

      const exportData =
        empRecords.map(record => ({
          [isEnglish
            ? 'Employee Code'
            : 'كود الموظف']:
            targetEmployee.code,

          [isEnglish
            ? 'Employee Name (Arabic)'
            : 'اسم الموظف بالعربي']:
            targetEmployee.nameAr,

          [isEnglish
            ? 'Employee Name (English)'
            : 'اسم الموظف بالإنجليزية']:
            targetEmployee.nameEn,

          [isEnglish
            ? 'Department'
            : 'القسم']:
            targetEmployee.department,

          [isEnglish
            ? 'Date'
            : 'التاريخ']:
            record.date,

          [isEnglish
            ? 'Check-in Time'
            : 'وقت الدخول']:
            record.checkIn
              ? formatTime(
                  record.checkIn,
                  lang
                )
              : '--:--',

          [isEnglish
            ? 'Check-out Time'
            : 'وقت الخروج']:
            record.checkOut
              ? formatTime(
                  record.checkOut,
                  lang
                )
              : '--:--',

          [isEnglish
            ? 'Work Hours'
            : 'ساعات العمل']:
            record.checkOut
              ? formatHoursToHHMM(
                  record.workHours || 0
                )
              : '--',

          [isEnglish
            ? 'Overtime'
            : 'العمل الإضافي']:
            record.checkOut
              ? formatHoursToHHMM(
                  record.overtimeHours ||
                    0
                )
              : '--',

          [isEnglish
            ? 'Shortage Hours'
            : 'ساعات النقص']:
            record.checkOut
              ? formatHoursToHHMM(
                  (record as any)
                    .minusHours || 0
                )
              : '--',

          [isEnglish
            ? 'Late Minutes'
            : 'التأخير بالدقائق']:
            record.lateMinutes || 0,

          [isEnglish
            ? 'Status'
            : 'الحالة']:
            getStatusText(
              record.status,
              lang,
              record.leaveType,
              record.notes
            ),

          [isEnglish
            ? 'Notes'
            : 'ملاحظات']:
            record.notes || ''
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
  // EMPLOYEE STATISTICS
  // =========================================================

  const totalPresentDays =
    empRecords.filter(
      record =>
        record.checkIn &&
        record.status !== 'on_leave' &&
        record.status !== 'absent' &&
        record.status !== 'weekend' &&
        !isWeekend(record.date)
    ).length;

  const totalWeekendDays =
    empRecords.filter(
      record =>
        record.status === 'weekend' ||
        (
          isWeekend(record.date) &&
          !record.checkIn
        )
    ).length;

  const totalAbsentDays =
    empRecords.filter(
      record =>
        record.status === 'absent' &&
        !isWeekend(record.date)
    ).length;

  const totalLateDays =
    empRecords.filter(
      record =>
        (
          record.status === 'late' ||
          (
            record.lateMinutes &&
            record.lateMinutes > 0
          )
        ) &&
        !isWeekend(record.date)
    ).length;

  const totalWorkedHours =
    empRecords.reduce(
      (total, record) =>
        total +
        (
          !isWeekend(record.date) ||
          record.checkIn
            ? record.workHours || 0
            : 0
        ),
      0
    );

  const totalOvertimeHours =
    empRecords.reduce(
      (total, record) =>
        total +
        (record.overtimeHours || 0),
      0
    );

  const totalMinusHours =
    empRecords.reduce(
      (total, record) =>
        total +
        ((record as any).minusHours || 0),
      0
    );

  const totalLateMinutes =
    empRecords.reduce(
      (total, record) =>
        total +
        (
          !isWeekend(record.date)
            ? record.lateMinutes || 0
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
    if (!targetEmployee) {
      return 0;
    }

    return leaveRequests
      .filter(
        request =>
          request.employeeId ===
            targetEmployee.id &&
          request.status === 'approved' &&
          types.includes(request.type)
      )
      .reduce(
        (total, request) =>
          total +
          calculateWorkDaysInPeriod(
            request.startDate,
            request.endDate
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
    targetEmployee?.casualLeaveBalance ??
    7;

  const regularBalance =
    targetEmployee?.regularLeaveBalance ??
    8;

  const sickBalance =
    targetEmployee?.sickLeaveBalance ??
    30;

  // =========================================================
  // WEEKLY CHART
  // =========================================================

  const weeklyData = useMemo(() => {
    const days = [
      {
        key: 0,
        ar: 'الأحد',
        en: 'Sunday'
      },
      {
        key: 1,
        ar: 'الإثنين',
        en: 'Monday'
      },
      {
        key: 2,
        ar: 'الثلاثاء',
        en: 'Tuesday'
      },
      {
        key: 3,
        ar: 'الأربعاء',
        en: 'Wednesday'
      },
      {
        key: 4,
        ar: 'الخميس',
        en: 'Thursday'
      }
    ];

    return days.map(day => {
      const dayRecords =
        records.filter(record => {
          const date =
            new Date(
              `${record.date}T00:00:00`
            );

          return (
            date.getDay() ===
            day.key
          );
        });

      return {
        day:
          lang === 'en'
            ? day.en
            : day.ar,

        present:
          dayRecords.filter(
            record =>
              record.checkIn &&
              record.status !==
                'absent' &&
              record.status !==
                'on_leave'
          ).length,

        late:
          dayRecords.filter(
            record =>
              record.status ===
                'late' ||
              (
                record.lateMinutes &&
                record.lateMinutes > 0
              )
          ).length,

        absent:
          dayRecords.filter(
            record =>
              record.status ===
              'absent'
          ).length
      };
    });
  }, [
    records,
    lang
  ]);

  // =========================================================
  // STATUS COUNTS
  // =========================================================

  const statusCounts = useMemo(
    () => ({
      on_time:
        records.filter(
          record =>
            record.status ===
            'on_time'
        ).length,

      late:
        records.filter(
          record =>
            record.status === 'late' ||
            (
              record.lateMinutes &&
              record.lateMinutes > 0
            )
        ).length,

      early_leave:
        records.filter(
          record =>
            record.status ===
            'early_leave'
        ).length,

      overtime:
        records.filter(
          record =>
            record.status ===
              'overtime' ||
            (
              record.overtimeHours &&
              record.overtimeHours > 0
            )
        ).length,

      absent:
        records.filter(
          record =>
            record.status ===
            'absent'
        ).length,

      on_leave:
        records.filter(
          record =>
            record.status ===
            'on_leave'
        ).length
    }),
    [records]
  );

  // =========================================================
  // PIE CHART
  // =========================================================

  const rawPieData = [
    {
      name:
        lang === 'en'
          ? 'On Time'
          : 'حاضر في الوقت',
      value:
        statusCounts.on_time,
      color: '#10b981'
    },

    {
      name:
        lang === 'en'
          ? 'Late'
          : 'متأخر',
      value:
        statusCounts.late,
      color: '#f59e0b'
    },

    {
      name:
        lang === 'en'
          ? 'Overtime'
          : 'ساعات إضافية',
      value:
        statusCounts.overtime,
      color: '#8b5cf6'
    },

    {
      name:
        lang === 'en'
          ? 'Early Leave'
          : 'انصراف مبكر',
      value:
        statusCounts.early_leave,
      color: '#f97316'
    },

    {
      name:
        lang === 'en'
          ? 'Absent'
          : 'غائب',
      value:
        statusCounts.absent,
      color: '#ef4444'
    },

    {
      name:
        lang === 'en'
          ? 'On Leave'
          : 'في إجازة',
      value:
        statusCounts.on_leave,
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

  const deptHoursData =
    useMemo(() => {
      const departmentMap =
        new Map<
          string,
          {
            hours: number;
            overtime: number;
          }
        >();

      records.forEach(record => {
        const employee =
          employees.find(
            emp =>
              emp.id ===
              record.employeeId
          );

        if (!employee) {
          return;
        }

        const department =
          employee.department ||
          'Other';

        const current =
          departmentMap.get(
            department
          ) || {
            hours: 0,
            overtime: 0
          };

        current.hours +=
          record.workHours || 0;

        current.overtime +=
          record.overtimeHours || 0;

        departmentMap.set(
          department,
          current
        );
      });

      return Array.from(
        departmentMap.entries()
      ).map(
        ([
          department,
          values
        ]) => ({
          department,
          hours:
            Number(
              values.hours.toFixed(2)
            ),
          overtime:
            Number(
              values.overtime.toFixed(2)
            )
        })
      );
    }, [
      records,
      employees
    ]);

  // =========================================================
  // RENDER
  // =========================================================

  return (
    <div
      className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6 animate-fade-in"
      dir={
        lang === 'ar'
          ? 'rtl'
          : 'ltr'
      }
    >

      {/* =====================================================
          TEAM OVERALL MONTHLY REPORT
      ===================================================== */}

      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-6">

        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">

          <div>

            <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2.5 flex-wrap">

              <Users className="w-5 h-5 text-emerald-600" />

              <span>
                {lang === 'ar'
                  ? 'Overall Report - تقرير كل الموظفين'
                  : 'Overall Employee Monthly Report'}
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
                ? 'تقرير شامل لجميع الموظفين في شيت واحدة حسب الشهر المختار'
                : 'Complete monthly report for all employees in one Excel-compatible sheet'}

            </p>

          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">

            {/* MONTH SELECT */}

            <div className="flex items-center gap-2">

              <Calendar className="w-4 h-4 text-slate-500" />

              <select
                value={selectedMonth}
                onChange={e =>
                  setSelectedMonth(
                    e.target.value
                  )
                }
                className="text-xs bg-white border border-slate-200 rounded-xl px-3 py-2.5 font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >

                {availableMonths.map(
                  month => (
                    <option
                      key={month}
                      value={month}
                    >
                      {getMonthLabel(
                        month
                      )}
                    </option>
                  )
                )}

                <option value="all">
                  {lang === 'ar'
                    ? 'كل الشهور'
                    : 'All Months'}
                </option>

              </select>

            </div>

            {/* EXPORT TEAM */}

            <button
              onClick={
                handleExportTeamMonthlyReport
              }
              disabled={
                employees.length === 0
              }
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs shadow-md transition-all"
            >

              <Download className="w-4 h-4" />

              <span>
                {lang === 'ar'
                  ? 'تصدير Overall لكل الموظفين'
                  : 'Export Overall Report'}
              </span>

            </button>

          </div>

        </div>

        {/* =====================================================
            TEAM SUMMARY
        ===================================================== */}

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">

          <div className="bg-emerald-50 p-3.5 rounded-2xl border border-emerald-200">

            <div className="text-[11px] font-bold text-emerald-800">
              {lang === 'ar'
                ? 'الحضور'
                : 'Present'}
            </div>

            <div className="text-2xl font-black font-mono text-emerald-700 mt-1">
              {toWesternDigits(
                teamTotals.presentDays
              )}
            </div>

          </div>

          <div className="bg-rose-50 p-3.5 rounded-2xl border border-rose-200">

            <div className="text-[11px] font-bold text-rose-800">
              {lang === 'ar'
                ? 'الغياب'
                : 'Absent'}
            </div>

            <div className="text-2xl font-black font-mono text-rose-700 mt-1">
              {toWesternDigits(
                teamTotals.absentDays
              )}
            </div>

          </div>

          <div className="bg-blue-50 p-3.5 rounded-2xl border border-blue-200">

            <div className="text-[11px] font-bold text-blue-800">
              {lang === 'ar'
                ? 'الإجازات'
                : 'Leaves'}
            </div>

            <div className="text-2xl font-black font-mono text-blue-700 mt-1">
              {toWesternDigits(
                teamTotals.leaveDays
              )}
            </div>

          </div>

          <div className="bg-amber-50 p-3.5 rounded-2xl border border-amber-200">

            <div className="text-[11px] font-bold text-amber-800">
              {lang === 'ar'
                ? 'أيام التأخير'
                : 'Late Days'}
            </div>

            <div className="text-2xl font-black font-mono text-amber-700 mt-1">
              {toWesternDigits(
                teamTotals.lateDays
              )}
            </div>

          </div>

          <div className="bg-purple-50 p-3.5 rounded-2xl border border-purple-200">

            <div className="text-[11px] font-bold text-purple-800">
              {lang === 'ar'
                ? 'الإضافي'
                : 'Overtime'}
            </div>

            <div className="text-2xl font-black font-mono text-purple-700 mt-1">
              {formatHoursToHHMM(
                teamTotals.overtimeHours
              )}
            </div>

          </div>

          <div className="bg-red-50 p-3.5 rounded-2xl border border-red-200">

            <div className="text-[11px] font-bold text-red-800">
              {lang === 'ar'
                ? 'ساعات النقص'
                : 'Shortage'}
            </div>

            <div className="text-2xl font-black font-mono text-red-700 mt-1">
              {formatHoursToHHMM(
                teamTotals.minusHours
              )}
            </div>

          </div>

          <div className="bg-cyan-50 p-3.5 rounded-2xl border border-cyan-200">

            <div className="text-[11px] font-bold text-cyan-800">
              {lang === 'ar'
                ? 'ساعات العمل'
                : 'Work Hours'}
            </div>

            <div className="text-2xl font-black font-mono text-cyan-700 mt-1">
              {formatHoursToHHMM(
                teamTotals.workedHours
              )}
            </div>

          </div>

          <div className="bg-slate-900 p-3.5 rounded-2xl border border-slate-800">

            <div className="text-[11px] font-bold text-slate-300">
              {lang === 'ar'
                ? 'التزام الفريق'
                : 'Team Compliance'}
            </div>

            <div className="text-2xl font-black font-mono text-emerald-400 mt-1">
              {toWesternDigits(
                teamComplianceRate
              )}
              %
            </div>

          </div>

        </div>

        {/* =====================================================
            TEAM TABLE
        ===================================================== */}

        <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white">

          <div className="bg-slate-50 p-3.5 border-b border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">

            <h4 className="font-bold text-slate-900 text-xs flex items-center gap-2">

              <Users className="w-4 h-4 text-emerald-600" />

              <span>
                {lang === 'ar'
                  ? `التقرير الشامل - ${getMonthLabel(
                      selectedMonth
                    )}`
                  : `Overall Report - ${getMonthLabel(
                      selectedMonth
                    )}`}
              </span>

            </h4>

            <span className="text-[11px] font-mono text-slate-500 font-semibold">

              {toWesternDigits(
                employees.length
              )}{' '}

              {lang === 'ar'
                ? 'موظف'
                : 'employees'}

            </span>

          </div>

          <div className="overflow-x-auto">

            <table className="w-full text-right text-xs min-w-[1200px]">

              <thead>

                <tr className="bg-slate-100 text-slate-600 font-bold border-b border-slate-200 whitespace-nowrap">

                  <th className="py-3 px-4">
                    {lang === 'ar'
                      ? 'كود الموظف'
                      : 'Employee Code'}
                  </th>

                  <th className="py-3 px-4">
                    {lang === 'ar'
                      ? 'اسم الموظف'
                      : 'Employee Name'}
                  </th>

                  <th className="py-3 px-4">
                    {lang === 'ar'
                      ? 'القسم'
                      : 'Department'}
                  </th>

                  <th className="py-3 px-4">
                    {lang === 'ar'
                      ? 'الحضور'
                      : 'Present'}
                  </th>

                  <th className="py-3 px-4">
                    {lang === 'ar'
                      ? 'الغياب'
                      : 'Absent'}
                  </th>

                  <th className="py-3 px-4">
                    {lang === 'ar'
                      ? 'الإجازات'
                      : 'Leaves'}
                  </th>

                  <th className="py-3 px-4">
                    {lang === 'ar'
                      ? 'التأخير'
                      : 'Late Days'}
                  </th>

                  <th className="py-3 px-4">
                    {lang === 'ar'
                      ? 'دقائق التأخير'
                      : 'Late Minutes'}
                  </th>

                  <th className="py-3 px-4">
                    {lang === 'ar'
                      ? 'ساعات العمل'
                      : 'Work Hours'}
                  </th>

                  <th className="py-3 px-4">
                    {lang === 'ar'
                      ? 'الإضافي'
                      : 'Overtime'}
                  </th>

                  <th className="py-3 px-4">
                    {lang === 'ar'
                      ? 'النقص'
                      : 'Shortage'}
                  </th>

                  <th className="py-3 px-4">
                    {lang === 'ar'
                      ? 'الالتزام'
                      : 'Compliance'}
                  </th>

                </tr>

              </thead>

              <tbody className="divide-y divide-slate-100">

                {teamMonthlyData.map(
                  item => (

                    <tr
                      key={item.emp.id}
                      className="hover:bg-slate-50 transition-colors"
                    >

                      <td className="py-3 px-4 font-mono font-bold text-slate-800">
                        {item.emp.code}
                      </td>

                      <td className="py-3 px-4 font-bold text-slate-800">
                        {lang === 'ar'
                          ? item.emp.nameAr
                          : item.emp.nameEn}
                      </td>

                      <td className="py-3 px-4 text-slate-600">
                        {item.emp.department}
                      </td>

                      <td className="py-3 px-4 font-mono font-bold text-emerald-700">
                        {toWesternDigits(
                          item.presentDays
                        )}
                      </td>

                      <td className="py-3 px-4 font-mono font-bold text-red-700">
                        {toWesternDigits(
                          item.absentDays
                        )}
                      </td>

                      <td className="py-3 px-4 font-mono font-bold text-blue-700">
                        {toWesternDigits(
                          item.leaveDays
                        )}
                      </td>

                      <td className="py-3 px-4 font-mono font-bold text-amber-700">
                        {toWesternDigits(
                          item.lateDays
                        )}
                      </td>

                      <td className="py-3 px-4 font-mono font-bold text-amber-700">
                        {toWesternDigits(
                          item.lateMins
                        )}
                      </td>

                      <td className="py-3 px-4 font-mono font-bold text-cyan-700">
                        {formatHoursToHHMM(
                          item.workedHours
                        )}
                      </td>

                      <td className="py-3 px-4 font-mono font-bold text-purple-700">
                        {formatHoursToHHMM(
                          item.overtimeHoursTotal
                        )}
                      </td>

                      <td className="py-3 px-4 font-mono font-bold text-red-700">
                        {formatHoursToHHMM(
                          item.minusHoursTotal
                        )}
                      </td>

                      <td className="py-3 px-4">

                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-bold ${
                            item.complianceRate >= 90
                              ? 'bg-emerald-100 text-emerald-700'
                              : item.complianceRate >= 75
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {toWesternDigits(
                            item.complianceRate
                          )}
                          %
                        </span>

                      </td>

                    </tr>

                  )
                )}

                {/* =================================================
                    TOTAL ROW
                ================================================= */}

                <tr className="bg-slate-900 text-white font-black">

                  <td className="py-3 px-4 font-mono">
                    TOTAL
                  </td>

                  <td className="py-3 px-4">
                    {lang === 'ar'
                      ? 'إجمالي الفريق'
                      : 'Team Total'}
                  </td>

                  <td className="py-3 px-4">
                    ALL
                  </td>

                  <td className="py-3 px-4 font-mono text-emerald-400">
                    {toWesternDigits(
                      teamTotals.presentDays
                    )}
                  </td>

                  <td className="py-3 px-4 font-mono text-red-400">
                    {toWesternDigits(
                      teamTotals.absentDays
                    )}
                  </td>

                  <td className="py-3 px-4 font-mono text-blue-400">
                    {toWesternDigits(
                      teamTotals.leaveDays
                    )}
                  </td>

                  <td className="py-3 px-4 font-mono text-amber-400">
                    {toWesternDigits(
                      teamTotals.lateDays
                    )}
                  </td>

                  <td className="py-3 px-4 font-mono text-amber-400">
                    {toWesternDigits(
                      teamTotals.lateMins
                    )}
                  </td>

                  <td className="py-3 px-4 font-mono text-cyan-400">
                    {formatHoursToHHMM(
                      teamTotals.workedHours
                    )}
                  </td>

                  <td className="py-3 px-4 font-mono text-purple-400">
                    {formatHoursToHHMM(
                      teamTotals.overtimeHours
                    )}
                  </td>

                  <td className="py-3 px-4 font-mono text-red-400">
                    {formatHoursToHHMM(
                      teamTotals.minusHours
                    )}
                  </td>

                  <td className="py-3 px-4 font-mono text-emerald-400">
                    {toWesternDigits(
                      teamComplianceRate
                    )}
                    %
                  </td>

                </tr>

              </tbody>

            </table>

          </div>

        </div>

      </div>

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
                  ? 'البحث والتقارير الفردية'
                  : 'Employee Search & Reports'}
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
                  ? 'تصدير التقرير لشيت اكسيل'
                  : 'Export Report to Excel'}
              </span>

            </button>

          </div>

        </div>

        {/* =====================================================
            SEARCH
        ===================================================== */}

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

              {filteredEmployees.length >
              0 ? (
                filteredEmployees.map(
                  emp => (
                    <option
                      key={emp.id}
                      value={emp.id}
                    >
                      {emp.code} -{' '}
                      {emp.nameAr}
                    </option>
                  )
                )
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

          </div>

        </div>

        {/* =====================================================
            EXTRA HOURS
        ===================================================== */}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">

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
                      targetEmployee?.nameAr ||
                      ''
                    })`
                  : `Attendance details for ${
                      targetEmployee?.nameEn ||
                      ''
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

                  <th className="py-3 px-4">
                    {lang === 'ar'
                      ? 'التاريخ'
                      : 'Date'}
                  </th>

                  <th className="py-3 px-4">
                    {lang === 'ar'
                      ? 'وقت تسجيل الدخول (12H)'
                      : 'Check-in Time (12H)'}
                  </th>

                  <th className="py-3 px-4">
                    {lang === 'ar'
                      ? 'وقت تسجيل الخروج (12H)'
                      : 'Check-out Time (12H)'}
                  </th>

                  <th className="py-3 px-4">
                    {lang === 'ar'
                      ? 'ساعات العمل'
                      : 'Work Hours'}
                  </th>

                  <th className="py-3 px-4">
                    {lang === 'ar'
                      ? 'العمل الإضافي'
                      : 'Overtime'}
                  </th>

                  <th className="py-3 px-4">
                    {lang === 'ar'
                      ? 'ساعات النقص'
                      : 'Shortage Hours'}
                  </th>

                  <th className="py-3 px-4">
                    {lang === 'ar'
                      ? 'دقائق التأخير'
                      : 'Late Minutes'}
                  </th>

                  <th className="py-3 px-4">
                    {lang === 'ar'
                      ? 'الحالة'
                      : 'Status'}
                  </th>

                </tr>

              </thead>

              <tbody className="divide-y divide-slate-100 font-sans">

                {empRecords.length >
                0 ? (

                  empRecords.map(
                    record => (

                      <tr
                        key={
                          record.id
                        }
                        className="hover:bg-slate-50 transition-colors"
                      >

                        <td className="py-3 px-4 font-mono font-bold text-slate-800">

                          {toWesternDigits(
                            record.date
                          )}

                        </td>

                        <td className="py-3 px-4 font-mono font-bold text-emerald-700">

                          {record.checkIn
                            ? formatTime(
                                record.checkIn,
                                lang
                              )
                            : '--:--'}

                        </td>

                        <td className="py-3 px-4 font-mono font-bold text-slate-800">

                          {record.checkOut
                            ? formatTime(
                                record.checkOut,
                                lang
                              )
                            : '--:--'}

                        </td>

                        <td className="py-3 px-4 font-mono font-bold text-blue-700">

                          {record.checkOut
                            ? formatHoursToHHMM(
                                record.workHours ||
                                  0
                              )
                            : '--'}

                        </td>

                        <td className="py-3 px-4 font-mono font-bold text-purple-700">

                          {record.checkOut
                            ? formatHoursToHHMM(
                                record.overtimeHours ||
                                  0
                              )
                            : '--'}

                        </td>

                        <td className="py-3 px-4 font-mono font-bold text-red-700">

                          {record.checkOut
                            ? formatHoursToHHMM(
                                (
                                  record as any
                                )
                                  .minusHours ||
                                  0
                              )
                            : '--'}

                        </td>

                        <td className="py-3 px-4 font-mono font-bold text-amber-700">

                          {toWesternDigits(
                            record.lateMinutes ||
                              0
                          )}

                        </td>

                        <td className="py-3 px-4">

                          <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-bold whitespace-nowrap">

                            {getStatusText(
                              record.status,
                              lang,
                              record.leaveType,
                              record.notes
                            )}

                          </span>

                        </td>

                      </tr>

                    )
                  )

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
          SYSTEM ANALYTICS HEADER
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
                ? 'حسب السجلات الحالية'
                : 'Based on current records'}

            </span>

          </div>

          <div className="h-64">

            <ResponsiveContainer
              width="100%"
              height="100%"
            >

              <BarChart
                data={weeklyData}
              >

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
                    borderRadius:
                      '12px',
                    borderColor:
                      '#e2e8f0',
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
                  name={
                    lang === 'ar'
                      ? 'حاضر'
                      : 'Present'
                  }
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
                  name={
                    lang === 'ar'
                      ? 'متأخر'
                      : 'Late'
                  }
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
                  name={
                    lang === 'ar'
                      ? 'غائب'
                      : 'Absent'
                  }
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
                    (
                      entry,
                      index
                    ) => (

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
                    borderRadius:
                      '12px',
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
          DEPARTMENT ANALYTICS
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
              data={
                deptHoursData
              }
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
                  borderRadius:
                    '12px',
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
                name={
                  lang === 'ar'
                    ? 'ساعات العمل الأساسية'
                    : 'Regular Work Hours'
                }
                stroke="#0284c7"
                fill="#e0f2fe"
                strokeWidth={2}
              />

              <Area
                type="monotone"
                dataKey="overtime"
                name={
                  lang === 'ar'
                    ? 'الساعات الإضافية'
                    : 'Overtime Hours'
                }
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
import { AttendanceRecord, LeaveRequest, Employee, OfficialHoliday } from '../types';
import { calculateRecordWorkHours, isWeekend, calculateWorkDaysInPeriod } from './helpers';
import { INITIAL_OFFICIAL_HOLIDAYS } from '../mockData';

export interface PenaltyDetail {
  id: string;
  date: string;
  type: 'late_15' | 'late_60' | 'late_over60' | 'absent_unexcused';
  titleAr: string;
  titleEn: string;
  lateMinutes: number;
  occurrenceCount: number; // 1st, 2nd, 3rd, 4th time in month
  penaltyDays: number; // 0, 0.25, 0.5, 1.0, 2.0, 3.0, 5.0
  penaltyDescriptionAr: string;
  penaltyDescriptionEn: string;
  hasApprovedPermission?: boolean;
  isExcusedByLeader?: boolean;
  excusedReason?: string;
}

export interface MonthlyEmployeeSummary {
  month: string; // YYYY-MM
  employeeId: string;
  // Attendance & Time
  totalWorkHours: number;
  totalLateMinutes: number;
  daysPresent: number;
  daysAbsent: number;
  daysOnLeave: number;
  daysWeekend: number;
  expectedWorkDays: number;
  // Official Holidays
  officialHolidaysInMonthCount: number;
  officialHolidaysList: OfficialHoliday[];
  // Annual Leaves Breakdown (7 Casual + 8 Regular = 15 Total)
  totalAnnualBalance: number;
  casualLeaveBalance: number;
  regularLeaveBalance: number;
  usedCasualDaysAllTime: number;
  remainingCasualDays: number;
  usedRegularDaysAllTime: number;
  remainingRegularDays: number;
  usedAnnualDaysAllTime: number;
  usedAnnualDaysInMonth: number;
  remainingAnnualDays: number;
  // Sick Leave Metrics
  sickLeaveBalance: number;
  usedSickDaysAllTime: number;
  remainingSickDays: number;
  usedSickDaysInMonth: number;
  // Monthly Permissions (Max 2 per month, Max 2h per permission)
  usedPermissionsCount: number;
  remainingPermissionsCount: number;
  maxPermissionsPerMonth: number;
  maxHoursPerPermission: number;
  monthPermissions: LeaveRequest[];
  // Company Penalties
  penalties: PenaltyDetail[];
  totalDeductionDays: number;
}

/**
 * Calculate complete monthly performance, annual leaves, permission quotas,
 * and company bylaws penalties for a specific employee and month (YYYY-MM).
 */
export function calculateMonthlyEmployeeSummary(
  employee: Employee,
  month: string, // YYYY-MM (e.g. "2026-08")
  attendanceRecords: AttendanceRecord[],
  leaveRequests: LeaveRequest[],
  officialHolidays: OfficialHoliday[] = INITIAL_OFFICIAL_HOLIDAYS
): MonthlyEmployeeSummary {
  const empId = employee.id;

  // Official Holidays in the selected month
  const isAllMonths = !month || month === 'all';
  const officialHolidaysList = officialHolidays.filter(
    h => isAllMonths || h.startDate.startsWith(month) || h.endDate.startsWith(month)
  );
  const officialHolidaysInMonthCount = officialHolidaysList.reduce((acc, h) => acc + (h.daysCount || 1), 0);

  // 1. Filter attendance records for this employee in the selected month
  const empMonthRecords = attendanceRecords
    .filter(r => r.employeeId === empId && (isAllMonths || r.date.startsWith(month)))
    .sort((a, b) => a.date.localeCompare(b.date));

  // All time records for hours / days calculation
  const empAllRecords = attendanceRecords.filter(r => r.employeeId === empId);

  // 2. Attendance & Time Metrics for Month
  let totalWorkHours = 0;
  let totalLateMinutes = 0;
  let daysPresent = 0;
  let daysAbsent = 0;
  let daysOnLeave = 0;
  let daysWeekend = 0;

  empMonthRecords.forEach(r => {
    const isWknd = isWeekend(r.date) || r.status === 'weekend';
    if (isWknd) {
      daysWeekend++;
      // If employee actually clocked in for overtime on weekend
      if (r.checkIn && r.workHours && r.workHours > 0) {
        totalWorkHours += r.workHours;
      }
      return;
    }

    const recordHours = (r.workHours && r.workHours > 0) ? r.workHours : calculateRecordWorkHours(r);
    totalWorkHours += recordHours;

    const isExcused = Boolean(r.isExcused);
    const hasPermission = leaveRequests.some(
      l => l.employeeId === empId && l.type === 'permission' && l.status === 'approved' && r.date >= l.startDate && r.date <= l.endDate
    );

    if (!hasPermission && !isExcused) {
      totalLateMinutes += r.lateMinutes || 0;
    }

    if (r.status === 'on_leave') {
      daysOnLeave++;
    } else if (r.status === 'absent' && !hasPermission && !isExcused) {
      daysAbsent++;
    } else if (r.checkIn) {
      daysPresent++;
    }
  });

  // Calculate expected work days in month (excluding Fridays and Saturdays)
  const [mYear, mMonth] = (isAllMonths ? '2026-08' : month).split('-').map(Number);
  const totalDaysInMonth = new Date(mYear, mMonth, 0).getDate();
  const monthStartStr = `${mYear}-${String(mMonth).padStart(2, '0')}-01`;
  const monthEndStr = `${mYear}-${String(mMonth).padStart(2, '0')}-${String(totalDaysInMonth).padStart(2, '0')}`;
  const expectedWorkDays = calculateWorkDaysInPeriod(monthStartStr, monthEndStr);

  // 3. Annual Leave Calculations (Casual: 7 days, Regular: 8 days -> Total: 15 days)
  const empApprovedLeaves = leaveRequests.filter(
    l => l.employeeId === empId && l.status === 'approved'
  );

  const calculateLeaveDays = (req: LeaveRequest) => {
    return calculateWorkDaysInPeriod(req.startDate, req.endDate);
  };

  // Casual & Emergency leaves (عارضة / طارئة)
  const usedCasualDaysAllTime = empApprovedLeaves
    .filter(l => l.type === 'casual' || l.type === 'emergency')
    .reduce((acc, req) => acc + calculateLeaveDays(req), 0);

  // Regular leaves (اعتيادي)
  const usedRegularDaysAllTime = empApprovedLeaves
    .filter(l => l.type === 'regular')
    .reduce((acc, req) => acc + calculateLeaveDays(req), 0);

  // Pure Annual leaves (سنوية اعتيادية)
  const usedPureAnnualDaysAllTime = empApprovedLeaves
    .filter(l => l.type === 'annual')
    .reduce((acc, req) => acc + calculateLeaveDays(req), 0);

  // Total used annual days across all annual sub-types
  const usedAnnualDaysAllTime = usedCasualDaysAllTime + usedRegularDaysAllTime + usedPureAnnualDaysAllTime;

  const usedAnnualDaysInMonth = empApprovedLeaves
    .filter(l => (l.type === 'annual' || l.type === 'casual' || l.type === 'regular' || l.type === 'emergency') && (isAllMonths || l.startDate.startsWith(month)))
    .reduce((acc, req) => acc + calculateLeaveDays(req), 0);

  const casualLeaveBalance = employee.casualLeaveBalance ?? 7;
  const regularLeaveBalance = employee.regularLeaveBalance ?? 8;
  const totalAnnualBalance = (employee.annualLeaveBalance && employee.annualLeaveBalance > 0)
    ? employee.annualLeaveBalance
    : (casualLeaveBalance + regularLeaveBalance);

  const remainingCasualDays = Math.max(0, casualLeaveBalance - usedCasualDaysAllTime);
  const remainingRegularDays = Math.max(0, regularLeaveBalance - usedRegularDaysAllTime - usedPureAnnualDaysAllTime);
  const remainingAnnualDays = Math.max(0, totalAnnualBalance - usedAnnualDaysAllTime);

  // Sick Leaves (إجازات مرضية)
  const sickLeaveBalance = employee.sickLeaveBalance ?? 30;
  const usedSickDaysAllTime = empApprovedLeaves
    .filter(l => l.type === 'sick')
    .reduce((acc, req) => acc + calculateLeaveDays(req), 0);
  const usedSickDaysInMonth = empApprovedLeaves
    .filter(l => l.type === 'sick' && (isAllMonths || l.startDate.startsWith(month)))
    .reduce((acc, req) => acc + calculateLeaveDays(req), 0);
  const remainingSickDays = Math.max(0, sickLeaveBalance - usedSickDaysAllTime);

  // 4. Monthly Permissions (2 per month, max 2h each)
  const monthPermissions = leaveRequests.filter(
    l => l.employeeId === empId &&
         l.type === 'permission' &&
         (isAllMonths || l.startDate.startsWith(month)) &&
         l.status !== 'rejected' // Count active (approved & pending) permissions toward quota
  );

  const usedPermissionsCount = monthPermissions.length;
  const maxPermissionsPerMonth = 2;
  const maxHoursPerPermission = 2;
  const remainingPermissionsCount = Math.max(0, maxPermissionsPerMonth - usedPermissionsCount);

  // Approved permissions list for excusing late check-ins / early leave
  const approvedPermissions = leaveRequests.filter(
    l => l.employeeId === empId && l.type === 'permission' && l.status === 'approved'
  );

  const getApprovedPermissionForDate = (dateStr: string) => {
    return approvedPermissions.find(l => dateStr >= l.startDate && dateStr <= l.endDate);
  };

  // 5. Company Bylaws Penalties Breakdown
  const penalties: PenaltyDetail[] = [];
  let tier1_count = 0; // 1-15 min late
  let tier2_count = 0; // 16-60 min late
  let tier3_count = 0; // >60 min late or unexcused absence

  empMonthRecords.forEach(r => {
    // Weekend days (Friday & Saturday) are fixed weekly off days - no penalties apply
    if (isWeekend(r.date)) return;

    // Check if record was manually excused by Team Leader / Admin
    if (r.isExcused) {
      penalties.push({
        id: `pen-exc-leader-${r.id}`,
        date: r.date,
        type: r.status === 'absent' ? 'absent_unexcused' : 'late_15',
        titleAr: `${r.status === 'absent' ? 'غياب' : `تأخير (${r.lateMinutes || 0} دقيقة)`} - (معفى من الخصم 🛡️)`,
        titleEn: `${r.status === 'absent' ? 'Absence' : `Lateness (${r.lateMinutes || 0}m)`} - Excused by Leader`,
        lateMinutes: r.lateMinutes || 0,
        occurrenceCount: 0,
        penaltyDays: 0,
        penaltyDescriptionAr: r.excusedReason
          ? `إعفاء إداري معتمد من التيم ليدر: ${r.excusedReason}`
          : 'تم إلغاء الخصم وإعفاء الموظف تماماً بواسطة التيم ليدر 🛡️',
        penaltyDescriptionEn: r.excusedReason
          ? `Leader Excuse: ${r.excusedReason}`
          : 'Deduction cancelled & excused by Team Leader',
        hasApprovedPermission: false,
        isExcusedByLeader: true,
        excusedReason: r.excusedReason,
      });
      return;
    }

    const approvedPerm = getApprovedPermissionForDate(r.date);
    const hasPermission = Boolean(approvedPerm);

    // If there is an approved permission on this day (first half, second half, or custom), no penalty/deduction applies
    if (hasPermission) {
      const slot = approvedPerm?.permissionSlot;
      const slotLabel = slot === 'first_half' ? 'أول اليوم (صباحي)' : slot === 'second_half' ? 'آخر اليوم (مسائي)' : 'استئذان رسمي';
      
      penalties.push({
        id: `pen-exc-permission-${r.id}`,
        date: r.date,
        type: 'late_15',
        titleAr: `إذن معتمد (${slotLabel}) - معفى من الخصم`,
        titleEn: `Permission Approved (${slot || 'official'}) - Excused from Deduction`,
        lateMinutes: r.lateMinutes || 0,
        occurrenceCount: 0,
        penaltyDays: 0,
        penaltyDescriptionAr: `إذن رسمي معتمد (${slotLabel}) - معفى تماماً من الخصم والجزاءات والـتأخير`,
        penaltyDescriptionEn: `Official approved permission (${slot || 'official'}) - Excused from any penalty or deduction`,
        hasApprovedPermission: true,
      });
      return;
    }

    // Unexcused absence
    if (r.status === 'absent') {
      tier3_count++;
      const isFirst = tier3_count === 1;
      const penaltyDays = isFirst ? 2.0 : 3.0;

      penalties.push({
        id: `pen-${r.id}`,
        date: r.date,
        type: 'absent_unexcused',
        titleAr: 'غياب بدون إذن مسبق',
        titleEn: 'Unexcused Absence',
        lateMinutes: 0,
        occurrenceCount: tier3_count,
        penaltyDays,
        penaltyDescriptionAr: isFirst
          ? 'خصم يوم الغياب + يوم جزاء (خصم يومين)'
          : `خصم يوم الغياب + يومين جزاء (المرة ${tier3_count}: خصم 3 أيام)`,
        penaltyDescriptionEn: isFirst
          ? 'Unexcused absence: 2 days deduction'
          : `Unexcused absence (${tier3_count}th time): 3 days deduction`,
        hasApprovedPermission: false,
      });
      return;
    }

    // Lateness check
    if (r.lateMinutes > 0) {
      // Unexcused lateness
      if (r.lateMinutes <= 15) {
        tier1_count++;
        let penaltyDays = 0;
        let descAr = '';
        let descEn = '';

        if (tier1_count === 1) {
          penaltyDays = 0;
          descAr = 'إنذار كتابي ولفت نظر (المرة الأولى)';
          descEn = 'Written Notice (1st time)';
        } else if (tier1_count === 2) {
          penaltyDays = 0.25;
          descAr = 'خصم ربع يوم (المرة الثانية)';
          descEn = '0.25 Day Deduction (2nd time)';
        } else if (tier1_count === 3) {
          penaltyDays = 0.5;
          descAr = 'خصم نصف يوم (المرة الثالثة)';
          descEn = '0.5 Day Deduction (3rd time)';
        } else {
          penaltyDays = 1.0;
          descAr = `خصم يوم كامل (المرة ${tier1_count})`;
          descEn = `1.0 Day Deduction (${tier1_count}th time)`;
        }

        penalties.push({
          id: `pen-${r.id}`,
          date: r.date,
          type: 'late_15',
          titleAr: `تأخير بسيط (${r.lateMinutes} دقيقة)`,
          titleEn: `Minor Lateness (${r.lateMinutes} mins)`,
          lateMinutes: r.lateMinutes,
          occurrenceCount: tier1_count,
          penaltyDays,
          penaltyDescriptionAr: descAr,
          penaltyDescriptionEn: descEn,
          hasApprovedPermission: false,
        });
      } else if (r.lateMinutes <= 60) {
        tier2_count++;
        let penaltyDays = 0;
        let descAr = '';
        let descEn = '';

        if (tier2_count === 1) {
          penaltyDays = 0.5;
          descAr = 'خصم نصف يوم (المرة الأولى)';
          descEn = '0.5 Day Deduction (1st time)';
        } else if (tier2_count === 2) {
          penaltyDays = 1.0;
          descAr = 'خصم يوم كامل (المرة الثانية)';
          descEn = '1.0 Day Deduction (2nd time)';
        } else if (tier2_count === 3) {
          penaltyDays = 3.0;
          descAr = 'خصم 3 أيام (المرة الثالثة)';
          descEn = '3 Days Deduction (3rd time)';
        } else {
          penaltyDays = 5.0;
          descAr = `خصم 5 أيام (المرة ${tier2_count})`;
          descEn = `5 Days Deduction (${tier2_count}th time)`;
        }

        penalties.push({
          id: `pen-${r.id}`,
          date: r.date,
          type: 'late_60',
          titleAr: `تأخير متوسط (${r.lateMinutes} دقيقة)`,
          titleEn: `Moderate Lateness (${r.lateMinutes} mins)`,
          lateMinutes: r.lateMinutes,
          occurrenceCount: tier2_count,
          penaltyDays,
          penaltyDescriptionAr: descAr,
          penaltyDescriptionEn: descEn,
          hasApprovedPermission: false,
        });
      } else {
        // Late > 60 mins without permission -> treated as unexcused absence
        tier3_count++;
        const isFirst = tier3_count === 1;
        const penaltyDays = isFirst ? 2.0 : 3.0;

        penalties.push({
          id: `pen-${r.id}`,
          date: r.date,
          type: 'late_over60',
          titleAr: `تأخير جسيم تجاوز 60 دقيقة (${r.lateMinutes} دقيقة)`,
          titleEn: `Severe Lateness > 60 mins (${r.lateMinutes} mins)`,
          lateMinutes: r.lateMinutes,
          occurrenceCount: tier3_count,
          penaltyDays,
          penaltyDescriptionAr: isFirst
            ? 'اعتبار الموظف غائباً: خصم يوم الغياب + يوم جزاء (خصم يومين)'
            : `اعتبار الموظف غائباً (المرة ${tier3_count}: خصم 3 أيام)`,
            penaltyDescriptionEn: isFirst
            ? 'Severe lateness >60m: 2 days deduction'
            : `Severe lateness >60m (${tier3_count}th time): 3 days deduction`,
          hasApprovedPermission: false,
        });
      }
    }
  });

  const totalDeductionDays = penalties.reduce((acc, p) => acc + p.penaltyDays, 0);

  return {
    month,
    employeeId: empId,
    totalWorkHours,
    totalLateMinutes,
    daysPresent,
    daysAbsent,
    daysOnLeave,
    daysWeekend,
    expectedWorkDays,
    officialHolidaysInMonthCount,
    officialHolidaysList,
    totalAnnualBalance,
    casualLeaveBalance,
    regularLeaveBalance,
    usedCasualDaysAllTime,
    remainingCasualDays,
    usedRegularDaysAllTime,
    remainingRegularDays,
    usedAnnualDaysAllTime,
    usedAnnualDaysInMonth,
    remainingAnnualDays,
    sickLeaveBalance,
    usedSickDaysAllTime,
    remainingSickDays,
    usedSickDaysInMonth,
    usedPermissionsCount,
    remainingPermissionsCount,
    maxPermissionsPerMonth,
    maxHoursPerPermission,
    monthPermissions,
    penalties,
    totalDeductionDays,
  };
}

import React, { useState, useEffect, useRef } from 'react';
import { Header } from './components/Header';
import { DashboardOverview } from './components/DashboardOverview';
import { KioskPunch } from './components/KioskPunch';
import { AttendanceLogTable } from './components/AttendanceLogTable';
import { EmployeeManager } from './components/EmployeeManager';
import { LeaveManager } from './components/LeaveManager';
import { AnalyticsView } from './components/AnalyticsView';
import { EmployeePortal } from './components/EmployeePortal';
import { DataImportModal } from './components/DataImportModal';
import { LoginModal } from './components/LoginModal';
import { CompanyRulesModal } from './components/CompanyRulesModal';
import { CompanySocialBar } from './components/CompanySocialBar';
import { UrgentNoticeBanner } from './components/UrgentNoticeBanner';
import { UrgentNoticeModal } from './components/UrgentNoticeModal';
import { ImportLeavesView } from './components/ImportLeavesView';
import { 
  Employee, 
  Shift, 
  AttendanceRecord, 
  LeaveRequest, 
  Language, 
  LeaveStatus,
  UrgentNotice,
  OfficialHoliday
} from './types';
import { 
  INITIAL_EMPLOYEES, 
  INITIAL_SHIFTS, 
  INITIAL_ATTENDANCE, 
  INITIAL_LEAVES,
  INITIAL_OFFICIAL_HOLIDAYS
} from './mockData';
import { 
  exportToCSV, 
  evaluatePunch, 
  getLeaveTypeLabel, 
  getTodayString, 
  sanitizeAttendanceWithPermissions,
  mergeAttendanceRecords,
  ensureApprovedLeaveRecords,
  mergeByUniqueId,
  ensureSanitizedRecord,
  calculateWorkDaysInPeriod,
  isWeekend,
  getNowTimeString
} from './utils/helpers';



function mergeLeaveRequestsClient(existing: LeaveRequest[] = [], incoming: LeaveRequest[] = []): LeaveRequest[] {
  const map = new Map<string, LeaveRequest>();
  for (const item of existing) {
    if (item && item.id) map.set(item.id, { ...item });
  }
  for (const item of incoming) {
    if (item && item.id) {
      const old = map.get(item.id);
      map.set(item.id, old ? { ...old, ...item } : { ...item });
    }
  }
  return Array.from(map.values());
}

export default function App() {
  const [lang, setLang] = useState<Language>('ar');
  const [activeTab, setActiveTab] = useState<'dashboard' | 'kiosk' | 'attendance' | 'employees' | 'leaves' | 'import_leaves' | 'analytics' | 'portal'>('dashboard');
  const [searchTerm, setSearchTerm] = useState('');
  // Keep the logged-in user across normal page refreshes.
  const [currentUser, setCurrentUser] = useState<Employee | null>(() => {
    try {
      const saved = localStorage.getItem('logged_in_user');
      if (saved) {
        const parsed = JSON.parse(saved) as Employee;
        if (parsed?.id && parsed.status !== 'inactive') return parsed;
      }
    } catch {
      // ignore
    }
    return null;
  });

  const [isLoginModalOpen, setIsLoginModalOpen] = useState<boolean>(() => !currentUser);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importModalTab, setImportModalTab] = useState<'company' | 'employees' | 'raw_paste' | 'backup'>('company');
  const [isRulesModalOpen, setIsRulesModalOpen] = useState(false);
  const [isNoticeModalOpen, setIsNoticeModalOpen] = useState(false);

  // Urgent Announcement Persistent State
  const [urgentNotice, setUrgentNotice] = useState<UrgentNotice | null>(() => {
    const saved = localStorage.getItem('urgent_notice');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        // fallback
      }
    }
    return null;
  });

  // Company Name Persistent State
  const [companyNameAr, setCompanyNameAr] = useState<string>(() => {
    return localStorage.getItem('company_name_ar') || 'شركة TECH SOURCE GDS';
  });
  const [companyNameEn, setCompanyNameEn] = useState<string>(() => {
    return localStorage.getItem('company_name_en') || 'TECH SOURCE - GDS Global';
  });

  // Persistent State
  const [employees, setEmployees] = useState<Employee[]>(() => {
    const saved = localStorage.getItem('attendance_employees');
    if (saved) {
      try {
        const parsed: Employee[] = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const existingIds = new Set(parsed.map(e => e.id));
          const missingInitial = INITIAL_EMPLOYEES.filter(e => !existingIds.has(e.id));
          return [...parsed, ...missingInitial];
        }
      } catch {
        return INITIAL_EMPLOYEES;
      }
    }
    return INITIAL_EMPLOYEES;
  });

  const [shifts] = useState<Shift[]>(INITIAL_SHIFTS);

  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>(() => {
    const saved = localStorage.getItem('attendance_records');
    if (saved) {
      try {
        const parsed: AttendanceRecord[] = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      } catch {
        // fallback
      }
    }
    return INITIAL_ATTENDANCE;
  });

  
  const [overtimeRequests, setOvertimeRequests] = useState<any[]>([]);
  
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>(() => {
    const saved = localStorage.getItem('attendance_leaves');
    if (saved) {
      try {
        const parsed: LeaveRequest[] = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      } catch {
        // fallback
      }
    }
    return INITIAL_LEAVES;
  });

  const [officialHolidays, setOfficialHolidays] = useState<OfficialHoliday[]>(() => {
    const saved = localStorage.getItem('official_holidays');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch {
        // fallback
      }
    }
    return INITIAL_OFFICIAL_HOLIDAYS;
  });

  const handleAddOfficialHoliday = (newHoliday: OfficialHoliday) => {
    const nextHolidays = [newHoliday, ...officialHolidays];
    setOfficialHolidays(nextHolidays);
    localStorage.setItem('official_holidays', JSON.stringify(nextHolidays));
  };

  const handleDeleteOfficialHoliday = (id: string) => {
    const nextHolidays = officialHolidays.filter(h => h.id !== id);
    setOfficialHolidays(nextHolidays);
    localStorage.setItem('official_holidays', JSON.stringify(nextHolidays));
  };

  // Keep state refs up to date to prevent closure staleness in pushSync and async operations
  const employeesRef = useRef(employees);
  const attendanceRecordsRef = useRef(attendanceRecords);
  const leaveRequestsRef = useRef(leaveRequests);
  const companyNameArRef = useRef(companyNameAr);
  const companyNameEnRef = useRef(companyNameEn);
  const urgentNoticeRef = useRef(urgentNotice);
  const lastLocalUpdateRef = useRef<number>(0);

  useEffect(() => { employeesRef.current = employees; }, [employees]);
  useEffect(() => { attendanceRecordsRef.current = attendanceRecords; }, [attendanceRecords]);
  useEffect(() => { leaveRequestsRef.current = leaveRequests; }, [leaveRequests]);
  useEffect(() => { companyNameArRef.current = companyNameAr; }, [companyNameAr]);
  useEffect(() => { companyNameEnRef.current = companyNameEn; }, [companyNameEn]);
  useEffect(() => { urgentNoticeRef.current = urgentNotice; }, [urgentNotice]);

  // Auto-sanitize attendance records against approved permissions and approved leaves
  useEffect(() => {
    setAttendanceRecords(prev => {
      const withLeaves = ensureApprovedLeaveRecords(prev, leaveRequests);
      const sanitized = sanitizeAttendanceWithPermissions(withLeaves, leaveRequests);
      let changed = false;
      if (sanitized.length !== prev.length) changed = true;
      else {
        for (let i = 0; i < prev.length; i++) {
          if (prev[i].lateMinutes !== sanitized[i].lateMinutes || prev[i].status !== sanitized[i].status) {
            changed = true;
            break;
          }
        }
      }
      return changed ? sanitized : prev;
    });
  }, [leaveRequests]);

  // Sync helper function to send state mutations to Express backend server
  const pushSync = async (overrides?: {
    employees?: Employee[];
    attendanceRecords?: AttendanceRecord[];
    leaveRequests?: LeaveRequest[];
    companyNameAr?: string;
    companyNameEn?: string;
    urgentNotice?: UrgentNotice | null;
    deletedAttendanceIds?: string[];
    deletedEmployeeIds?: string[];
    deletedLeaveIds?: string[];
    replaceAttendance?: boolean;
  }) => {
    try {
      const now = Date.now();
      const payload: Record<string, any> = {
        lastUpdated: now,
      };

      if (overrides?.employees !== undefined) payload.employees = overrides.employees;
      if (overrides?.attendanceRecords !== undefined) payload.attendanceRecords = overrides.attendanceRecords;
      if (overrides?.leaveRequests !== undefined) payload.leaveRequests = overrides.leaveRequests;
      if (overrides?.companyNameAr !== undefined) payload.companyNameAr = overrides.companyNameAr;
      if (overrides?.companyNameEn !== undefined) payload.companyNameEn = overrides.companyNameEn;
      if (overrides?.urgentNotice !== undefined) payload.urgentNotice = overrides.urgentNotice;
      if (overrides?.deletedAttendanceIds) payload.deletedAttendanceIds = overrides.deletedAttendanceIds;
      if (overrides?.deletedEmployeeIds) payload.deletedEmployeeIds = overrides.deletedEmployeeIds;
      if (overrides?.deletedLeaveIds) payload.deletedLeaveIds = overrides.deletedLeaveIds;
      if (overrides?.replaceAttendance) payload.replaceAttendance = true;

      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.lastUpdated) {
          lastLocalUpdateRef.current = data.lastUpdated;
        }
      }
    } catch {
      // Ignore network errors
    }
  };

  const handleSaveUrgentNotice = (newNotice: UrgentNotice | null) => {
    urgentNoticeRef.current = newNotice;
    setUrgentNotice(newNotice);
    if (newNotice && newNotice.active !== false) {
      localStorage.setItem('urgent_notice', JSON.stringify(newNotice));
      // Clear previous dismiss flags so everyone sees the new or updated notice
      try {
        Object.keys(localStorage).forEach(key => {
          if (key.startsWith('dismissed_notice_')) {
            localStorage.removeItem(key);
          }
        });
      } catch {}
    } else {
      localStorage.removeItem('urgent_notice');
    }
    pushSync({ urgentNotice: newNotice });
  };

  // Poll server every 1.5s to fetch live updates from central authoritative database
  useEffect(() => {
    let isMounted = true;
    const fetchLatestData = async () => {
      try {
        const res = await fetch('/api/data', {
          headers: {
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
          },
          cache: 'no-store',
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data.success && isMounted) {
          // If server response is older than our latest local mutation, skip overriding to avoid race conditions
          if (data.lastUpdated && lastLocalUpdateRef.current && data.lastUpdated < lastLocalUpdateRef.current) {
            return;
          }

          let deletedIds: string[] = [];
          try {
            deletedIds = JSON.parse(localStorage.getItem('deleted_employee_ids') || '[]');
          } catch {}
          const deletedSet = new Set(deletedIds);

          if (data.employees && Array.isArray(data.employees)) {
            const cleanEmps = data.employees.filter((e: Employee) => e && e.id && !deletedSet.has(e.id));
            setEmployees(cleanEmps);
            employeesRef.current = cleanEmps;
            localStorage.setItem('attendance_employees', JSON.stringify(cleanEmps));
            setCurrentUser(prevUser => {
              if (!prevUser) return null;
              const match = cleanEmps.find((e: Employee) => e.id === prevUser.id);
              if (!match || match.status === 'inactive') {
                localStorage.removeItem('logged_in_user');
                return null;
              }
              localStorage.setItem('logged_in_user', JSON.stringify(match));
              return match;
            });
          }

          if (data.attendanceRecords && Array.isArray(data.attendanceRecords)) {
            const sanitizedRecs = data.attendanceRecords
              .filter((r: AttendanceRecord) => !deletedSet.has(r.employeeId))
              .map(ensureSanitizedRecord);
            const merged = mergeAttendanceRecords(sanitizedRecs, attendanceRecordsRef.current || []);
            setAttendanceRecords(merged);
            attendanceRecordsRef.current = merged;
            localStorage.setItem('attendance_records', JSON.stringify(merged));
          }

          if (data.leaveRequests && Array.isArray(data.leaveRequests)) {
            const cleanLeaves = data.leaveRequests.filter((l: LeaveRequest) => !deletedSet.has(l.employeeId));
            const mergedLeaves = mergeLeaveRequestsClient(leaveRequestsRef.current || [], cleanLeaves);
            setLeaveRequests(mergedLeaves);
            leaveRequestsRef.current = mergedLeaves;
            localStorage.setItem('attendance_leaves', JSON.stringify(mergedLeaves));
          }

          if (data.companyNameAr) {
            setCompanyNameAr(data.companyNameAr);
            localStorage.setItem('company_name_ar', data.companyNameAr);
          }

          if (data.companyNameEn) {
            setCompanyNameEn(data.companyNameEn);
            localStorage.setItem('company_name_en', data.companyNameEn);
          }

          if (data.urgentNotice !== undefined && !isNoticeModalOpen) {
            urgentNoticeRef.current = data.urgentNotice;
            setUrgentNotice(data.urgentNotice);
            if (data.urgentNotice && data.urgentNotice.active !== false) {
              localStorage.setItem('urgent_notice', JSON.stringify(data.urgentNotice));
            } else {
              localStorage.removeItem('urgent_notice');
            }
          }
        }
      } catch {
        // Fallback silently if offline or server momentarily restarting
      }
    };

    fetchLatestData();
    const interval = setInterval(fetchLatestData, 5000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [isNoticeModalOpen]);

  useEffect(() => {
    localStorage.setItem('company_name_ar', companyNameAr);
  }, [companyNameAr]);

  useEffect(() => {
    localStorage.setItem('company_name_en', companyNameEn);
  }, [companyNameEn]);

  useEffect(() => {
    localStorage.setItem('attendance_employees', JSON.stringify(employees));
  }, [employees]);

  useEffect(() => {
    localStorage.setItem('attendance_records', JSON.stringify(attendanceRecords));
  }, [attendanceRecords]);

  useEffect(() => {
    localStorage.setItem('attendance_leaves', JSON.stringify(leaveRequests));
  }, [leaveRequests]);

  // Handle Tab restrictions based on user role
  useEffect(() => {
    if (currentUser && currentUser.role === 'employee') {
      setActiveTab('portal');
    }
    if (!currentUser) {
      setIsLoginModalOpen(true);
    }
  }, [currentUser]);

  const handleLoginSuccess = (user: Employee) => {
    setCurrentUser(user);
    localStorage.setItem('logged_in_user', JSON.stringify(user));
    setIsLoginModalOpen(false);
    if (user.role === 'employee') {
      setActiveTab('portal');
    } else {
      setActiveTab('dashboard');
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('logged_in_user');
    sessionStorage.removeItem('logged_in_user');
    setIsLoginModalOpen(true);
  };

  const handleUpdateCompany = (nameAr: string, nameEn: string) => {
    setCompanyNameAr(nameAr);
    setCompanyNameEn(nameEn);
    pushSync({ companyNameAr: nameAr, companyNameEn: nameEn });
  };

  const handleImportEmployees = (newEmployees: Employee[], overwrite: boolean) => {
    let updatedList: Employee[] = [];
    if (overwrite) {
      updatedList = newEmployees;
    } else {
      const existingCodes = new Set(employees.map(e => e.code));
      const filteredNew = newEmployees.filter(e => !existingCodes.has(e.code));
      updatedList = [...employees, ...filteredNew];
    }
    setEmployees(updatedList);
    pushSync({ employees: updatedList });
  };

  const handleImportAttendance = (newRecords: AttendanceRecord[], overwrite: boolean) => {
    let updatedRecords: AttendanceRecord[] = [];
    if (overwrite) {
      updatedRecords = newRecords;
    } else {
      updatedRecords = [...attendanceRecords, ...newRecords];
    }
    setAttendanceRecords(updatedRecords);
    pushSync({ attendanceRecords: updatedRecords });
  };

  // Set RTL / LTR on html/body
  useEffect(() => {
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
  }, [lang]);

  // Handle Punch Event (Check in / Check out / Breaks / Force Leader Break Return)
  
  const handleUpdateOvertimeStatus = (id: string, status: 'approved' | 'rejected') => {
    fetch(`/api/overtime/${id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    }).then(res => res.json()).then(data => {
      if (data.success) {
        setOvertimeRequests(data.overtimeRequests || []);
      }
    });
  };
  
  const handlePunch = (
    employeeId: string, 
    action: 'check_in' | 'check_out' | 'break_start' | 'break_end' | 'force_break_end',
    location: string,
    notes?: string
  ) => {
    const todayStr = getTodayString();
    const nowTimeStr = getNowTimeString();

    const emp = employees.find(e => (e.id || '').toLowerCase() === (employeeId || '').toLowerCase());
    if (!emp) return;

    // Rule: Block ALL actions if today is weekend or employee has an approved FULL-DAY leave (excluding permissions) or is marked on_leave
    if (isWeekend(todayStr)) {
      alert(
        lang === 'ar'
          ? `عفواً، اليوم الجمعة/السبت عطلة أسبوعية رسمية! لا يمكن تسجيل الحضور والانصراف في العطلات الأسبوعية.`
          : `Sorry, actions disabled! Today is a weekly weekend holiday (Friday/Saturday).`
      );
      return;
    }

    const activeApprovedLeave = leaveRequests.find(l => 
      (l.employeeId || '').toLowerCase() === (employeeId || '').toLowerCase() && 
      l.status === 'approved' && 
      l.type !== 'permission' && // Permission allows check-in at any time
      todayStr >= l.startDate && 
      todayStr <= l.endDate
    );

    const empIdNorm = (employeeId || '').trim().toLowerCase();
    const existingTodayRec = attendanceRecordsRef.current.find(r => 
      (r.employeeId || '').trim().toLowerCase() === empIdNorm && (r.date || '').trim() === todayStr
    );

    if (activeApprovedLeave || existingTodayRec?.status === 'on_leave') {
      const empName = lang === 'ar' ? emp.nameAr : emp.nameEn;
      const leaveLabel = activeApprovedLeave ? getLeaveTypeLabel(activeApprovedLeave.type, lang) : (lang === 'ar' ? 'إجازة معتمدة' : 'Approved Leave');
      alert(
        lang === 'ar'
          ? `عفواً، لا يمكن إجراء أي حركة اليوم! الموظف (${empName}) في إجازة معتمدة (${leaveLabel}).`
          : `Sorry, actions disabled! Employee (${empName}) is on active leave (${leaveLabel}).`
      );
      return;
    }

    const shift = shifts.find(s => s.id === emp.shiftId) || shifts[0];

    const currentRecs = attendanceRecordsRef.current || [];
    const existingIndex = currentRecs.findIndex(r => {
      const rEmp = (r.employeeId || '').trim().toLowerCase();
      const rDate = (r.date || '').trim();
      return (rEmp === empIdNorm && rDate === todayStr) || r.id === `rec-${empIdNorm}-${todayStr}`;
    });

    let updatedRecord: AttendanceRecord;
    let nextRecords: AttendanceRecord[] = [];

    if (existingIndex >= 0) {
      const existing = currentRecs[existingIndex];
      const updated = { ...existing };

      if (action === 'check_in') {
        if (existing.checkIn) {
          alert(
            lang === 'ar'
              ? `عفواً، تم تسجيل الحضور بالفعل لهذا اليوم الساعة (${existing.checkIn})! التسجيل مسموح مرة واحدة فقط في اليوم.`
              : `Sorry, check-in has already been registered today at (${existing.checkIn})! Only 1 check-in allowed per day.`
          );
          return;
        }
        updated.checkIn = nowTimeStr;
      } else if (action === 'check_out') {
        if (existing.checkOut) {
          alert(
            lang === 'ar'
              ? `عفواً، تم تسجيل الانصراف بالفعل لهذا اليوم الساعة (${existing.checkOut})! التسجيل مسموح مرة واحدة فقط في اليوم.`
              : `Sorry, check-out has already been registered today at (${existing.checkOut})! Only 1 check-out allowed per day.`
          );
          return;
        }
        if (!existing.checkIn) {
          alert(
            lang === 'ar'
              ? `عفواً، يجب تسجيل الحضور أولاً قبل إمكانية تسجيل الانصراف!`
              : `Please check in first before checking out!`
          );
          return;
        }
        updated.checkOut = nowTimeStr;
        updated._isExplicitCancelCheckOut = false;
      } else if (action === 'break_start') {
        updated.breakStart = nowTimeStr;
        updated.breakEnd = undefined;
        updated.notes = (updated.notes ? updated.notes + ' | ' : '') + 'بدأت الاستراحة: ' + nowTimeStr;
      } else if (action === 'break_end') {
        updated.breakStart = updated.breakStart || existing.breakStart;
        updated.breakEnd = nowTimeStr;
        updated.notes = (updated.notes ? updated.notes + ' | ' : '') + 'انتهت الاستراحة: ' + nowTimeStr;
      } else if (action === 'force_break_end') {
        updated.breakStart = updated.breakStart || existing.breakStart;
        updated.breakEnd = nowTimeStr;
        updated.notes = (updated.notes ? updated.notes + ' | ' : '') + 'تم إنهاء الاستراحة بواسطة التيم ليدر الساعة: ' + nowTimeStr;
      }

      if (notes) {
        updated.notes = (updated.notes ? updated.notes + ' - ' : '') + notes;
      }

      const todayApprovedPermission = leaveRequests.find(l => 
        (l.employeeId || '').toLowerCase() === empIdNorm && 
        l.type === 'permission' && 
        l.status === 'approved' && 
        l.startDate === todayStr
      );
      const permSlot = todayApprovedPermission?.permissionSlot;
      const hasApprovedPerm = Boolean(todayApprovedPermission);

      const evaluated = evaluatePunch(
        updated.checkIn || nowTimeStr, 
        updated.checkOut, 
        shift, 
        todayStr, 
        permSlot, 
        hasApprovedPerm,
        updated.breakStart,
        updated.breakEnd
      );
      updated.lateMinutes = evaluated.lateMinutes;
      updated.lateSeconds = evaluated.lateSeconds;
      updated.earlyLeaveMinutes = evaluated.earlyLeaveMinutes;
      updated.workHours = evaluated.workHours;
      updated.overtimeHours = evaluated.overtimeHours;
      updated.status = evaluated.status;
      updated.updatedAt = new Date().toISOString();

      updatedRecord = updated;
      const newArr = [...currentRecs];
      newArr[existingIndex] = updated;
      nextRecords = newArr;
    } else {
      // Create new record for today
      const checkInVal = (action === 'check_in' || !action) ? nowTimeStr : undefined;
      const checkOutVal = action === 'check_out' ? nowTimeStr : undefined;
      const breakStartVal = action === 'break_start' ? nowTimeStr : undefined;
      const breakEndVal = (action === 'break_end' || action === 'force_break_end') ? nowTimeStr : undefined;

      const todayApprovedPermission = leaveRequests.find(l => 
        (l.employeeId || '').toLowerCase() === empIdNorm && 
        l.type === 'permission' && 
        l.status === 'approved' && 
        l.startDate === todayStr
      );
      const permSlot = todayApprovedPermission?.permissionSlot;
      const hasApprovedPerm = Boolean(todayApprovedPermission);

      const evaluated = evaluatePunch(checkInVal || nowTimeStr, checkOutVal, shift, todayStr, permSlot, hasApprovedPerm);

      const newRecord: AttendanceRecord = {
        id: `rec-${empIdNorm}-${todayStr}`,
        employeeId: emp.id,
        date: todayStr,
        checkIn: checkInVal,
        checkOut: checkOutVal,
        breakStart: breakStartVal,
        breakEnd: breakEndVal,
        location,
        notes: action === 'force_break_end' ? 'تم إنهاء الاستراحة بواسطة التيم ليدر' : notes,
        lateMinutes: evaluated.lateMinutes,
        lateSeconds: evaluated.lateSeconds,
        earlyLeaveMinutes: evaluated.earlyLeaveMinutes,
        workHours: evaluated.workHours,
        overtimeHours: evaluated.overtimeHours,
        status: evaluated.status,
        verifiedByFace: true,
        updatedAt: new Date().toISOString(),
      };

      updatedRecord = newRecord;
      nextRecords = [newRecord, ...currentRecs];
    }

    
    // Sync with the server when it is available.
    try {
      fetch('/api/punch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId: emp.id, action, record: updatedRecord, nowTimeStr })
      })
      .then(res => res.json())
      .then(data => {
        if (data && data.success && Array.isArray(data.attendanceRecords)) {
          const sanitized = data.attendanceRecords.map(ensureSanitizedRecord);
          const merged = mergeAttendanceRecords(sanitized, attendanceRecordsRef.current || []);
          attendanceRecordsRef.current = merged;
          setAttendanceRecords(merged);
          localStorage.setItem('attendance_records', JSON.stringify(merged));
          if (data.lastUpdated) {
            lastLocalUpdateRef.current = data.lastUpdated;
          }
        }
      })
      .catch((err) => { console.error("Punch Error:", err); });
    } catch (e) {
      console.error(e);
    }
      // Keep the punch visible and recoverable even when the API is temporarily offline.
      attendanceRecordsRef.current = nextRecords;
      setAttendanceRecords(nextRecords);
      localStorage.setItem('attendance_records', JSON.stringify(nextRecords));
      lastLocalUpdateRef.current = Date.now();
  };

  // Add / Edit Record manually
  const handleAddRecord = (record: AttendanceRecord) => {
    const recWithTime: AttendanceRecord = { 
      ...record, 
      updatedAt: record.updatedAt || new Date().toISOString() 
    };
    const targetEmpId = (record.employeeId || '').trim().toLowerCase();
    const targetDate = (record.date || '').trim();
    const targetId = record.id;
    const filtered = (attendanceRecordsRef.current || []).filter(r => 
      r.id !== targetId && 
      !((r.employeeId || '').trim().toLowerCase() === targetEmpId && (r.date || '').trim() === targetDate)
    );
    const updated = [recWithTime, ...filtered];
    attendanceRecordsRef.current = updated;
    lastLocalUpdateRef.current = Date.now();
    localStorage.setItem('attendance_records', JSON.stringify(updated));
    setAttendanceRecords(updated);
    pushSync({ attendanceRecords: updated });

    try {
      fetch('/api/punch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId: record.employeeId, action: 'update', record: recWithTime })
      })
      .then(res => res.json())
      .then(data => {
        if (data && data.success && Array.isArray(data.attendanceRecords)) {
          const sanitized = data.attendanceRecords.map(ensureSanitizedRecord);
          attendanceRecordsRef.current = sanitized;
          setAttendanceRecords(sanitized);
          localStorage.setItem('attendance_records', JSON.stringify(sanitized));
          if (data.lastUpdated) {
            lastLocalUpdateRef.current = data.lastUpdated;
          }
        }
      })
      .catch(() => {});
    } catch {}
  };

  const handleBatchAddRecords = (records: AttendanceRecord[]) => {
    if (!records || records.length === 0) return;
    const nowIso = new Date().toISOString();
    const map = new Map<string, AttendanceRecord>();
    for (const r of (attendanceRecordsRef.current || [])) {
      const key = (r.employeeId && r.date) ? `${r.employeeId}_${r.date}` : r.id;
      if (key) map.set(key, r);
    }
    for (const r of records) {
      const key = (r.employeeId && r.date) ? `${r.employeeId}_${r.date}` : r.id;
      if (key) {
        const sanitized = ensureSanitizedRecord({ ...r, updatedAt: r.updatedAt || nowIso });
        map.set(key, sanitized);
      }
    }
    const updated = Array.from(map.values()).sort((a, b) => {
      if (b.date !== a.date) return (b.date || '').localeCompare(a.date || '');
      return (a.employeeId || '').localeCompare(b.employeeId || '');
    });
    attendanceRecordsRef.current = updated;
    lastLocalUpdateRef.current = Date.now();
    localStorage.setItem('attendance_records', JSON.stringify(updated));
    setAttendanceRecords(updated);
    pushSync({ attendanceRecords: updated });
  };

  const handleUpdateRecord = (record: AttendanceRecord) => {
    const recWithTime: AttendanceRecord = { 
      ...record, 
      updatedAt: new Date().toISOString() 
    };

    const targetEmpId = record.employeeId;
    const targetDate = record.date;
    const targetId = record.id;
    const filtered = (attendanceRecordsRef.current || []).filter(r => r.id !== targetId && !(r.employeeId === targetEmpId && r.date === targetDate));
    const nextRecords = [recWithTime, ...filtered];

    attendanceRecordsRef.current = nextRecords;
    lastLocalUpdateRef.current = Date.now();
    localStorage.setItem('attendance_records', JSON.stringify(nextRecords));
    setAttendanceRecords(nextRecords);
    pushSync({ attendanceRecords: nextRecords });
    try {
      fetch('/api/punch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId: targetEmpId, action: 'update', record: recWithTime })
      })
      .then(res => res.json())
      .then(data => {
        if (data && data.success && Array.isArray(data.attendanceRecords)) {
          const sanitized = data.attendanceRecords.map(ensureSanitizedRecord);
          attendanceRecordsRef.current = sanitized;
          setAttendanceRecords(sanitized);
          localStorage.setItem('attendance_records', JSON.stringify(sanitized));
          if (data.lastUpdated) {
            lastLocalUpdateRef.current = data.lastUpdated;
          }
        }
      })
      .catch(() => {});
    } catch {
      // ignore
    }
  };

  // Force end employee break by Leader
  const handleForceEndBreak = (empId: string) => {
    handlePunch(empId, 'force_break_end', '', 'إرجاع من الاستراحة بواسطة الليدر');
  };

  // Add Employee
  const handleAddEmployee = (emp: Employee) => {
    const nextEmps = [...employeesRef.current, emp];
    employeesRef.current = nextEmps;
    localStorage.setItem('attendance_employees', JSON.stringify(nextEmps));
    setEmployees(nextEmps);
    pushSync({ employees: nextEmps });
  };

  // Update Employee
  const handleUpdateEmployee = async (updatedEmp: Employee) => {
    // Optimistic UI update
    const nextEmps = employeesRef.current.map(e => {
      if (e.id === updatedEmp.id) {
        const finalAvatar = updatedEmp._isPhotoRemoved
          ? ''
          : (updatedEmp.avatar && updatedEmp.avatar.trim() !== '' ? updatedEmp.avatar : (e.avatar || ''));
        return {
          ...e,
          ...updatedEmp,
          avatar: finalAvatar,
        };
      }
      return e;
    });

    employeesRef.current = nextEmps;
    localStorage.setItem('attendance_employees', JSON.stringify(nextEmps));
    setEmployees(nextEmps);

    try {
      const res = await fetch(`/api/employees/${updatedEmp.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nextEmps.find(e => e.id === updatedEmp.id))
      });
      if (res.ok) {
        const data = await res.json();
        if (data.employee) {
          // Confirm with server response
          const confirmedEmps = employeesRef.current.map(e => e.id === updatedEmp.id ? data.employee : e);
          employeesRef.current = confirmedEmps;
          setEmployees(confirmedEmps);
          localStorage.setItem('attendance_employees', JSON.stringify(confirmedEmps));
        }
      }
    } catch (err) {
      console.error('Failed to update employee on server', err);
    }

    // If updating currently logged in user, update currentUser as well
    if (currentUser && currentUser.id === updatedEmp.id) {
      setCurrentUser(prev => {
        if (!prev) return updatedEmp;
        const finalAvatar = updatedEmp._isPhotoRemoved
          ? ''
          : (updatedEmp.avatar && updatedEmp.avatar.trim() !== '' ? updatedEmp.avatar : (prev.avatar || ''));
        const newCurr = {
          ...prev,
          ...updatedEmp,
          avatar: finalAvatar,
        };
        localStorage.setItem('attendance_current_user', JSON.stringify(newCurr));
        return newCurr;
      });
    }
  };

  // Delete Employee
  const handleDeleteEmployee = (empId: string) => {
    let deletedIds: string[] = [];
    try {
      deletedIds = JSON.parse(localStorage.getItem('deleted_employee_ids') || '[]');
    } catch {}
    if (!deletedIds.includes(empId)) {
      deletedIds.push(empId);
      localStorage.setItem('deleted_employee_ids', JSON.stringify(deletedIds));
    }

    const updatedEmployees = employeesRef.current.filter(e => e.id !== empId);
    const updatedRecords = attendanceRecordsRef.current.filter(r => r.employeeId !== empId);
    const updatedLeaves = leaveRequestsRef.current.filter(l => l.employeeId !== empId);

    setEmployees(updatedEmployees);
    employeesRef.current = updatedEmployees;
    localStorage.setItem('attendance_employees', JSON.stringify(updatedEmployees));

    setAttendanceRecords(updatedRecords);
    attendanceRecordsRef.current = updatedRecords;
    localStorage.setItem('attendance_records', JSON.stringify(updatedRecords));

    setLeaveRequests(updatedLeaves);
    leaveRequestsRef.current = updatedLeaves;
    localStorage.setItem('attendance_leaves', JSON.stringify(updatedLeaves));

    if (currentUser && currentUser.id === empId) {
      setCurrentUser(null);
      localStorage.removeItem('attendance_current_user');
    }

    pushSync({
      employees: updatedEmployees,
      attendanceRecords: updatedRecords,
      leaveRequests: updatedLeaves,
      deletedEmployeeIds: [empId]
    });

    fetch(`/api/employees/${empId}`, { method: 'DELETE' }).catch(() => {});
  };

  // Delete Leave Request
  const handleDeleteLeaveRequest = (leaveId: string) => {
    const nextLeaves = leaveRequestsRef.current.filter(l => l.id !== leaveId);
    setLeaveRequests(nextLeaves);
    leaveRequestsRef.current = nextLeaves;
    localStorage.setItem('attendance_leaves', JSON.stringify(nextLeaves));

    const nextAttendance = sanitizeAttendanceWithPermissions(attendanceRecordsRef.current, nextLeaves);
    setAttendanceRecords(nextAttendance);
    attendanceRecordsRef.current = nextAttendance;
    localStorage.setItem('attendance_records', JSON.stringify(nextAttendance));

    pushSync({
      leaveRequests: nextLeaves,
      attendanceRecords: nextAttendance,
      deletedLeaveIds: [leaveId]
    });

    fetch(`/api/leaves/${leaveId}`, { method: 'DELETE' }).catch(() => {});
  };

  // Delete Attendance Record
  const handleDeleteRecord = (id: string) => {
    const target = attendanceRecordsRef.current.find(r => r.id === id);
    const targetEmpId = target?.employeeId;
    const targetDate = target?.date;

    const nextRecords = attendanceRecordsRef.current.filter(
      r => r.id !== id && !(targetEmpId && targetDate && r.employeeId === targetEmpId && r.date === targetDate)
    );
    setAttendanceRecords(nextRecords);
    attendanceRecordsRef.current = nextRecords;
    localStorage.setItem('attendance_records', JSON.stringify(nextRecords));
    
    fetch(`/api/attendance/${id}`, { method: 'DELETE' }).catch(() => {});
    pushSync({ attendanceRecords: nextRecords, deletedAttendanceIds: [id] });

    if (target && target.status === 'on_leave') {
      const matchingLeave = leaveRequestsRef.current.find(
        l => l.employeeId === target.employeeId && target.date >= l.startDate && target.date <= l.endDate && l.status === 'approved'
      );
      if (matchingLeave) {
        handleUpdateLeaveStatus(matchingLeave.id, 'rejected', 'إلغاء الإجازة بقرار الإدارة');
      }
    }
  };

  // Clear Attendance Records for a Specific Date (e.g. Today)
  const handleClearTodayRecords = (dateStr: string) => {
    const deletedIds = attendanceRecordsRef.current
      .filter(r => r.date === dateStr)
      .map(r => r.id);
    const nextRecords = attendanceRecordsRef.current.filter(r => r.date !== dateStr);
    setAttendanceRecords(nextRecords);
    attendanceRecordsRef.current = nextRecords;
    localStorage.setItem('attendance_records', JSON.stringify(nextRecords));

    fetch('/api/attendance/clear-today', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: dateStr })
    }).catch(() => {});

    pushSync({ attendanceRecords: nextRecords, deletedAttendanceIds: deletedIds });
  };

  // Delete Future Attendance Records Only (date > todayStr)
  const handleDeleteFutureAttendance = async () => {
    const todayStr = getTodayString();
    const currentRecords = attendanceRecordsRef.current || [];
    const futureRecords = currentRecords.filter(r => r && r.date && r.date > todayStr);

    if (futureRecords.length === 0) {
      alert(
        lang === 'ar'
          ? `لا توجد أي سجلات حضور في تواريخ مستقبلية (بعد ${todayStr}). جميع السجلات الحالية سابقة أو لهذا اليوم.`
          : `No future attendance records found after ${todayStr}.`
      );
      return;
    }

    const sortedDates = futureRecords.map(r => r.date).sort();
    const minDate = sortedDates[0];
    const maxDate = sortedDates[sortedDates.length - 1];
    const futureCount = futureRecords.length;

    const confirmMessage =
      lang === 'ar'
        ? `يوجد ${futureCount} سجل حضور في تواريخ مستقبلية من ${minDate} إلى ${maxDate}. هل تريد حذف هذه السجلات؟`
        : `Found ${futureCount} future attendance records from ${minDate} to ${maxDate}. Do you want to delete these records?`;

    if (!window.confirm(confirmMessage)) {
      return;
    }

    try {
      // 1. Create a local backup of future records
      const futureBackupObj = {
        deletedAt: new Date().toISOString(),
        cutoffDate: todayStr,
        futureCount,
        futureRecords,
      };
      localStorage.setItem('future_attendance_backup_' + Date.now(), JSON.stringify(futureBackupObj));

      // 2. Immediately purge local state & localStorage of records > todayStr
      const keptRecords = currentRecords.filter(r => r && r.date && r.date <= todayStr);
      setAttendanceRecords(keptRecords);
      attendanceRecordsRef.current = keptRecords;
      localStorage.setItem('attendance_records', JSON.stringify(keptRecords));

      // 3. Send delete request to server
      const response = await fetch('/api/attendance/delete-future', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ todayDate: todayStr })
      });

      const resData = await response.json();

      let finalRecords = keptRecords;
      if (resData.success && Array.isArray(resData.attendanceRecords)) {
        finalRecords = resData.attendanceRecords.map(ensureSanitizedRecord).filter((r: AttendanceRecord) => r && r.date && r.date <= todayStr);
        setAttendanceRecords(finalRecords);
        attendanceRecordsRef.current = finalRecords;
        localStorage.setItem('attendance_records', JSON.stringify(finalRecords));
      }

      // 4. Force replace attendance on server to ensure no stale records persist
      await pushSync({ attendanceRecords: finalRecords, replaceAttendance: true });

      // 5. Verify that no attendance record remains with date > todayStr
      const remainingFuture = (attendanceRecordsRef.current || []).filter(r => r && r.date && r.date > todayStr);

      if (remainingFuture.length === 0) {
        alert(
          lang === 'ar'
            ? `تم حذف ${futureCount} سجل حضور مستقبلي بنجاح والاحتفاظ بكافة السجلات السابقة واليومية!`
            : `Successfully deleted ${futureCount} future attendance records!`
        );
      } else {
        alert(
          lang === 'ar'
            ? `تم الحذف بنجاح. عدد السجلات المستقبلية المتبقية: ${remainingFuture.length}`
            : `Deleted future records. Remaining: ${remainingFuture.length}`
        );
      }
    } catch (err: any) {
      console.error('Error deleting future attendance records:', err);
      alert(lang === 'ar' ? 'حدث خطأ أثناء حذف السجلات المستقبلية' : 'Error deleting future attendance records');
    }
  };

  // Leave Actions
  const handleAddLeave = (req: LeaveRequest) => {
    const nextLeaves = [req, ...leaveRequestsRef.current];
    setLeaveRequests(nextLeaves);
    leaveRequestsRef.current = nextLeaves;
    localStorage.setItem('attendance_leaves', JSON.stringify(nextLeaves));

    if (req.status === 'approved') {
      handleUpdateLeaveStatus(req.id, 'approved', req.reviewNotes || 'تم الاعتماد المباشر عند تقديم الطلب');
    } else {
      pushSync({ leaveRequests: nextLeaves });
    }
  };

  const handleUpdateLeaveStatus = (id: string, status: LeaveStatus, reviewNotes?: string) => {
    let updatedTargetReq: LeaveRequest | undefined;
    const previousReq = leaveRequestsRef.current.find(l => l.id === id);
    const wasApproved = previousReq?.status === 'approved';

    const currentLeaves = leaveRequestsRef.current;
    const nextLeaves = currentLeaves.map(l => {
      if (l.id === id) {
        updatedTargetReq = { ...l, status, reviewNotes, updatedAt: new Date().toISOString() };
        return updatedTargetReq;
      }
      return l;
    });

    if (!updatedTargetReq) return;

    setLeaveRequests(nextLeaves);
    leaveRequestsRef.current = nextLeaves;
    localStorage.setItem('attendance_leaves', JSON.stringify(nextLeaves));

    let nextEmployees = employeesRef.current;
    let nextAttendance = attendanceRecordsRef.current;

    if (status === 'approved' && updatedTargetReq && !wasApproved) {
      const req = updatedTargetReq;
      const days = calculateWorkDaysInPeriod(req.startDate, req.endDate);

      // 1. Deduct Leave Balances if applicable
      if (req.type === 'sick' || req.type === 'casual' || req.type === 'emergency' || req.type === 'regular' || req.type === 'annual') {
        nextEmployees = employeesRef.current.map(emp => {
          if (emp.id === req.employeeId) {
            if (req.type === 'sick') {
              const sickBal = emp.sickLeaveBalance ?? 30;
              const newSick = Math.max(0, sickBal - days);
              return { ...emp, sickLeaveBalance: newSick };
            } else {
              const casual = emp.casualLeaveBalance ?? 7;
              const regular = emp.regularLeaveBalance ?? 8;
              const annual = emp.annualLeaveBalance ?? (casual + regular);

              if (req.type === 'casual' || req.type === 'emergency') {
                const newCasual = Math.max(0, casual - days);
                const newAnnual = Math.max(0, annual - days);
                return { ...emp, casualLeaveBalance: newCasual, annualLeaveBalance: newAnnual };
              } else {
                const newRegular = Math.max(0, regular - days);
                const newAnnual = Math.max(0, annual - days);
                return { ...emp, regularLeaveBalance: newRegular, annualLeaveBalance: newAnnual };
              }
            }
          }
          return emp;
        });
      }

      // 2. Automatically generate / update AttendanceRecords
      const newRecords = [...attendanceRecordsRef.current];
      const cur = new Date(req.startDate);
      const endDateObj = new Date(req.endDate);

      while (cur <= endDateObj) {
        const dateStr = getTodayString(cur);
        if (!isWeekend(dateStr)) {
        const existingIdx = newRecords.findIndex(r => r.employeeId === req.employeeId && r.date === dateStr);

        if (req.type === 'permission') {
          if (existingIdx >= 0) {
            const existing = newRecords[existingIdx];
            if (existing.checkIn) {
              newRecords[existingIdx] = {
                ...existing,
                lateMinutes: 0,
                lateSeconds: 0,
                status: existing.checkOut ? 'on_time' : 'in_progress',
                isExcused: true,
                excusedReason: req.reason || 'إذن خروج معتمد'
              };
            } else {
              newRecords[existingIdx] = {
                ...existing,
                status: 'on_leave',
                leaveType: 'permission',
                lateMinutes: 0,
                lateSeconds: 0,
                notes: req.reason ? `إذن: ${req.reason}` : 'إذن خروج معتمد'
              };
            }
          } else {
            newRecords.push({
              id: `rec-leave-${req.employeeId}-${dateStr}`,
              employeeId: req.employeeId,
              date: dateStr,
              status: 'on_leave',
              leaveType: 'permission',
              workHours: 0,
              lateMinutes: 0,
              earlyLeaveMinutes: 0,
              overtimeHours: 0,
              notes: req.reason ? `إذن: ${req.reason}` : 'إذن خروج معتمد',
              verifiedByFace: true,
            });
          }
        } else {
          const notesText = req.type === 'sick'
            ? `إجازة مرضية: ${req.reason || 'تقرير طبي'}`
            : req.type === 'casual'
            ? `إجازة عارضة: ${req.reason || 'ظرف طارئ'}`
            : req.type === 'annual' || req.type === 'regular'
            ? `إجازة اعتيادية: ${req.reason || 'رصيد سنوي'}`
            : (req.reason ? `إجازة (${req.type}): ${req.reason}` : 'إجازة معتمدة');

          const leaveRec: AttendanceRecord = {
            id: existingIdx >= 0 ? newRecords[existingIdx].id : `rec-leave-${req.employeeId}-${dateStr}`,
            employeeId: req.employeeId,
            date: dateStr,
            status: 'on_leave',
            leaveType: req.type,
            workHours: 0,
            lateMinutes: 0,
            earlyLeaveMinutes: 0,
            overtimeHours: 0,
            notes: notesText,
            verifiedByFace: true,
          };

          if (existingIdx >= 0) {
            newRecords[existingIdx] = leaveRec;
          } else {
            newRecords.push(leaveRec);
          }
        }
        }

        cur.setDate(cur.getDate() + 1);
      }
      nextAttendance = sanitizeAttendanceWithPermissions(newRecords, nextLeaves);
    } else if (wasApproved && status !== 'approved' && updatedTargetReq) {
      // REVOKING AN APPROVED LEAVE: Restore balance and remove generated on_leave attendance records
      const req = updatedTargetReq;
      const days = calculateWorkDaysInPeriod(req.startDate, req.endDate);

      // Restore balances
      if (req.type === 'sick' || req.type === 'casual' || req.type === 'emergency' || req.type === 'regular' || req.type === 'annual') {
        nextEmployees = employeesRef.current.map(emp => {
          if (emp.id === req.employeeId) {
            if (req.type === 'sick') {
              const sickBal = emp.sickLeaveBalance ?? 30;
              return { ...emp, sickLeaveBalance: sickBal + days };
            } else if (req.type === 'casual' || req.type === 'emergency') {
              const casual = emp.casualLeaveBalance ?? 7;
              const annual = emp.annualLeaveBalance ?? 15;
              return { ...emp, casualLeaveBalance: casual + days, annualLeaveBalance: annual + days };
            } else {
              const regular = emp.regularLeaveBalance ?? 8;
              const annual = emp.annualLeaveBalance ?? 15;
              return { ...emp, regularLeaveBalance: regular + days, annualLeaveBalance: annual + days };
            }
          }
          return emp;
        });
      }

      // Remove on_leave attendance records generated for this leave
      nextAttendance = attendanceRecordsRef.current.filter(r => {
        if (r.employeeId === req.employeeId && r.status === 'on_leave' && r.date >= req.startDate && r.date <= req.endDate) {
          return false;
        }
        return true;
      });
    }

    setEmployees(nextEmployees);
    employeesRef.current = nextEmployees;
    localStorage.setItem('attendance_employees', JSON.stringify(nextEmployees));

    setAttendanceRecords(nextAttendance);
    attendanceRecordsRef.current = nextAttendance;
    localStorage.setItem('attendance_records', JSON.stringify(nextAttendance));

    pushSync({
      leaveRequests: nextLeaves,
      employees: nextEmployees,
      attendanceRecords: nextAttendance
    });
  };

  // Export CSV helper
  const handleExportCSV = () => {
    exportToCSV(attendanceRecords, (id) => {
      const emp = employees.find(e => e.id === id);
      return emp ? emp.nameAr : id;
    });
  };

  // Bulk Import Leave Records Success Handler
  const handleImportLeavesSuccess = async (newRecords: LeaveRequest[]) => {
    let currentLeaves = [...newRecords, ...leaveRequestsRef.current];
    let currentEmployees = [...employeesRef.current];
    let currentAttendance = [...attendanceRecordsRef.current];

    // Apply effects (balance deduction & attendance records sync) for all approved imported requests
    for (const req of newRecords) {
      if (req.status !== 'approved') continue;

      const days = calculateWorkDaysInPeriod(req.startDate, req.endDate);

      // 1. Balance Deductions
      if (req.type === 'sick' || req.type === 'casual' || req.type === 'emergency' || req.type === 'regular' || req.type === 'annual') {
        currentEmployees = currentEmployees.map(emp => {
          if (emp.id === req.employeeId) {
            if (req.type === 'sick') {
              const sickBal = emp.sickLeaveBalance ?? 30;
              return { ...emp, sickLeaveBalance: Math.max(0, sickBal - days) };
            } else if (req.type === 'casual' || req.type === 'emergency') {
              const casual = emp.casualLeaveBalance ?? 7;
              const annual = emp.annualLeaveBalance ?? (casual + (emp.regularLeaveBalance ?? 8));
              return { ...emp, casualLeaveBalance: Math.max(0, casual - days), annualLeaveBalance: Math.max(0, annual - days) };
            } else {
              const regular = emp.regularLeaveBalance ?? 8;
              const annual = emp.annualLeaveBalance ?? ((emp.casualLeaveBalance ?? 7) + regular);
              return { ...emp, regularLeaveBalance: Math.max(0, regular - days), annualLeaveBalance: Math.max(0, annual - days) };
            }
          }
          return emp;
        });
      }

      // 2. Attendance Records Sync for every day in date range
      const cur = new Date(req.startDate);
      const endDateObj = new Date(req.endDate);

      while (cur <= endDateObj) {
        const dateStr = getTodayString(cur);
        if (!isWeekend(dateStr)) {
        const existingIdx = currentAttendance.findIndex(r => r.employeeId === req.employeeId && r.date === dateStr);

        if (req.type === 'permission') {
          if (existingIdx >= 0) {
            const existing = currentAttendance[existingIdx];
            if (existing.checkIn) {
              currentAttendance[existingIdx] = {
                ...existing,
                lateMinutes: 0,
                lateSeconds: 0,
                status: existing.checkOut ? 'on_time' : 'in_progress',
                isExcused: true,
                excusedReason: req.reason || 'إذن خروج معتمد'
              };
            } else {
              currentAttendance[existingIdx] = {
                ...existing,
                status: 'on_leave',
                leaveType: 'permission',
                lateMinutes: 0,
                lateSeconds: 0,
                notes: req.reason ? `إذن: ${req.reason}` : 'إذن خروج معتمد'
              };
            }
          } else {
            currentAttendance.push({
              id: `rec-leave-${req.employeeId}-${dateStr}`,
              employeeId: req.employeeId,
              date: dateStr,
              status: 'on_leave',
              leaveType: 'permission',
              workHours: 0,
              lateMinutes: 0,
              earlyLeaveMinutes: 0,
              overtimeHours: 0,
              notes: req.reason ? `إذن: ${req.reason}` : 'إذن خروج معتمد',
              verifiedByFace: true,
            });
          }
        } else {
          const notesText = req.type === 'sick'
            ? `إجازة مرضية: ${req.reason || 'تقرير طبي'}`
            : req.type === 'casual'
            ? `إجازة عارضة: ${req.reason || 'ظرف طارئ'}`
            : req.type === 'annual' || req.type === 'regular'
            ? `إجازة اعتيادية: ${req.reason || 'رصيد سنوي'}`
            : (req.reason ? `إجازة (${req.type}): ${req.reason}` : 'إجازة معتمدة');

          const leaveRec: AttendanceRecord = {
            id: existingIdx >= 0 ? currentAttendance[existingIdx].id : `rec-leave-${req.employeeId}-${dateStr}`,
            employeeId: req.employeeId,
            date: dateStr,
            status: 'on_leave',
            leaveType: req.type,
            workHours: 0,
            lateMinutes: 0,
            earlyLeaveMinutes: 0,
            overtimeHours: 0,
            notes: notesText,
            verifiedByFace: true,
          };

          if (existingIdx >= 0) {
            currentAttendance[existingIdx] = leaveRec;
          } else {
            currentAttendance.push(leaveRec);
          }
        }
        }

        cur.setDate(cur.getDate() + 1);
      }
    }

    // Sanitize any remaining records against approved permissions
    currentAttendance = sanitizeAttendanceWithPermissions(currentAttendance, currentLeaves);

    // Save state atomically
    setLeaveRequests(currentLeaves);
    leaveRequestsRef.current = currentLeaves;
    localStorage.setItem('attendance_leaves', JSON.stringify(currentLeaves));

    setEmployees(currentEmployees);
    employeesRef.current = currentEmployees;
    localStorage.setItem('attendance_employees', JSON.stringify(currentEmployees));

    setAttendanceRecords(currentAttendance);
    attendanceRecordsRef.current = currentAttendance;
    localStorage.setItem('attendance_records', JSON.stringify(currentAttendance));

    // Sync to backend in one single API call
    pushSync({
      leaveRequests: currentLeaves,
      employees: currentEmployees,
      attendanceRecords: currentAttendance
    });
  };

  const pendingLeavesCount = React.useMemo(() => {
    if (!leaveRequests || leaveRequests.length === 0) return 0;
    if (!currentUser) return leaveRequests.filter(l => l.status === 'pending').length;
    if (currentUser.role === 'employee') {
      return leaveRequests.filter(l => l.status === 'pending' && l.employeeId === currentUser.id).length;
    }
    if (currentUser.role === 'leader') {
      const hasExplicitTeam = employees.some(e => e.teamLeaderId === currentUser.id);
      if (hasExplicitTeam) {
        const assignedEmpIds = new Set(
          employees
            .filter(e => e.teamLeaderId === currentUser.id || (currentUser.teamId && e.teamId === currentUser.teamId))
            .map(e => e.id)
        );
        if (assignedEmpIds.size > 0) {
          return leaveRequests.filter(l => l.status === 'pending' && (assignedEmpIds.has(l.employeeId) || l.employeeId === currentUser.id)).length;
        }
      }
    }
    return leaveRequests.filter(l => l.status === 'pending').length;
  }, [leaveRequests, currentUser, employees]);

  return (
    <div className="min-h-screen bg-slate-100/70 text-slate-900 font-sans antialiased selection:bg-emerald-500 selection:text-white">
      {/* Top Main Navigation Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        lang={lang}
        setLang={setLang}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        pendingLeavesCount={pendingLeavesCount}
        companyNameAr={companyNameAr}
        companyNameEn={companyNameEn}
        onOpenImportModal={() => { setImportModalTab('company'); setIsImportModalOpen(true); }}
        onOpenBackupModal={() => { setImportModalTab('backup'); setIsImportModalOpen(true); }}
        onOpenRulesModal={() => setIsRulesModalOpen(true)}
        onOpenNoticeModal={() => setIsNoticeModalOpen(true)}
        currentUser={currentUser}
        onOpenLoginModal={() => setIsLoginModalOpen(true)}
        onLogout={handleLogout}
        onUpdateEmployee={handleUpdateEmployee}
        employees={employees}
        attendanceRecords={attendanceRecords}
        leaveRequests={leaveRequests}
      />

      {/* Prominent Urgent Notice Banner for All Employees */}
      <UrgentNoticeBanner
        notice={urgentNotice}
        onEditNotice={() => setIsNoticeModalOpen(true)}
        lang={lang}
        isLeader={currentUser?.role === 'leader' || !currentUser}
      />

      {/* Main Content Area */}
      <main className="py-6 pb-16">
        {activeTab === 'dashboard' && (
          <DashboardOverview
            employees={employees}
            attendanceRecords={attendanceRecords}
            leaveRequests={leaveRequests}
            onOpenManualPunch={() => setActiveTab('attendance')}
            onOpenAddEmployee={() => setActiveTab('employees')}
            onExportCSV={handleExportCSV}
            onUpdateLeaveStatus={handleUpdateLeaveStatus}
            onDeleteRecord={handleDeleteRecord}
            onClearTodayRecords={handleClearTodayRecords}
            setActiveTab={setActiveTab}
            lang={lang}
            onForceEndBreak={handleForceEndBreak}
            currentUser={currentUser}
          />
        )}

        {activeTab === 'kiosk' && (
          <KioskPunch
            employees={employees}
            shifts={shifts}
            todayRecords={attendanceRecords.filter(r => r.date === getTodayString())}
            leaveRequests={leaveRequests}
            onPunch={handlePunch}
            onAddLeave={handleAddLeave}
            lang={lang}
            currentUser={currentUser}
          />
        )}

        {activeTab === 'attendance' && (
          <AttendanceLogTable
            records={attendanceRecords}
            employees={employees}
            shifts={shifts}
            leaveRequests={leaveRequests}
            onAddRecord={handleAddRecord}
            onBatchAddRecords={handleBatchAddRecords}
            onUpdateRecord={handleUpdateRecord}
            onDeleteRecord={handleDeleteRecord}
            onClearTodayRecords={handleClearTodayRecords}
            onDeleteFutureRecords={handleDeleteFutureAttendance}
            onExportCSV={handleExportCSV}
            lang={lang}
            onForceEndBreak={handleForceEndBreak}
            currentUser={currentUser}
            globalSearchTerm={searchTerm}
          />
        )}

        {activeTab === 'employees' && (
          <EmployeeManager
            employees={employees}
            shifts={shifts}
            attendanceRecords={attendanceRecords}
            leaveRequests={leaveRequests}
            onAddEmployee={handleAddEmployee}
            onUpdateEmployee={handleUpdateEmployee}
            onDeleteEmployee={handleDeleteEmployee}
            lang={lang}
            onOpenImportModal={() => setIsImportModalOpen(true)}
            globalSearchTerm={searchTerm}
          />
        )}

        {activeTab === 'leaves' && (<>
          <LeaveManager
            leaveRequests={leaveRequests}
            employees={employees}
            officialHolidays={officialHolidays}
            onAddLeave={handleAddLeave}
            onUpdateLeaveStatus={handleUpdateLeaveStatus}
            onDeleteLeave={handleDeleteLeaveRequest}
            onAddOfficialHoliday={handleAddOfficialHoliday}
            onDeleteOfficialHoliday={handleDeleteOfficialHoliday}
            currentUser={currentUser}
            lang={lang}
            globalSearchTerm={searchTerm}
          />
          
        </>)}

        {activeTab === 'import_leaves' && (
          <ImportLeavesView
            employees={employees}
            existingLeaves={leaveRequests}
            onImportSuccess={handleImportLeavesSuccess}
            currentUser={currentUser}
            lang={lang}
            onDeleteFutureRecords={handleDeleteFutureAttendance}
          />
        )}

        {activeTab === 'analytics' && (
          <AnalyticsView
            records={attendanceRecords}
            employees={employees}
            leaveRequests={leaveRequests}
            lang={lang}
            globalSearchTerm={searchTerm}
          />
        )}

        {activeTab === 'portal' && (
          <EmployeePortal
            employees={employees}
            attendanceRecords={attendanceRecords}
            leaveRequests={leaveRequests}
            onPunch={handlePunch}
            onAddLeave={handleAddLeave}
            onUpdateEmployee={handleUpdateEmployee}
            onAddRecord={handleAddRecord}
            onUpdateRecord={handleUpdateRecord}
            onUpdateLeaveStatus={handleUpdateLeaveStatus}
            shifts={shifts}
            lang={lang}
            currentUser={currentUser}
          />
        )}
      </main>

      {/* Login Modal */}
      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
        employees={employees}
        onLoginSuccess={handleLoginSuccess}
        lang={lang}
      />

      {/* Data Import & Backup Modal */}
      <DataImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImportEmployees={handleImportEmployees}
        onImportAttendance={handleImportAttendance}
        employeesCount={employees.length}
        lang={lang}
        initialTab={importModalTab}
      />

      {/* Official Company Rules & Regulations Modal */}
      <CompanyRulesModal
        isOpen={isRulesModalOpen}
        onClose={() => setIsRulesModalOpen(false)}
        lang={lang}
      />

      {/* Urgent Announcement & Notice Modal */}
      <UrgentNoticeModal
        isOpen={isNoticeModalOpen}
        onClose={() => setIsNoticeModalOpen(false)}
        notice={urgentNotice}
        onSaveNotice={handleSaveUrgentNotice}
        lang={lang}
        authorName={
          currentUser 
            ? `${(lang === 'ar' ? currentUser.nameAr : currentUser.nameEn) || currentUser.nameAr || currentUser.nameEn || 'فريق القيادة'} (${currentUser.role === 'leader' ? 'Team Leader' : (lang === 'ar' ? 'إدارة' : 'Admin')})`
            : (lang === 'ar' ? 'فريق القيادة (Team Leader)' : 'Management (Team Leader)')
        }
      />

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-400 text-xs py-6 border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-4 flex flex-col gap-5">
          {/* Official Social Links & Channels */}
          <CompanySocialBar lang={lang} variant="footer" />

          <div className="pt-4 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-right">
            <div className="flex items-center gap-2.5">
              <div className="h-7 px-2 py-0.5 rounded-md bg-white border border-slate-700 flex items-center justify-center shrink-0">
                <img 
                  src="logo.png"
                  alt="Tech Source GDS" 
                  className="h-full w-auto object-contain"
                  onError={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }}
                />
              </div>
              <span className="font-medium text-slate-300">
                {lang === 'ar' ? `TECH SOURCE - GDS Global © 2026 - جميع الحقوق محفوظة` : `TECH SOURCE - GDS Global © 2026 - All Rights Reserved`}
              </span>
            </div>
            <div className="flex items-center gap-3 text-slate-400 font-mono text-[11px]">
              <span>by/Ahmed Mahmoud</span>
              <span>•</span>
              <span className="text-emerald-400 font-bold">{lang === 'ar' ? 'إصدار المؤسسات V2.5' : 'Enterprise V2.5'}</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
useEffect(() => {
  const syncDataFromServer = async () => {
    try {
      const response = await fetch('/api/data?t=' + Date.now(), {
        cache: 'no-store'
      });
      const data = await response.json();

      if (data && data.success) {
        if (data.records) setAttendanceRecords(data.records);
        if (data.employees) setEmployees(data.employees);
        if (data.shifts) setShifts(data.shifts);
      }
    } catch (err) {
      console.error("خطأ في جلب البيانات:", err);
    }
  };

  syncDataFromServer();
}, []);


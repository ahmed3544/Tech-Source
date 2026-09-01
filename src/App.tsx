import React, { useState, useEffect, useRef } from 'react';
import { Header } from './components/Header';
import { NotificationCenter } from './components/NotificationCenter';
import { DashboardOverview } from './components/DashboardOverview';
import { KioskPunch } from './components/KioskPunch';
import { AttendanceLogTable } from './components/AttendanceLogTable';
import { EmployeeManager } from './components/EmployeeManager';
import { LeaveManager } from './components/LeaveManager';
import { AnalyticsView } from './components/AnalyticsView';
import { EmployeePortal } from './components/EmployeePortal';
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
  OfficialHoliday,
  Notification,
  NotificationType
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
  ensureSanitizedRecord,
  calculateWorkDaysInPeriod,
  isWeekend,
  getNowTimeString
} from './utils/helpers';


/* =========================================================
   CLIENT LEAVE MERGE
   ========================================================= */

function mergeLeaveRequestsClient(
  existing: LeaveRequest[] = [],
  incoming: LeaveRequest[] = []
): LeaveRequest[] {
  const map = new Map<string, LeaveRequest>();

  for (const item of existing) {
    if (item?.id) {
      map.set(item.id, { ...item });
    }
  }

  for (const item of incoming) {
    if (item?.id) {
      const old = map.get(item.id);

      map.set(
        item.id,
        old
          ? { ...old, ...item }
          : { ...item }
      );
    }
  }

  return Array.from(map.values());
}


export default function App() {

  /* =========================================================
     BASIC STATE
     ========================================================= */

  const [lang, setLang] =
    useState<Language>('ar');

  const [activeTab, setActiveTab] =
    useState<
      'dashboard'
      | 'kiosk'
      | 'attendance'
      | 'employees'
      | 'leaves'
      | 'import_leaves'
      | 'analytics'
      | 'portal'
    >('dashboard');

  const [searchTerm, setSearchTerm] =
    useState('');


  /* =========================================================
     CURRENT USER
     ========================================================= */

  const [currentUser, setCurrentUser] =
    useState<Employee | null>(() => {

      try {
        const saved =
          localStorage.getItem(
            'logged_in_user'
          );

        if (saved) {
          const parsed =
            JSON.parse(saved) as Employee;

          if (
            parsed?.id &&
            parsed.status !== 'inactive'
          ) {
            return parsed;
          }
        }
      } catch {}

      return null;
    });


  const [isLoginModalOpen, setIsLoginModalOpen] =
    useState<boolean>(() => !currentUser);

  const [isRulesModalOpen, setIsRulesModalOpen] =
    useState(false);

  const [isNoticeModalOpen, setIsNoticeModalOpen] =
    useState(false);


  /* =========================================================
     URGENT NOTICE
     ========================================================= */

  const [urgentNotice, setUrgentNotice] =
    useState<UrgentNotice | null>(() => {

      try {
        const saved =
          localStorage.getItem(
            'urgent_notice'
          );

        if (saved) {
          return JSON.parse(saved);
        }
      } catch {}

      return null;
    });


  /* =========================================================
     COMPANY SETTINGS
     ========================================================= */

  const [companyNameAr, setCompanyNameAr] =
    useState<string>(() =>
      localStorage.getItem(
        'company_name_ar'
      ) ||
      'شركة TECH SOURCE GDS'
    );

  const [companyNameEn, setCompanyNameEn] =
    useState<string>(() =>
      localStorage.getItem(
        'company_name_en'
      ) ||
      'TECH SOURCE - GDS Global'
    );


  /* =========================================================
     EMPLOYEES
     ========================================================= */

  const [employees, setEmployees] =
    useState<Employee[]>(() => {

      try {
        const saved =
          localStorage.getItem(
            'attendance_employees'
          );

        if (saved) {

          const parsed =
            JSON.parse(saved) as Employee[];

          if (
            Array.isArray(parsed) &&
            parsed.length > 0
          ) {

            const existingIds =
              new Set(
                parsed.map(
                  e => e.id
                )
              );

            const missingInitial =
              INITIAL_EMPLOYEES.filter(
                e =>
                  !existingIds.has(
                    e.id
                  )
              );

            return [
              ...parsed,
              ...missingInitial
            ];
          }
        }
      } catch {}

      return INITIAL_EMPLOYEES;
    });


  const [shifts] =
    useState<Shift[]>(
      INITIAL_SHIFTS
    );


  /* =========================================================
     ATTENDANCE
     ========================================================= */

  const [attendanceRecords, setAttendanceRecords] =
    useState<AttendanceRecord[]>(() => {

      try {
        const saved =
          localStorage.getItem(
            'attendance_records'
          );

        if (saved) {

          const parsed =
            JSON.parse(saved) as AttendanceRecord[];

          if (Array.isArray(parsed)) {
            return parsed;
          }
        }
      } catch {}

      return INITIAL_ATTENDANCE;
    });


  /* =========================================================
     OVERTIME
     ========================================================= */

  const [overtimeRequests, setOvertimeRequests] =
    useState<any[]>([]);


  /* =========================================================
     LEAVES
     ========================================================= */

  const [leaveRequests, setLeaveRequests] =
    useState<LeaveRequest[]>(() => {

      try {
        const saved =
          localStorage.getItem(
            'attendance_leaves'
          );

        if (saved) {

          const parsed =
            JSON.parse(saved) as LeaveRequest[];

          if (Array.isArray(parsed)) {
            return parsed;
          }
        }
      } catch {}

      return INITIAL_LEAVES;
    });


  /* =========================================================
     OFFICIAL HOLIDAYS
     ========================================================= */

  const [officialHolidays, setOfficialHolidays] =
    useState<OfficialHoliday[]>(() => {

      try {
        const saved =
          localStorage.getItem(
            'official_holidays'
          );

        if (saved) {

          const parsed =
            JSON.parse(saved);

          if (
            Array.isArray(parsed) &&
            parsed.length > 0
          ) {
            return parsed;
          }
        }
      } catch {}

      return INITIAL_OFFICIAL_HOLIDAYS;
    });


  /* =========================================================
     NOTIFICATIONS
     ========================================================= */

  const [notifications, setNotifications] =
    useState<Notification[]>(() => {

      try {
        const saved =
          localStorage.getItem(
            'notifications'
          );

        if (saved) {

          const parsed =
            JSON.parse(saved) as Notification[];

          if (Array.isArray(parsed)) {
            return parsed;
          }
        }
      } catch {}

      return [];
    });


  /* =========================================================
     REFS
     ========================================================= */

  const employeesRef =
    useRef(employees);

  const attendanceRecordsRef =
    useRef(attendanceRecords);

  const leaveRequestsRef =
    useRef(leaveRequests);

  const notificationsRef =
    useRef(notifications);

  const companyNameArRef =
    useRef(companyNameAr);

  const companyNameEnRef =
    useRef(companyNameEn);

  const urgentNoticeRef =
    useRef(urgentNotice);

  const lastLocalUpdateRef =
    useRef<number>(0);

  const syncInFlightRef =
    useRef(false);

  const syncQueuedPayloadRef =
    useRef<Record<string, any> | null>(null);

  const serverSyncInFlightRef =
    useRef(false);

  const pullFromServerRef =
    useRef<(() => Promise<void>) | null>(null);


  /*
   * Leave status decisions that were applied locally
   * and are not confirmed by the server yet.
   *
   * They win over any incoming server copy so an
   * approved / rejected request never flickers back
   * to pending while the server catches up.
   */

  const pendingLeaveDecisionsRef =
    useRef<
      Map<
        string,
        {
          status: LeaveStatus;
          reviewNotes?: string;
          expiresAt: number;
        }
      >
    >(new Map());


  const applyPendingLeaveDecisions =
    (
      serverLeaves: LeaveRequest[]
    ): LeaveRequest[] => {

      const decisions =
        pendingLeaveDecisionsRef.current;


      if (
        decisions.size ===
        0
      ) {
        return serverLeaves;
      }


      const now =
        Date.now();


      return serverLeaves.map(
        leave => {

          const decision =
            decisions.get(
              leave.id
            );


          if (!decision) {
            return leave;
          }


          if (
            leave.status ===
              decision.status ||
            now >
              decision.expiresAt
          ) {

            decisions.delete(
              leave.id
            );

            return leave;
          }


          return {
            ...leave,
            status:
              decision.status,
            reviewNotes:
              decision.reviewNotes ??
              leave.reviewNotes
          };
        }
      );
    };


  /* =========================================================
     KEEP REFS UPDATED
     ========================================================= */

  useEffect(() => {
    employeesRef.current =
      employees;
  }, [employees]);


  useEffect(() => {
    attendanceRecordsRef.current =
      attendanceRecords;
  }, [attendanceRecords]);


  useEffect(() => {
    leaveRequestsRef.current =
      leaveRequests;
  }, [leaveRequests]);


  useEffect(() => {
    notificationsRef.current =
      notifications;
  }, [notifications]);


  useEffect(() => {
    companyNameArRef.current =
      companyNameAr;
  }, [companyNameAr]);


  useEffect(() => {
    companyNameEnRef.current =
      companyNameEn;
  }, [companyNameEn]);


  useEffect(() => {
    urgentNoticeRef.current =
      urgentNotice;
  }, [urgentNotice]);


  /* =========================================================
   CENTRAL PUSH SYNC
   ========================================================= */

const pushSync = async (
  overrides?: {
    employees?: Employee[];
    attendanceRecords?: AttendanceRecord[];
    leaveRequests?: LeaveRequest[];
    notifications?: Notification[];
    companyNameAr?: string;
    companyNameEn?: string;
    urgentNotice?: UrgentNotice | null;
    deletedAttendanceIds?: string[];
    deletedEmployeeIds?: string[];
    deletedLeaveIds?: string[];
    replaceAttendance?: boolean;
  }
) => {

  const now = Date.now();

  lastLocalUpdateRef.current = now;

  const payload: Record<string, any> = {
    lastUpdated: now
  };

  if (overrides?.employees !== undefined) {
    payload.employees = overrides.employees;
  }

  if (overrides?.attendanceRecords !== undefined) {
    payload.attendanceRecords =
      overrides.attendanceRecords;
  }

  if (overrides?.leaveRequests !== undefined) {
    payload.leaveRequests =
      overrides.leaveRequests;
  }

  if (overrides?.notifications !== undefined) {
    payload.notifications =
      overrides.notifications;
  }

  if (overrides?.companyNameAr !== undefined) {
    payload.companyNameAr =
      overrides.companyNameAr;
  }

  if (overrides?.companyNameEn !== undefined) {
    payload.companyNameEn =
      overrides.companyNameEn;
  }

  if (overrides?.urgentNotice !== undefined) {
    payload.urgentNotice =
      overrides.urgentNotice;
  }

  if (overrides?.deletedAttendanceIds) {
    payload.deletedAttendanceIds =
      overrides.deletedAttendanceIds;
  }

  if (overrides?.deletedEmployeeIds) {
    payload.deletedEmployeeIds =
      overrides.deletedEmployeeIds;
  }

  if (overrides?.deletedLeaveIds) {
    payload.deletedLeaveIds =
      overrides.deletedLeaveIds;
  }

  if (overrides?.replaceAttendance) {
    payload.replaceAttendance = true;
  }

  /*
   * لو Sync شغال بالفعل:
   * احتفظ بآخر Mutation فقط.
   */
  if (syncInFlightRef.current) {

    syncQueuedPayloadRef.current = {
      ...(syncQueuedPayloadRef.current || {}),
      ...payload,
      lastUpdated: now
    };

    return;
  }

  syncInFlightRef.current = true;

  try {

    const controller =
      new AbortController();

    const timeout =
      window.setTimeout(
        () => controller.abort(),
        10000
      );

    try {

      const res =
        await fetch(
          `/api/sync?_=${Date.now()}`,
          {
            method: 'POST',

            headers: {
              'Content-Type':
                'application/json',

              'Cache-Control':
                'no-cache',

              'Pragma':
                'no-cache'
            },

            body:
              JSON.stringify(payload),

            signal:
              controller.signal,

            cache:
              'no-store'
          }
        );

      if (!res.ok) {
        throw new Error(
          `Sync failed: ${res.status}`
        );
      }

      const data =
        await res.json();

      /*
       * السيرفر رجع البيانات النهائية.
       * نحدث timestamp فقط.
       */
      if (data?.lastUpdated) {

        const serverTime =
          Number(
            data.lastUpdated
          );

        if (
          Number.isFinite(serverTime)
        ) {

          lastLocalUpdateRef.current =
            Math.max(
              lastLocalUpdateRef.current,
              serverTime
            );
        }
      }

      /*
       * IMPORTANT:
       * اعمل Pull فوري بعد نجاح الـ Sync.
       * لا ننتظر الـ polling.
       */
      if (
        pullFromServerRef.current
      ) {
        void pullFromServerRef.current();
      }

    } finally {

      window.clearTimeout(
        timeout
      );
    }

  } catch (error: any) {

    if (
      error?.name ===
      'AbortError'
    ) {

      console.warn(
        'Sync request timed out.'
      );

    } else {

      console.warn(
        'Sync request failed:',
        error
      );
    }

  } finally {

    syncInFlightRef.current =
      false;

    /*
     * لو حصلت Mutation أخرى أثناء الـ Sync:
     * نفذ آخر واحدة فقط.
     */
    const queued =
      syncQueuedPayloadRef.current;

    syncQueuedPayloadRef.current =
      null;

    if (queued) {

      void pushSync(
        queued
      );

    } else if (
      pullFromServerRef.current
    ) {

      /*
       * Pull نهائي بعد انتهاء الـ Sync.
       */
      void pullFromServerRef.current();
    }
  }
};


  /* =========================================================
     CENTRAL SERVER PULL
     ========================================================= */

  useEffect(() => {

    let cancelled =
      false;


    const pullFromServer =
      async () => {

        if (
          cancelled ||
          serverSyncInFlightRef.current
        ) {
          return;
        }


        serverSyncInFlightRef.current =
          true;


        /*
         * Marker of the local state at the moment
         * this pull started.
         *
         * If it changes while the request is in flight,
         * the response is already stale and must be dropped.
         */
        const localMutationMark =
          lastLocalUpdateRef.current;


        try {

          const res =
            await fetch(
              '/api/data',
              {
                method: 'GET',
                headers: {
                  'Cache-Control':
                    'no-cache',
                  'Pragma':
                    'no-cache'
                },
                cache:
                  'no-store'
              }
            );


          if (!res.ok) {
            throw new Error(
              `Data sync failed: ${res.status}`
            );
          }


          const data =
            await res.json();


          if (
            cancelled ||
            !data
          ) {
            return;
          }


          const serverLastUpdated =
            Number(
              data.lastUpdated || 0
            );


          /*
           * A local mutation happened while this pull
           * was in flight, so the response cannot contain it.
           *
           * This check does not depend on the client and
           * server clocks being in sync.
           */
          if (
            syncInFlightRef.current ||
            lastLocalUpdateRef.current !==
              localMutationMark
          ) {
            return;
          }


          /*
           * IMPORTANT:
           * Do not overwrite a newer local mutation.
           */
          if (
            serverLastUpdated > 0 &&
            serverLastUpdated <
              lastLocalUpdateRef.current
          ) {
            return;
          }


          /* =================================================
             EMPLOYEES
             ================================================= */

          if (
            Array.isArray(
              data.employees
            )
          ) {

            employeesRef.current =
              data.employees;

            setEmployees(
              data.employees
            );

            try {
              localStorage.setItem(
                'attendance_employees',
                JSON.stringify(
                  data.employees
                )
              );
            } catch {}
          }


          /* =================================================
             ATTENDANCE
             ================================================= */

          if (
            Array.isArray(
              data.attendanceRecords
            )
          ) {

            const sanitized =
              data.attendanceRecords.map(
                ensureSanitizedRecord
              );


            attendanceRecordsRef.current =
              sanitized;

            setAttendanceRecords(
              sanitized
            );


            try {

              localStorage.setItem(
                'attendance_records',
                JSON.stringify(
                  sanitized
                )
              );

            } catch {}
          }


          /* =================================================
             LEAVES
             ================================================= */

          if (
            Array.isArray(
              data.leaveRequests
            )
          ) {

            /*
             * Server is authoritative.
             *
             * We replace the local list only when
             * no local mutation is currently being sent.
             */
            const serverLeaves =
              applyPendingLeaveDecisions(
                data.leaveRequests
              );


            leaveRequestsRef.current =
              serverLeaves;

            setLeaveRequests(
              serverLeaves
            );


            try {

              localStorage.setItem(
                'attendance_leaves',
                JSON.stringify(
                  serverLeaves
                )
              );

            } catch {}
          }


          /* =================================================
             NOTIFICATIONS
             ================================================= */

          if (
            Array.isArray(
              data.notifications
            )
          ) {

            const serverNotifications =
              data.notifications;


            notificationsRef.current =
              serverNotifications;

            setNotifications(
              serverNotifications
            );


            try {

              localStorage.setItem(
                'notifications',
                JSON.stringify(
                  serverNotifications
                )
              );

            } catch {}
          }


          /* =================================================
             COMPANY SETTINGS
             ================================================= */

          if (
            typeof data.companyNameAr ===
            'string'
          ) {

            companyNameArRef.current =
              data.companyNameAr;

            setCompanyNameAr(
              data.companyNameAr
            );


            try {
              localStorage.setItem(
                'company_name_ar',
                data.companyNameAr
              );
            } catch {}
          }


          if (
            typeof data.companyNameEn ===
            'string'
          ) {

            companyNameEnRef.current =
              data.companyNameEn;

            setCompanyNameEn(
              data.companyNameEn
            );


            try {
              localStorage.setItem(
                'company_name_en',
                data.companyNameEn
              );
            } catch {}
          }


          /* =================================================
             URGENT NOTICE
             ================================================= */

          if (
            Object.prototype.hasOwnProperty.call(
              data,
              'urgentNotice'
            )
          ) {

            const notice =
              data.urgentNotice ||
              null;


            urgentNoticeRef.current =
              notice;

            setUrgentNotice(
              notice
            );


            try {

              if (notice) {

                localStorage.setItem(
                  'urgent_notice',
                  JSON.stringify(
                    notice
                  )
                );

              } else {

                localStorage.removeItem(
                  'urgent_notice'
                );
              }

            } catch {}
          }


          if (
            serverLastUpdated > 0
          ) {

            lastLocalUpdateRef.current =
              Math.max(
                lastLocalUpdateRef.current,
                serverLastUpdated
              );
          }

        } catch (error) {

          console.warn(
            'Central sync failed:',
            error
          );

        } finally {

          serverSyncInFlightRef.current =
            false;
        }
      };


    void pullFromServer();


    pullFromServerRef.current =
      pullFromServer;


    const interval =
      window.setInterval(
        pullFromServer,
        1500
      );


    return () => {

      cancelled =
        true;

      window.clearInterval(
        interval
      );
    };

  }, []);


  /* =========================================================
     AUTO SANITIZE ATTENDANCE
     ========================================================= */

  useEffect(() => {

    setAttendanceRecords(
      prev => {

        const withLeaves =
          ensureApprovedLeaveRecords(
            prev,
            leaveRequests
          );


        const sanitized =
          sanitizeAttendanceWithPermissions(
            withLeaves,
            leaveRequests
          );


        let changed =
          false;


        if (
          sanitized.length !==
          prev.length
        ) {

          changed = true;

        } else {

          for (
            let i = 0;
            i < prev.length;
            i++
          ) {

            if (
              prev[i].lateMinutes !==
                sanitized[i].lateMinutes ||
              prev[i].status !==
                sanitized[i].status
            ) {

              changed = true;
              break;
            }
          }
        }


        if (changed) {

          attendanceRecordsRef.current =
            sanitized;

          return sanitized;
        }


        return prev;
      }
    );

  }, [leaveRequests]);


  /* =========================================================
     LOCAL STORAGE - ATTENDANCE
     ========================================================= */

  useEffect(() => {

    try {

      localStorage.setItem(
        'attendance_records',
        JSON.stringify(
          attendanceRecords
        )
      );

    } catch (error) {

      console.warn(
        'Could not save attendance records locally:',
        error
      );
    }

  }, [attendanceRecords]);


  /* =========================================================
     LOCAL STORAGE - LEAVES
     ========================================================= */

  useEffect(() => {

    try {

      localStorage.setItem(
        'attendance_leaves',
        JSON.stringify(
          leaveRequests
        )
      );

    } catch (error) {

      console.warn(
        'Could not save leave requests locally:',
        error
      );
    }

  }, [leaveRequests]);


  /* =========================================================
     OFFICIAL HOLIDAYS
     ========================================================= */

  const handleAddOfficialHoliday =
    (newHoliday: OfficialHoliday) => {

      const nextHolidays = [
        newHoliday,
        ...officialHolidays
      ];

      setOfficialHolidays(
        nextHolidays
      );

      localStorage.setItem(
        'official_holidays',
        JSON.stringify(
          nextHolidays
        )
      );
    };


  const handleDeleteOfficialHoliday =
    (id: string) => {

      const nextHolidays =
        officialHolidays.filter(
          h => h.id !== id
        );

      setOfficialHolidays(
        nextHolidays
      );

      localStorage.setItem(
        'official_holidays',
        JSON.stringify(
          nextHolidays
        )
      );
    };


  /* =========================================================
     LOGIN
     ========================================================= */

  useEffect(() => {

    if (
      currentUser &&
      currentUser.role ===
        'employee'
    ) {

      setActiveTab(
        'portal'
      );
    }


    if (!currentUser) {
      setIsLoginModalOpen(
        true
      );
    }

  }, [currentUser]);


  const handleLoginSuccess =
    (user: Employee) => {

      setCurrentUser(user);

      localStorage.setItem(
        'logged_in_user',
        JSON.stringify(user)
      );

      setIsLoginModalOpen(
        false
      );


      if (
        user.role ===
        'employee'
      ) {

        setActiveTab(
          'portal'
        );

      } else {

        setActiveTab(
          'dashboard'
        );
      }
    };


  const handleLogout =
    () => {

      setCurrentUser(null);

      localStorage.removeItem(
        'logged_in_user'
      );

      localStorage.removeItem(
        'attendance_current_user'
      );

      sessionStorage.removeItem(
        'logged_in_user'
      );

      setIsLoginModalOpen(
        true
      );
    };


  /* =========================================================
     COMPANY UPDATE
     ========================================================= */

  const handleUpdateCompany =
    (
      nameAr: string,
      nameEn: string
    ) => {

      setCompanyNameAr(
        nameAr
      );

      setCompanyNameEn(
        nameEn
      );


      companyNameArRef.current =
        nameAr;

      companyNameEnRef.current =
        nameEn;


      pushSync({
        companyNameAr:
          nameAr,
        companyNameEn:
          nameEn
      });
    };


  /* =========================================================
     IMPORT EMPLOYEES
     ========================================================= */

  const handleImportEmployees =
    (
      newEmployees: Employee[],
      overwrite: boolean
    ) => {

      let updatedList:
        Employee[];


      if (overwrite) {

        updatedList =
          newEmployees;

      } else {

        const existingCodes =
          new Set(
            employeesRef.current.map(
              e => e.code
            )
          );


        const filteredNew =
          newEmployees.filter(
            e =>
              !existingCodes.has(
                e.code
              )
          );


        updatedList = [
          ...employeesRef.current,
          ...filteredNew
        ];
      }


      employeesRef.current =
        updatedList;

      setEmployees(
        updatedList
      );


      localStorage.setItem(
        'attendance_employees',
        JSON.stringify(
          updatedList
        )
      );


      void pushSync({
        employees:
          updatedList
      });
    };


  /* =========================================================
     IMPORT ATTENDANCE
     ========================================================= */

  const handleImportAttendance =
    (
      newRecords: AttendanceRecord[],
      overwrite: boolean
    ) => {

      let updatedRecords:
        AttendanceRecord[];


      if (overwrite) {

        updatedRecords =
          newRecords;

      } else {

        updatedRecords = [
          ...attendanceRecordsRef.current,
          ...newRecords
        ];
      }


      updatedRecords =
        updatedRecords.map(
          ensureSanitizedRecord
        );


      attendanceRecordsRef.current =
        updatedRecords;

      setAttendanceRecords(
        updatedRecords
      );


      localStorage.setItem(
        'attendance_records',
        JSON.stringify(
          updatedRecords
        )
      );


      void pushSync({
        attendanceRecords:
          updatedRecords
      });
    };


  /* =========================================================
     RTL / LTR
     ========================================================= */

  useEffect(() => {

    document.documentElement.dir =
      lang === 'ar'
        ? 'rtl'
        : 'ltr';

    document.documentElement.lang =
      lang;

  }, [lang]);


  /* =========================================================
     OVERTIME
     ========================================================= */

  const handleUpdateOvertimeStatus =
    (
      id: string,
      status:
        | 'approved'
        | 'rejected'
    ) => {

      fetch(
        `/api/overtime/${id}/status`,
        {
          method: 'PUT',
          headers: {
            'Content-Type':
              'application/json'
          },
          body:
            JSON.stringify({
              status
            })
        }
      )
        .then(
          res =>
            res.json()
        )
        .then(
          data => {

            if (
              data.success
            ) {

              setOvertimeRequests(
                data.overtimeRequests ||
                  []
              );
            }
          }
        )
        .catch(
          error =>
            console.error(
              'Overtime update failed:',
              error
            )
        );
    };


  /* =========================================================
     PUNCH
     ========================================================= */

  const handlePunch =
    (
      employeeId: string,
      action:
        | 'check_in'
        | 'check_out'
        | 'break_start'
        | 'break_end'
        | 'force_break_end',
      location: string,
      notes?: string
    ) => {

      const todayStr =
        getTodayString();

      const nowTimeStr =
        getNowTimeString();


      const emp =
        employeesRef.current.find(
          e =>
            (e.id || '')
              .toLowerCase() ===
            (employeeId || '')
              .toLowerCase()
        );


      if (!emp) {
        return;
      }


      /* -------------------------------------------------------
         WEEKEND
         ------------------------------------------------------- */

      if (
        isWeekend(
          todayStr
        )
      ) {

        alert(
          lang === 'ar'
            ? 'عفواً، اليوم الجمعة/السبت عطلة أسبوعية رسمية! لا يمكن تسجيل الحضور والانصراف في العطلات الأسبوعية.'
            : 'Sorry, actions disabled! Today is a weekly weekend holiday (Friday/Saturday).'
        );

        return;
      }


      /* -------------------------------------------------------
         APPROVED LEAVE
         ------------------------------------------------------- */

      const activeApprovedLeave =
        leaveRequestsRef.current.find(
          l =>
            (l.employeeId || '')
              .toLowerCase() ===
              (employeeId || '')
                .toLowerCase() &&

            l.status ===
              'approved' &&

            l.type !==
              'permission' &&

            todayStr >=
              l.startDate &&

            todayStr <=
              l.endDate
        );


      const empIdNorm =
        (employeeId || '')
          .trim()
          .toLowerCase();


      const existingTodayRec =
        attendanceRecordsRef.current.find(
          r =>
            (r.employeeId || '')
              .trim()
              .toLowerCase() ===
              empIdNorm &&

            (r.date || '')
              .trim() ===
              todayStr
        );


      if (
        activeApprovedLeave ||
        existingTodayRec?.status ===
          'on_leave'
      ) {

        const empName =
          lang === 'ar'
            ? emp.nameAr
            : emp.nameEn;


        const leaveLabel =
          activeApprovedLeave
            ? getLeaveTypeLabel(
                activeApprovedLeave.type,
                lang
              )
            : lang === 'ar'
              ? 'إجازة معتمدة'
              : 'Approved Leave';


        alert(
          lang === 'ar'
            ? `عفواً، لا يمكن إجراء أي حركة اليوم! الموظف (${empName}) في إجازة معتمدة (${leaveLabel}).`
            : `Sorry, actions disabled! Employee (${empName}) is on active leave (${leaveLabel}).`
        );

        return;
      }


      const shift =
        shifts.find(
          s =>
            s.id ===
            emp.shiftId
        ) ||
        shifts[0];


      const currentRecs =
        attendanceRecordsRef.current ||
        [];


      const existingIndex =
        currentRecs.findIndex(
          r => {

            const rEmp =
              (r.employeeId || '')
                .trim()
                .toLowerCase();

            const rDate =
              (r.date || '')
                .trim();


            return (
              (
                rEmp ===
                  empIdNorm &&
                rDate ===
                  todayStr
              ) ||

              r.id ===
                `rec-${empIdNorm}-${todayStr}`
            );
          }
        );


      let updatedRecord:
        AttendanceRecord;

      let nextRecords:
        AttendanceRecord[];


      /* =====================================================
         EXISTING RECORD
         ===================================================== */

      if (
        existingIndex >= 0
      ) {

        const existing =
          currentRecs[
            existingIndex
          ];


        const updated = {
          ...existing
        };


        if (
          action ===
          'check_in'
        ) {

          if (
            existing.checkIn
          ) {

            alert(
              lang === 'ar'
                ? `عفواً، تم تسجيل الحضور بالفعل لهذا اليوم الساعة (${existing.checkIn})! التسجيل مسموح مرة واحدة فقط في اليوم.`
                : `Sorry, check-in has already been registered today at (${existing.checkIn})! Only 1 check-in allowed per day.`
            );

            return;
          }


          updated.checkIn =
            nowTimeStr;


        } else if (
          action ===
          'check_out'
        ) {

          if (
            existing.checkOut
          ) {

            alert(
              lang === 'ar'
                ? `عفواً، تم تسجيل الانصراف بالفعل لهذا اليوم الساعة (${existing.checkOut})! التسجيل مسموح مرة واحدة فقط في اليوم.`
                : `Sorry, check-out has already been registered today at (${existing.checkOut})! Only 1 check-out allowed per day.`
            );

            return;
          }


          if (
            !existing.checkIn
          ) {

            alert(
              lang === 'ar'
                ? 'عفواً، يجب تسجيل الحضور أولاً قبل إمكانية تسجيل الانصراف!'
                : 'Please check in first before checking out!'
            );

            return;
          }


          updated.checkOut =
            nowTimeStr;

          updated._isExplicitCancelCheckOut =
            false;


        } else if (
          action ===
          'break_start'
        ) {

          updated.breakStart =
            nowTimeStr;

          updated.breakEnd =
            undefined;

          updated.notes =
            (
              updated.notes
                ? updated.notes +
                  ' | '
                : ''
            ) +
            'بدأت الاستراحة: ' +
            nowTimeStr;


        } else if (
          action ===
          'break_end'
        ) {

          updated.breakStart =
            updated.breakStart ||
            existing.breakStart;

          updated.breakEnd =
            nowTimeStr;

          updated.notes =
            (
              updated.notes
                ? updated.notes +
                  ' | '
                : ''
            ) +
            'انتهت الاستراحة: ' +
            nowTimeStr;


        } else if (
          action ===
          'force_break_end'
        ) {

          updated.breakStart =
            updated.breakStart ||
            existing.breakStart;

          updated.breakEnd =
            nowTimeStr;

          updated.notes =
            (
              updated.notes
                ? updated.notes +
                  ' | '
                : ''
            ) +
            'تم إنهاء الاستراحة بواسطة التيم ليدر الساعة: ' +
            nowTimeStr;
        }


        if (notes) {

          updated.notes =
            (
              updated.notes
                ? updated.notes +
                  ' - '
                : ''
            ) +
            notes;
        }


        const todayApprovedPermission =
          leaveRequestsRef.current.find(
            l =>
              (
                l.employeeId ||
                ''
              ).toLowerCase() ===
                empIdNorm &&

              l.type ===
                'permission' &&

              l.status ===
                'approved' &&

              l.startDate ===
                todayStr
          );


        const permSlot =
          todayApprovedPermission
            ?.permissionSlot;


        const hasApprovedPerm =
          Boolean(
            todayApprovedPermission
          );


        const evaluated =
          evaluatePunch(
            updated.checkIn ||
              nowTimeStr,
            updated.checkOut ||
              undefined,
            shift,
            todayStr,
            permSlot,
            hasApprovedPerm,
            updated.breakStart,
            updated.breakEnd
          );


        updated.lateMinutes =
          evaluated.lateMinutes;

        updated.lateSeconds =
          evaluated.lateSeconds;

        updated.earlyLeaveMinutes =
          evaluated.earlyLeaveMinutes;

        updated.workHours =
          evaluated.workHours;

        updated.overtimeHours =
          evaluated.overtimeHours;

        updated.status =
          evaluated.status;

        updated.updatedAt =
          new Date().toISOString();


        updatedRecord =
          updated;


        nextRecords =
          [
            ...currentRecs
          ];

        nextRecords[
          existingIndex
        ] =
          updated;


      } else {

        /* ===================================================
           NEW RECORD
           =================================================== */

        const checkInVal =
          action ===
          'check_in'
            ? nowTimeStr
            : undefined;


        const checkOutVal =
          action ===
          'check_out'
            ? nowTimeStr
            : undefined;


        const breakStartVal =
          action ===
          'break_start'
            ? nowTimeStr
            : undefined;


        const breakEndVal =
          action ===
            'break_end' ||
          action ===
            'force_break_end'
            ? nowTimeStr
            : undefined;


        const todayApprovedPermission =
          leaveRequestsRef.current.find(
            l =>
              (
                l.employeeId ||
                ''
              ).toLowerCase() ===
                empIdNorm &&

              l.type ===
                'permission' &&

              l.status ===
                'approved' &&

              l.startDate ===
                todayStr
          );


        const permSlot =
          todayApprovedPermission
            ?.permissionSlot;


        const hasApprovedPerm =
          Boolean(
            todayApprovedPermission
          );


        const evaluated =
          evaluatePunch(
            checkInVal ||
              nowTimeStr,
            checkOutVal,
            shift,
            todayStr,
            permSlot,
            hasApprovedPerm
          );


        const newRecord:
          AttendanceRecord = {

            id:
              `rec-${empIdNorm}-${todayStr}`,

            employeeId:
              emp.id,

            date:
              todayStr,

            checkIn:
              checkInVal,

            checkOut:
              checkOutVal,

            breakStart:
              breakStartVal,

            breakEnd:
              breakEndVal,

            location,

            notes:
              action ===
              'force_break_end'
                ? 'تم إنهاء الاستراحة بواسطة التيم ليدر'
                : notes,

            lateMinutes:
              evaluated.lateMinutes,

            lateSeconds:
              evaluated.lateSeconds,

            earlyLeaveMinutes:
              evaluated.earlyLeaveMinutes,

            workHours:
              evaluated.workHours,

            overtimeHours:
              evaluated.overtimeHours,

            status:
              evaluated.status,

            verifiedByFace:
              true,

            updatedAt:
              new Date().toISOString()
          };


        updatedRecord =
          newRecord;


        nextRecords =
          [
            newRecord,
            ...currentRecs
          ];
      }


      /* =====================================================
         SAVE LOCALLY FIRST
         ===================================================== */

      attendanceRecordsRef.current =
        nextRecords;

      setAttendanceRecords(
        nextRecords
      );


      localStorage.setItem(
        'attendance_records',
        JSON.stringify(
          nextRecords
        )
      );


      lastLocalUpdateRef.current =
        Date.now();


      /* =====================================================
         SEND TO SERVER
         ===================================================== */

      void fetch(
        '/api/punch',
        {
          method: 'POST',
          headers: {
            'Content-Type':
              'application/json'
          },
          body:
            JSON.stringify({
              employeeId:
                emp.id,
              action,
              record:
                updatedRecord,
              nowTimeStr
            })
        }
      )
        .then(
          async res => {

            if (!res.ok) {
              throw new Error(
                `Punch API failed: ${res.status}`
              );
            }

            return res.json();
          }
        )
        .then(
          data => {

            if (
              data?.success &&
              Array.isArray(
                data.attendanceRecords
              )
            ) {

              const sanitized =
                data.attendanceRecords.map(
                  ensureSanitizedRecord
                );


              const merged =
                mergeAttendanceRecords(
                  sanitized,
                  attendanceRecordsRef.current ||
                    []
                );


              attendanceRecordsRef.current =
                merged;

              setAttendanceRecords(
                merged
              );


              localStorage.setItem(
                'attendance_records',
                JSON.stringify(
                  merged
                )
              );


              if (
                data.lastUpdated
              ) {

                lastLocalUpdateRef.current =
                  Number(
                    data.lastUpdated
                  );
              }
            }
          }
        )
        .catch(
          err => {

            console.error(
              'Punch Error:',
              err
            );

            /*
             * IMPORTANT:
             * Never erase the local punch
             * if the server is unavailable.
             */
          }
        );
    };


  /* =========================================================
     ADD ATTENDANCE RECORD
     ========================================================= */

  const handleAddRecord =
    (
      record: AttendanceRecord
    ) => {

      const recWithTime = {
        ...record,
        updatedAt:
          record.updatedAt ||
          new Date().toISOString()
      };


      const targetEmpId =
        (record.employeeId || '')
          .trim()
          .toLowerCase();


      const targetDate =
        (record.date || '')
          .trim();


      const targetId =
        record.id;


      const filtered =
        (
          attendanceRecordsRef.current ||
          []
        ).filter(
          r =>
            r.id !==
              targetId &&

            !(
              (
                r.employeeId ||
                ''
              )
                .trim()
                .toLowerCase() ===
                targetEmpId &&

              (
                r.date ||
                ''
              ).trim() ===
                targetDate
            )
        );


      const updated = [
        recWithTime,
        ...filtered
      ];


      attendanceRecordsRef.current =
        updated;

      setAttendanceRecords(
        updated
      );


      localStorage.setItem(
        'attendance_records',
        JSON.stringify(
          updated
        )
      );


      lastLocalUpdateRef.current =
        Date.now();


      void fetch(
        '/api/punch',
        {
          method: 'POST',
          headers: {
            'Content-Type':
              'application/json'
          },
          body:
            JSON.stringify({
              employeeId:
                record.employeeId,
              action:
                'update',
              record:
                recWithTime
            })
        }
      )
        .then(
          res =>
            res.json()
        )
        .then(
          data => {

            if (
              data?.success &&
              Array.isArray(
                data.attendanceRecords
              )
            ) {

              const sanitized =
                data.attendanceRecords.map(
                  ensureSanitizedRecord
                );


              attendanceRecordsRef.current =
                sanitized;

              setAttendanceRecords(
                sanitized
              );


              localStorage.setItem(
                'attendance_records',
                JSON.stringify(
                  sanitized
                )
              );


              if (
                data.lastUpdated
              ) {

                lastLocalUpdateRef.current =
                  Number(
                    data.lastUpdated
                  );
              }
            }
          }
        )
        .catch(
          () => {}
        );
    };


  /* =========================================================
     BATCH ATTENDANCE
     ========================================================= */

  const handleBatchAddRecords =
    (
      records: AttendanceRecord[]
    ) => {

      if (
        !records ||
        records.length === 0
      ) {
        return;
      }


      const nowIso =
        new Date().toISOString();


      const map =
        new Map<
          string,
          AttendanceRecord
        >();


      for (
        const r of
          attendanceRecordsRef.current ||
          []
      ) {

        const key =
          r.employeeId &&
          r.date
            ? `${r.employeeId}_${r.date}`
            : r.id;


        if (key) {
          map.set(
            key,
            r
          );
        }
      }


      for (
        const r of records
      ) {

        const key =
          r.employeeId &&
          r.date
            ? `${r.employeeId}_${r.date}`
            : r.id;


        if (key) {

          const sanitized =
            ensureSanitizedRecord({
              ...r,
              updatedAt:
                r.updatedAt ||
                nowIso
            });


          map.set(
            key,
            sanitized
          );
        }
      }


      const updated =
        Array.from(
          map.values()
        ).sort(
          (a, b) => {

            if (
              b.date !==
              a.date
            ) {

              return (
                b.date || ''
              ).localeCompare(
                a.date || ''
              );
            }


            return (
              a.employeeId ||
              ''
            ).localeCompare(
              b.employeeId ||
              ''
            );
          }
        );


      attendanceRecordsRef.current =
        updated;

      setAttendanceRecords(
        updated
      );


      localStorage.setItem(
        'attendance_records',
        JSON.stringify(
          updated
        )
      );


      lastLocalUpdateRef.current =
        Date.now();


      void pushSync({
        attendanceRecords:
          updated
      });
    };


  /* =========================================================
     UPDATE ATTENDANCE
     ========================================================= */

  const handleUpdateRecord =
    async (
      record: AttendanceRecord
    ) => {

      const recWithTime = {
        ...record,
        updatedAt:
          new Date().toISOString()
      };


      const targetEmpId =
        record.employeeId;

      const targetDate =
        record.date;

      const targetId =
        record.id;


      const filtered =
        (
          attendanceRecordsRef.current ||
          []
        ).filter(
          r =>
            r.id !==
              targetId &&

            !(
              r.employeeId ===
                targetEmpId &&
              r.date ===
                targetDate
            )
        );


      const nextRecords = [
        recWithTime,
        ...filtered
      ];


      attendanceRecordsRef.current =
        nextRecords;

      setAttendanceRecords(
        nextRecords
      );


      lastLocalUpdateRef.current =
        Date.now();


      try {

        const res =
          await fetch(
            '/api/punch',
            {
              method: 'POST',
              headers: {
                'Content-Type':
                  'application/json'
              },
              body:
                JSON.stringify({
                  employeeId:
                    targetEmpId,
                  action:
                    'update',
                  record:
                    recWithTime
                })
            }
          );


        if (!res.ok) {
          throw new Error(
            `Attendance update failed: ${res.status}`
          );
        }


        const data =
          await res.json();


        if (
          data?.success &&
          data.record
        ) {

          const serverRecord =
            ensureSanitizedRecord(
              data.record
            );


          const updatedFromServer = [
            serverRecord,
            ...(
              attendanceRecordsRef.current ||
              []
            ).filter(
              r =>
                r.id !==
                  serverRecord.id &&

                !(
                  r.employeeId ===
                    serverRecord.employeeId &&
                  r.date ===
                    serverRecord.date
                )
            )
          ];


          attendanceRecordsRef.current =
            updatedFromServer;

          setAttendanceRecords(
            updatedFromServer
          );


          localStorage.setItem(
            'attendance_records',
            JSON.stringify(
              updatedFromServer
            )
          );


          if (
            data.lastUpdated
          ) {

            lastLocalUpdateRef.current =
              Number(
                data.lastUpdated
              );
          }
        }

      } catch (error) {

        console.error(
          'Failed to update attendance record:',
          error
        );

        /*
         * Keep optimistic state.
         */
        attendanceRecordsRef.current =
          nextRecords;

        setAttendanceRecords(
          nextRecords
        );
      }
    };


  /* =========================================================
     FORCE BREAK END
     ========================================================= */

  const handleForceEndBreak =
    (empId: string) => {

      handlePunch(
        empId,
        'force_break_end',
        '',
        'إرجاع من الاستراحة بواسطة الليدر'
      );
    };


  /* =========================================================
     ADD EMPLOYEE
     ========================================================= */

  const handleAddEmployee =
    (emp: Employee) => {

      const nextEmps = [
        ...employeesRef.current,
        emp
      ];


      employeesRef.current =
        nextEmps;

      setEmployees(
        nextEmps
      );


      localStorage.setItem(
        'attendance_employees',
        JSON.stringify(
          nextEmps
        )
      );


      void pushSync({
        employees:
          nextEmps
      });
    };


  /* =========================================================
     UPDATE EMPLOYEE
     ========================================================= */

  const handleUpdateEmployee =
    async (
      updatedEmp: Employee
    ) => {

      const nextEmps =
        employeesRef.current.map(
          e => {

            if (
              e.id ===
              updatedEmp.id
            ) {

              const finalAvatar =
                updatedEmp._isPhotoRemoved
                  ? ''
                  : (
                      updatedEmp.avatar &&
                      updatedEmp.avatar.trim() !== ''
                    )
                      ? updatedEmp.avatar
                      : (
                          e.avatar ||
                          ''
                        );


              return {
                ...e,
                ...updatedEmp,
                avatar:
                  finalAvatar
              };
            }


            return e;
          }
        );


      employeesRef.current =
        nextEmps;

      setEmployees(
        nextEmps
      );


      localStorage.setItem(
        'attendance_employees',
        JSON.stringify(
          nextEmps
        )
      );


      lastLocalUpdateRef.current =
        Date.now();


      try {

        const updatedEmployee =
          nextEmps.find(
            e =>
              e.id ===
              updatedEmp.id
          );


        const res =
          await fetch(
            `/api/employees/${updatedEmp.id}`,
            {
              method: 'PUT',
              headers: {
                'Content-Type':
                  'application/json'
              },
              body:
                JSON.stringify(
                  updatedEmployee
                )
            }
          );


        if (!res.ok) {
          throw new Error(
            `Employee update failed: ${res.status}`
          );
        }


        const data =
          await res.json();


        if (
          data?.employee
        ) {

          const confirmedEmps =
            employeesRef.current.map(
              e =>
                e.id ===
                updatedEmp.id
                  ? {
                      ...e,
                      ...data.employee
                    }
                  : e
            );


          employeesRef.current =
            confirmedEmps;

          setEmployees(
            confirmedEmps
          );


          localStorage.setItem(
            'attendance_employees',
            JSON.stringify(
              confirmedEmps
            )
          );
        }


        await pushSync({
          employees:
            employeesRef.current
        });

      } catch (err) {

        console.error(
          'Failed to update employee on server:',
          err
        );
      }


      if (
        currentUser &&
        currentUser.id ===
          updatedEmp.id
      ) {

        setCurrentUser(
          prev => {

            if (!prev) {
              return updatedEmp;
            }


            const finalAvatar =
              updatedEmp._isPhotoRemoved
                ? ''
                : (
                    updatedEmp.avatar &&
                    updatedEmp.avatar.trim() !== ''
                  )
                    ? updatedEmp.avatar
                    : (
                        prev.avatar ||
                        ''
                      );


            const newCurr = {
              ...prev,
              ...updatedEmp,
              avatar:
                finalAvatar
            };


            localStorage.setItem(
              'logged_in_user',
              JSON.stringify(
                newCurr
              )
            );


            return newCurr;
          }
        );
      }
    };


  /* =========================================================
     DELETE EMPLOYEE
     ========================================================= */

  const handleDeleteEmployee =
    (empId: string) => {

      let deletedIds:
        string[] = [];


      try {

        deletedIds =
          JSON.parse(
            localStorage.getItem(
              'deleted_employee_ids'
            ) ||
            '[]'
          );

      } catch {}


      if (
        !deletedIds.includes(
          empId
        )
      ) {

        deletedIds.push(
          empId
        );

        localStorage.setItem(
          'deleted_employee_ids',
          JSON.stringify(
            deletedIds
          )
        );
      }


      const updatedEmployees =
        employeesRef.current.filter(
          e =>
            e.id !==
            empId
        );


      const updatedRecords =
        attendanceRecordsRef.current.filter(
          r =>
            r.employeeId !==
            empId
        );


      const updatedLeaves =
        leaveRequestsRef.current.filter(
          l =>
            l.employeeId !==
            empId
        );


      employeesRef.current =
        updatedEmployees;

      setEmployees(
        updatedEmployees
      );


      attendanceRecordsRef.current =
        updatedRecords;

      setAttendanceRecords(
        updatedRecords
      );


      leaveRequestsRef.current =
        updatedLeaves;

      setLeaveRequests(
        updatedLeaves
      );


      localStorage.setItem(
        'attendance_employees',
        JSON.stringify(
          updatedEmployees
        )
      );

      localStorage.setItem(
        'attendance_records',
        JSON.stringify(
          updatedRecords
        )
      );

      localStorage.setItem(
        'attendance_leaves',
        JSON.stringify(
          updatedLeaves
        )
      );


      lastLocalUpdateRef.current =
        Date.now();


      if (
        currentUser &&
        currentUser.id ===
          empId
      ) {

        setCurrentUser(
          null
        );

        localStorage.removeItem(
          'logged_in_user'
        );
      }


      void pushSync({
        employees:
          updatedEmployees,

        attendanceRecords:
          updatedRecords,

        leaveRequests:
          updatedLeaves,

        deletedEmployeeIds:
          [empId]
      });


      void fetch(
        `/api/employees/${empId}`,
        {
          method: 'DELETE'
        }
      ).catch(
        () => {}
      );
    };


  /* =========================================================
     DELETE LEAVE
     ========================================================= */

  const handleDeleteLeaveRequest =
    (leaveId: string) => {

      const nextLeaves =
        leaveRequestsRef.current.filter(
          l =>
            l.id !==
            leaveId
        );


      leaveRequestsRef.current =
        nextLeaves;

      setLeaveRequests(
        nextLeaves
      );


      const nextAttendance =
        sanitizeAttendanceWithPermissions(
          attendanceRecordsRef.current,
          nextLeaves
        );


      attendanceRecordsRef.current =
        nextAttendance;

      setAttendanceRecords(
        nextAttendance
      );


      localStorage.setItem(
        'attendance_leaves',
        JSON.stringify(
          nextLeaves
        )
      );


      localStorage.setItem(
        'attendance_records',
        JSON.stringify(
          nextAttendance
        )
      );


      lastLocalUpdateRef.current =
        Date.now();


      void pushSync({
        leaveRequests:
          nextLeaves,

        attendanceRecords:
          nextAttendance,

        deletedLeaveIds:
          [leaveId]
      });


      void fetch(
        `/api/leaves/${leaveId}`,
        {
          method: 'DELETE'
        }
      ).catch(
        () => {}
      );
    };


  /* =========================================================
     DELETE ATTENDANCE
     ========================================================= */

  const handleDeleteRecord =
    (id: string) => {

      const target =
        attendanceRecordsRef.current.find(
          r =>
            r.id ===
            id
        );


      const targetEmpId =
        target?.employeeId;

      const targetDate =
        target?.date;


      const nextRecords =
        attendanceRecordsRef.current.filter(
          r =>
            r.id !==
              id &&

            !(
              targetEmpId &&
              targetDate &&
              r.employeeId ===
                targetEmpId &&
              r.date ===
                targetDate
            )
        );


      attendanceRecordsRef.current =
        nextRecords;

      setAttendanceRecords(
        nextRecords
      );


      localStorage.setItem(
        'attendance_records',
        JSON.stringify(
          nextRecords
        )
      );


      lastLocalUpdateRef.current =
        Date.now();


      void fetch(
        `/api/attendance/${id}`,
        {
          method: 'DELETE'
        }
      ).catch(
        () => {}
      );


      void pushSync({
        attendanceRecords:
          nextRecords,

        deletedAttendanceIds:
          [id]
      });


      if (
        target &&
        target.status ===
          'on_leave'
      ) {

        const matchingLeave =
          leaveRequestsRef.current.find(
            l =>
              l.employeeId ===
                target.employeeId &&

              target.date >=
                l.startDate &&

              target.date <=
                l.endDate &&

              l.status ===
                'approved'
          );


        if (
          matchingLeave
        ) {

          void handleUpdateLeaveStatus(
            matchingLeave.id,
            'rejected',
            'إلغاء الإجازة بقرار الإدارة'
          );
        }
      }
    };


  /* =========================================================
     CLEAR TODAY
     ========================================================= */

  const handleClearTodayRecords =
    (dateStr: string) => {

      const deletedIds =
        attendanceRecordsRef.current
          .filter(
            r =>
              r.date ===
              dateStr
          )
          .map(
            r =>
              r.id
          );


      const nextRecords =
        attendanceRecordsRef.current.filter(
          r =>
            r.date !==
            dateStr
        );


      attendanceRecordsRef.current =
        nextRecords;

      setAttendanceRecords(
        nextRecords
      );


      localStorage.setItem(
        'attendance_records',
        JSON.stringify(
          nextRecords
        )
      );


      lastLocalUpdateRef.current =
        Date.now();


      void fetch(
        '/api/attendance/clear-today',
        {
          method: 'POST',
          headers: {
            'Content-Type':
              'application/json'
          },
          body:
            JSON.stringify({
              date:
                dateStr
            })
        }
      ).catch(
        () => {}
      );


      void pushSync({
        attendanceRecords:
          nextRecords,

        deletedAttendanceIds:
          deletedIds
      });
    };


  /* =========================================================
     DELETE FUTURE ATTENDANCE
     ========================================================= */

  const handleDeleteFutureAttendance =
    async () => {

      const todayStr =
        getTodayString();


      const currentRecords =
        attendanceRecordsRef.current ||
        [];


      const futureRecords =
        currentRecords.filter(
          r =>
            r &&
            r.date &&
            r.date >
              todayStr
        );


      if (
        futureRecords.length ===
        0
      ) {

        alert(
          lang === 'ar'
            ? `لا توجد أي سجلات حضور في تواريخ مستقبلية (بعد ${todayStr}). جميع السجلات الحالية سابقة أو لهذا اليوم.`
            : `No future attendance records found after ${todayStr}.`
        );

        return;
      }


      const sortedDates =
        futureRecords
          .map(
            r =>
              r.date
          )
          .sort();


      const minDate =
        sortedDates[0];

      const maxDate =
        sortedDates[
          sortedDates.length - 1
        ];


      const futureCount =
        futureRecords.length;


      const confirmMessage =
        lang === 'ar'
          ? `يوجد ${futureCount} سجل حضور في تواريخ مستقبلية من ${minDate} إلى ${maxDate}. هل تريد حذف هذه السجلات؟`
          : `Found ${futureCount} future attendance records from ${minDate} to ${maxDate}. Do you want to delete these records?`;


      if (
        !window.confirm(
          confirmMessage
        )
      ) {
        return;
      }


      try {

        localStorage.setItem(
          'future_attendance_backup_' +
            Date.now(),
          JSON.stringify({
            deletedAt:
              new Date().toISOString(),
            cutoffDate:
              todayStr,
            futureCount,
            futureRecords
          })
        );


        const keptRecords =
          currentRecords.filter(
            r =>
              r &&
              r.date &&
              r.date <=
                todayStr
          );


        attendanceRecordsRef.current =
          keptRecords;

        setAttendanceRecords(
          keptRecords
        );


        localStorage.setItem(
          'attendance_records',
          JSON.stringify(
            keptRecords
          )
        );


        const response =
          await fetch(
            '/api/attendance/delete-future',
            {
              method: 'POST',
              headers: {
                'Content-Type':
                  'application/json'
              },
              body:
                JSON.stringify({
                  todayDate:
                    todayStr
                })
            }
          );


        const resData =
          await response.json();


        let finalRecords =
          keptRecords;


        if (
          resData.success &&
          Array.isArray(
            resData.attendanceRecords
          )
        ) {

          finalRecords =
            resData.attendanceRecords
              .map(
                ensureSanitizedRecord
              )
              .filter(
                (
                  r: AttendanceRecord
                ) =>
                  r &&
                  r.date &&
                  r.date <=
                    todayStr
              );


          attendanceRecordsRef.current =
            finalRecords;

          setAttendanceRecords(
            finalRecords
          );


          localStorage.setItem(
            'attendance_records',
            JSON.stringify(
              finalRecords
            )
          );
        }


        await pushSync({
          attendanceRecords:
            finalRecords,

          replaceAttendance:
            true
        });


        const remainingFuture =
          (
            attendanceRecordsRef.current ||
            []
          ).filter(
            r =>
              r &&
              r.date &&
              r.date >
                todayStr
          );


        if (
          remainingFuture.length ===
          0
        ) {

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

      } catch (err) {

        console.error(
          'Error deleting future attendance records:',
          err
        );


        alert(
          lang === 'ar'
            ? 'حدث خطأ أثناء حذف السجلات المستقبلية'
            : 'Error deleting future attendance records'
        );
      }
    };


  /* =========================================================
     ADD LEAVE
     ========================================================= */

  const handleAddLeave =
    async (
      req: LeaveRequest
    ) => {

      /*
       * IMPORTANT:
       * Do not blindly append duplicate leave IDs.
       */

      const nextLeaves =
        [
          req,
          ...leaveRequestsRef.current.filter(
            existing =>
              existing.id !==
              req.id
          )
        ];


      leaveRequestsRef.current =
        nextLeaves;

      setLeaveRequests(
        nextLeaves
      );


      try {

        localStorage.setItem(
          'attendance_leaves',
          JSON.stringify(
            nextLeaves
          )
        );

      } catch {}


      lastLocalUpdateRef.current =
        Date.now();


      /*
       * If request is approved from the beginning,
       * run the exact same approval logic once.
       */

      if (
        req.status ===
        'approved'
      ) {

        await handleUpdateLeaveStatus(
          req.id,
          'approved',
          req.reviewNotes ||
            'تم الاعتماد المباشر من الإدارة/التيم ليدر'
        );

        return;
      }


      /*
       * Pending request:
       * Send the complete current leave list.
       */

      await pushSync({
        leaveRequests:
          nextLeaves
      });
    };


  /* =========================================================
     NOTIFICATION HELPERS
     ========================================================= */

  const createNotification = (
    recipientId: string,
    type: NotificationType,
    title: string,
    message: string,
    relatedEmployeeId?: string,
    relatedLeaveId?: string,
    relatedOvertimeId?: string
  ) => {
    const notification: Notification = {
      id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      recipientId,
      type,
      title,
      message,
      relatedEmployeeId,
      relatedLeaveId,
      relatedOvertimeId,
      isRead: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    return notification;
  };

  const handleMarkNotificationAsRead = (
    notificationId: string
  ) => {
    const updated = notificationsRef.current.map(
      n =>
        n.id === notificationId
          ? {
              ...n,
              isRead: true,
              updatedAt: new Date().toISOString(),
            }
          : n
    );

    notificationsRef.current = updated;
    setNotifications(updated);

    try {
      localStorage.setItem(
        'notifications',
        JSON.stringify(updated)
      );
    } catch {}

    void pushSync({
      notifications: updated,
    });
  };

  const handleMarkAllNotificationsAsRead = () => {
    const updated = notificationsRef.current.map(
      n =>
       currentUser?.id && n.recipientId === currentUser.id
          ? {
              ...n,
              isRead: true,
              updatedAt: new Date().toISOString(),
            }
          : n
    );

    notificationsRef.current = updated;
    setNotifications(updated);

    try {
      localStorage.setItem(
        'notifications',
        JSON.stringify(updated)
      );
    } catch {}

    void pushSync({
      notifications: updated,
    });
  };


  /* =========================================================
     UPDATE LEAVE STATUS
     ========================================================= */

  const handleUpdateLeaveStatus =
    async (
      id: string,
      status: LeaveStatus,
      reviewNotes?: string
    ) => {

      const previousReq =
        leaveRequestsRef.current.find(
          l =>
            l.id ===
            id
        );


      if (!previousReq) {
        return;
      }


      const wasApproved =
        previousReq.status ===
        'approved';


      /*
       * Prevent duplicate processing.
       */
      if (
        previousReq.status ===
          status &&
        reviewNotes ===
          previousReq.reviewNotes
      ) {
        return;
      }


      const updatedTargetReq:
        LeaveRequest = {
          ...previousReq,
          status,
          reviewNotes,
          updatedAt:
            new Date().toISOString()
        };


      const nextLeaves =
        leaveRequestsRef.current.map(
          l =>
            l.id ===
            id
              ? updatedTargetReq
              : l
        );


      /*
       * Update leave immediately.
       */

      leaveRequestsRef.current =
        nextLeaves;

      setLeaveRequests(
        nextLeaves
      );


      try {

        localStorage.setItem(
          'attendance_leaves',
          JSON.stringify(
            nextLeaves
          )
        );

      } catch {}


      lastLocalUpdateRef.current =
        Date.now();


      pendingLeaveDecisionsRef.current.set(
        id,
        {
          status,
          reviewNotes,
          expiresAt:
            Date.now() +
            60000
        }
      );


      let nextEmployees =
        employeesRef.current;


      let nextAttendance =
        attendanceRecordsRef.current;


      /* =====================================================
         APPROVE
         ===================================================== */

      if (
        status === 'approved' &&
        !wasApproved
      ) {

        const req =
          updatedTargetReq;


        const days =
          calculateWorkDaysInPeriod(
            req.startDate,
            req.endDate
          );


        /* ---------------------------------------------------
           DEDUCT LEAVE BALANCE
           --------------------------------------------------- */

        if (
          req.type === 'sick' ||
          req.type === 'casual' ||
          req.type === 'emergency' ||
          req.type === 'regular' ||
          req.type === 'annual'
        ) {

          nextEmployees =
            employeesRef.current.map(
              emp => {

                if (
                  emp.id !==
                  req.employeeId
                ) {
                  return emp;
                }


                if (
                  req.type ===
                  'sick'
                ) {

                  const sickBal =
                    emp.sickLeaveBalance ??
                    30;


                  return {
                    ...emp,

                    sickLeaveBalance:
                      Math.max(
                        0,
                        sickBal -
                          days
                      )
                  };
                }


                const casual =
                  emp.casualLeaveBalance ??
                  7;


                const regular =
                  emp.regularLeaveBalance ??
                  8;


                const annual =
                  emp.annualLeaveBalance ??
                  (
                    casual +
                    regular
                  );


                if (
                  req.type ===
                    'casual' ||
                  req.type ===
                    'emergency'
                ) {

                  return {
                    ...emp,

                    casualLeaveBalance:
                      Math.max(
                        0,
                        casual -
                          days
                      ),

                    annualLeaveBalance:
                      Math.max(
                        0,
                        annual -
                          days
                      )
                  };
                }


                return {
                  ...emp,

                  regularLeaveBalance:
                    Math.max(
                      0,
                      regular -
                        days
                    ),

                  annualLeaveBalance:
                    Math.max(
                      0,
                      annual -
                        days
                    )
                };
              }
            );
        }


        /* ---------------------------------------------------
           GENERATE ATTENDANCE LEAVE RECORDS
           --------------------------------------------------- */

        const newRecords = [
          ...attendanceRecordsRef.current
        ];


        const cur =
          new Date(
            req.startDate
          );


        const endDateObj =
          new Date(
            req.endDate
          );


        while (
          cur <=
          endDateObj
        ) {

          const dateStr =
            getTodayString(
              cur
            );


          if (
            !isWeekend(
              dateStr
            )
          ) {

            const existingIdx =
              newRecords.findIndex(
                r =>
                  r.employeeId ===
                    req.employeeId &&
                  r.date ===
                    dateStr
              );


            /* -----------------------------------------------
               PERMISSION
               ----------------------------------------------- */

            if (
              req.type ===
              'permission'
            ) {

              if (
                existingIdx >=
                0
              ) {

                const existing =
                  newRecords[
                    existingIdx
                  ];


                if (
                  existing.checkIn
                ) {

                  newRecords[
                    existingIdx
                  ] = {
                    ...existing,

                    lateMinutes:
                      0,

                    lateSeconds:
                      0,

                    status:
                      existing.checkOut
                        ? 'on_time'
                        : 'in_progress',

                    isExcused:
                      true,

                    excusedReason:
                      req.reason ||
                      'إذن خروج معتمد'
                  };

                } else {

                  newRecords[
                    existingIdx
                  ] = {

                    ...existing,

                    status:
                      'on_leave',

                    leaveType:
                      'permission',

                    lateMinutes:
                      0,

                    lateSeconds:
                      0,

                    notes:
                      req.reason
                        ? `إذن: ${req.reason}`
                        : 'إذن خروج معتمد'
                  };
                }

              } else {

                newRecords.push({

                  id:
                    `rec-leave-${req.employeeId}-${dateStr}`,

                  employeeId:
                    req.employeeId,

                  date:
                    dateStr,

                  status:
                    'on_leave',

                  leaveType:
                    'permission',

                  workHours:
                    0,

                  lateMinutes:
                    0,

                  earlyLeaveMinutes:
                    0,

                  overtimeHours:
                    0,

                  notes:
                    req.reason
                      ? `إذن: ${req.reason}`
                      : 'إذن خروج معتمد',

                  verifiedByFace:
                    true
                });
              }


            } else {

              /* ---------------------------------------------
                 FULL DAY LEAVE
                 --------------------------------------------- */

              const notesText =
                req.type ===
                'sick'

                  ? `إجازة مرضية: ${
                      req.reason ||
                      'تقرير طبي'
                    }`

                  : req.type ===
                      'casual'

                    ? `إجازة عارضة: ${
                        req.reason ||
                        'ظرف طارئ'
                      }`

                    : req.type ===
                        'annual' ||
                      req.type ===
                        'regular'

                      ? `إجازة اعتيادية: ${
                          req.reason ||
                          'رصيد سنوي'
                        }`

                      : req.reason
                        ? `إجازة (${req.type}): ${req.reason}`
                        : 'إجازة معتمدة';


              const leaveRec:
                AttendanceRecord = {

                  id:
                    existingIdx >=
                    0

                      ? newRecords[
                          existingIdx
                        ].id

                      : `rec-leave-${req.employeeId}-${dateStr}`,

                  employeeId:
                    req.employeeId,

                  date:
                    dateStr,

                  status:
                    'on_leave',

                  leaveType:
                    req.type,

                  workHours:
                    0,

                  lateMinutes:
                    0,

                  lateSeconds:
                    0,

                  earlyLeaveMinutes:
                    0,

                  overtimeHours:
                    0,

                  notes:
                    notesText,

                  verifiedByFace:
                    true,

                  updatedAt:
                    new Date().toISOString()
                };


              if (
                existingIdx >=
                0
              ) {

                newRecords[
                  existingIdx
                ] =
                  leaveRec;

              } else {

                newRecords.push(
                  leaveRec
                );
              }
            }
          }


          cur.setDate(
            cur.getDate() +
              1
          );
        }


        nextAttendance =
          sanitizeAttendanceWithPermissions(
            newRecords,
            nextLeaves
          );


      /* =====================================================
         REJECT / REVOKE
         ===================================================== */

      } else if (
        wasApproved &&
        status !==
          'approved'
      ) {

        const req =
          updatedTargetReq;


        const days =
          calculateWorkDaysInPeriod(
            req.startDate,
            req.endDate
          );


        /* ---------------------------------------------------
           RESTORE BALANCE
           --------------------------------------------------- */

        if (
          req.type === 'sick' ||
          req.type === 'casual' ||
          req.type === 'emergency' ||
          req.type === 'regular' ||
          req.type === 'annual'
        ) {

          nextEmployees =
            employeesRef.current.map(
              emp => {

                if (
                  emp.id !==
                  req.employeeId
                ) {
                  return emp;
                }


                if (
                  req.type ===
                  'sick'
                ) {

                  return {
                    ...emp,

                    sickLeaveBalance:
                      (
                        emp.sickLeaveBalance ??
                        30
                      ) +
                      days
                  };
                }


                if (
                  req.type ===
                    'casual' ||
                  req.type ===
                    'emergency'
                ) {

                  return {
                    ...emp,

                    casualLeaveBalance:
                      (
                        emp.casualLeaveBalance ??
                        7
                      ) +
                      days,

                    annualLeaveBalance:
                      (
                        emp.annualLeaveBalance ??
                        15
                      ) +
                      days
                  };
                }


                return {
                  ...emp,

                  regularLeaveBalance:
                    (
                      emp.regularLeaveBalance ??
                      8
                    ) +
                    days,

                  annualLeaveBalance:
                    (
                      emp.annualLeaveBalance ??
                      15
                    ) +
                    days
                };
              }
            );
        }


        /* ---------------------------------------------------
           REMOVE GENERATED ATTENDANCE LEAVE RECORDS
           --------------------------------------------------- */

        nextAttendance =
          attendanceRecordsRef.current.filter(
            r => {

              if (
                r.employeeId ===
                  req.employeeId &&

                r.status ===
                  'on_leave' &&

                r.date >=
                  req.startDate &&

                r.date <=
                  req.endDate
              ) {
                return false;
              }


              return true;
            }
          );
      }


      /* =====================================================
         UPDATE LOCAL STATE
         ===================================================== */

      employeesRef.current =
        nextEmployees;

      setEmployees(
        nextEmployees
      );


      attendanceRecordsRef.current =
        nextAttendance;

      setAttendanceRecords(
        nextAttendance
      );


      try {

        localStorage.setItem(
          'attendance_employees',
          JSON.stringify(
            nextEmployees
          )
        );


        localStorage.setItem(
          'attendance_records',
          JSON.stringify(
            nextAttendance
          )
        );

      } catch {}


     /* =====================================================
   CREATE NOTIFICATIONS
   ===================================================== */

let nextNotifications = [
  ...notificationsRef.current
];

if (
  status === 'approved' ||
  status === 'rejected'
) {
  const notificationType =
    status === 'approved'
      ? 'leave_approved'
      : 'leave_rejected';

  /*
   * Unique notification key:
   * One notification per leave + employee + status.
   */
  const notificationExists =
    nextNotifications.some(
      n =>
        n.type === notificationType &&
        n.recipientId ===
          updatedTargetReq.employeeId &&
        n.relatedLeaveId ===
          updatedTargetReq.id
    );

  if (!notificationExists) {

    const notification =
      createNotification(
        updatedTargetReq.employeeId,
        notificationType,
        status === 'approved'
          ? (
              lang === 'ar'
                ? 'تم قبول الإجازة'
                : 'Leave Approved'
            )
          : (
              lang === 'ar'
                ? 'تم رفض الإجازة'
                : 'Leave Rejected'
            ),
        status === 'approved'
          ? (
              lang === 'ar'
                ? `تم قبول طلب إجازتك من ${updatedTargetReq.startDate} إلى ${updatedTargetReq.endDate}`
                : `Your leave request from ${updatedTargetReq.startDate} to ${updatedTargetReq.endDate} has been approved`
            )
          : (
              lang === 'ar'
                ? `تم رفض طلب إجازتك: ${
                    reviewNotes ||
                    'بدون سبب محدد'
                  }`
                : `Your leave request has been rejected: ${
                    reviewNotes ||
                    'No reason provided'
                  }`
            ),
        updatedTargetReq.employeeId,
        updatedTargetReq.id
      );

    nextNotifications.push(
      notification
    );
  }
}

/*
 * Remove any accidental duplicates.
 *
 * Key = type + recipient + relatedLeaveId
 */
const uniqueNotifications =
  new Map<string, Notification>();

for (
  const notification of nextNotifications
) {

  const key =
    `${notification.type}|` +
    `${notification.recipientId}|` +
    `${notification.relatedLeaveId || ''}`;

  /*
   * Keep the first notification.
   */
  if (
    !uniqueNotifications.has(key)
  ) {
    uniqueNotifications.set(
      key,
      notification
    );
  }
}

nextNotifications = Array.from(
  uniqueNotifications.values()
);

notificationsRef.current =
  nextNotifications;

setNotifications(
  nextNotifications
);

try {
  localStorage.setItem(
    'notifications',
    JSON.stringify(
      nextNotifications
    )
  );
} catch {}

      /*
       * IMPORTANT:
       * Send the FINAL state together.
       *
       * This is the important part that keeps:
       *
       * Leave
       * Employee balance
       * Attendance generated by leave
       * Notifications
       *
       * synchronized as one mutation.
       */

      await pushSync({

        leaveRequests:
          nextLeaves,

        employees:
          nextEmployees,

        attendanceRecords:
          nextAttendance,

        notifications:
          nextNotifications
      });
    };


  /* =========================================================
     IMPORT LEAVES
     ========================================================= */

  const handleImportLeavesSuccess =
    async (
      newRecords: LeaveRequest[]
    ) => {

      if (
        !newRecords ||
        newRecords.length ===
          0
      ) {
        return;
      }


      /*
       * Merge by ID instead of blindly duplicating.
       */

      let currentLeaves =
        mergeLeaveRequestsClient(
          leaveRequestsRef.current,
          newRecords
        );


      let currentEmployees =
        [
          ...employeesRef.current
        ];


      let currentAttendance =
        [
          ...attendanceRecordsRef.current
        ];


      /* =====================================================
         APPLY APPROVED IMPORTED LEAVES
         ===================================================== */

      for (
        const req of newRecords
      ) {

        if (
          req.status !==
          'approved'
        ) {
          continue;
        }


        const days =
          calculateWorkDaysInPeriod(
            req.startDate,
            req.endDate
          );


        /* ---------------------------------------------------
           DEDUCT BALANCE
           --------------------------------------------------- */

        if (
          req.type === 'sick' ||
          req.type === 'casual' ||
          req.type === 'emergency' ||
          req.type === 'regular' ||
          req.type === 'annual'
        ) {

          currentEmployees =
            currentEmployees.map(
              emp => {

                if (
                  emp.id !==
                  req.employeeId
                ) {
                  return emp;
                }


                if (
                  req.type ===
                  'sick'
                ) {

                  const sickBal =
                    emp.sickLeaveBalance ??
                    30;


                  return {
                    ...emp,

                    sickLeaveBalance:
                      Math.max(
                        0,
                        sickBal -
                          days
                      )
                  };
                }


                const casual =
                  emp.casualLeaveBalance ??
                  7;


                const regular =
                  emp.regularLeaveBalance ??
                  8;


                const annual =
                  emp.annualLeaveBalance ??
                  (
                    casual +
                    regular
                  );


                if (
                  req.type ===
                    'casual' ||
                  req.type ===
                    'emergency'
                ) {

                  return {
                    ...emp,

                    casualLeaveBalance:
                      Math.max(
                        0,
                        casual -
                          days
                      ),

                    annualLeaveBalance:
                      Math.max(
                        0,
                        annual -
                          days
                      )
                  };
                }


                return {
                  ...emp,

                  regularLeaveBalance:
                    Math.max(
                      0,
                      regular -
                        days
                    ),

                  annualLeaveBalance:
                    Math.max(
                      0,
                      annual -
                        days
                    )
                };
              }
            );
        }


        /* ---------------------------------------------------
           GENERATE ATTENDANCE
           --------------------------------------------------- */

        const cur =
          new Date(
            req.startDate
          );


        const endDateObj =
          new Date(
            req.endDate
          );


        while (
          cur <=
          endDateObj
        ) {

          const dateStr =
            getTodayString(
              cur
            );


          if (
            !isWeekend(
              dateStr
            )
          ) {

            const existingIdx =
              currentAttendance.findIndex(
                r =>
                  r.employeeId ===
                    req.employeeId &&
                  r.date ===
                    dateStr
              );


            if (
              req.type ===
              'permission'
            ) {

              if (
                existingIdx >=
                0
              ) {

                const existing =
                  currentAttendance[
                    existingIdx
                  ];


                if (
                  existing.checkIn
                ) {

                  currentAttendance[
                    existingIdx
                  ] = {

                    ...existing,

                    lateMinutes:
                      0,

                    lateSeconds:
                      0,

                    status:
                      existing.checkOut
                        ? 'on_time'
                        : 'in_progress',

                    isExcused:
                      true,

                    excusedReason:
                      req.reason ||
                      'إذن خروج معتمد'
                  };

                } else {

                  currentAttendance[
                    existingIdx
                  ] = {

                    ...existing,

                    status:
                      'on_leave',

                    leaveType:
                      'permission',

                    lateMinutes:
                      0,

                    lateSeconds:
                      0,

                    notes:
                      req.reason
                        ? `إذن: ${req.reason}`
                        : 'إذن خروج معتمد'
                  };
                }

              } else {

                currentAttendance.push({

                  id:
                    `rec-leave-${req.employeeId}-${dateStr}`,

                  employeeId:
                    req.employeeId,

                  date:
                    dateStr,

                  status:
                    'on_leave',

                  leaveType:
                    'permission',

                  workHours:
                    0,

                  lateMinutes:
                    0,

                  lateSeconds:
                    0,

                  earlyLeaveMinutes:
                    0,

                  overtimeHours:
                    0,

                  notes:
                    req.reason
                      ? `إذن: ${req.reason}`
                      : 'إذن خروج معتمد',

                  verifiedByFace:
                    true,

                  updatedAt:
                    new Date().toISOString()
                });
              }

            } else {

              const notesText =
                req.type ===
                'sick'

                  ? `إجازة مرضية: ${
                      req.reason ||
                      'تقرير طبي'
                    }`

                  : req.type ===
                      'casual'

                    ? `إجازة عارضة: ${
                        req.reason ||
                        'ظرف طارئ'
                      }`

                    : (
                        req.type ===
                          'annual' ||
                        req.type ===
                          'regular'
                      )

                      ? `إجازة اعتيادية: ${
                          req.reason ||
                          'رصيد سنوي'
                        }`

                      : req.reason
                        ? `إجازة (${req.type}): ${req.reason}`
                        : 'إجازة معتمدة';


              const leaveRec:
                AttendanceRecord = {

                  id:
                    existingIdx >=
                    0

                      ? currentAttendance[
                          existingIdx
                        ].id

                      : `rec-leave-${req.employeeId}-${dateStr}`,

                  employeeId:
                    req.employeeId,

                  date:
                    dateStr,

                  status:
                    'on_leave',

                  leaveType:
                    req.type,

                  workHours:
                    0,

                  lateMinutes:
                    0,

                  lateSeconds:
                    0,

                  earlyLeaveMinutes:
                    0,

                  overtimeHours:
                    0,

                  notes:
                    notesText,

                  verifiedByFace:
                    true,

                  updatedAt:
                    new Date().toISOString()
                };


              if (
                existingIdx >=
                0
              ) {

                currentAttendance[
                  existingIdx
                ] =
                  leaveRec;

              } else {

                currentAttendance.push(
                  leaveRec
                );
              }
            }
          }


          cur.setDate(
            cur.getDate() +
              1
          );
        }
      }


      currentAttendance =
        sanitizeAttendanceWithPermissions(
          currentAttendance,
          currentLeaves
        );


      /* =====================================================
         SAVE EVERYTHING LOCALLY
         ===================================================== */

      leaveRequestsRef.current =
        currentLeaves;

      setLeaveRequests(
        currentLeaves
      );


      employeesRef.current =
        currentEmployees;

      setEmployees(
        currentEmployees
      );


      attendanceRecordsRef.current =
        currentAttendance;

      setAttendanceRecords(
        currentAttendance
      );


      localStorage.setItem(
        'attendance_leaves',
        JSON.stringify(
          currentLeaves
        )
      );


      localStorage.setItem(
        'attendance_employees',
        JSON.stringify(
          currentEmployees
        )
      );


      localStorage.setItem(
        'attendance_records',
        JSON.stringify(
          currentAttendance
        )
      );


      lastLocalUpdateRef.current =
        Date.now();


      /* =====================================================
         CENTRAL SYNC
         ===================================================== */

      await pushSync({

        leaveRequests:
          currentLeaves,

        employees:
          currentEmployees,

        attendanceRecords:
          currentAttendance
      });
    };


  /* =========================================================
     PENDING LEAVES COUNT
     ========================================================= */

  const pendingLeavesCount =
    React.useMemo(
      () => {

        if (
          !leaveRequests ||
          leaveRequests.length ===
            0
        ) {
          return 0;
        }


        if (!currentUser) {

          return leaveRequests.filter(
            l =>
              l.status ===
              'pending'
          ).length;
        }


        if (
          currentUser.role ===
          'employee'
        ) {

          return leaveRequests.filter(
            l =>
              l.status ===
                'pending' &&
              l.employeeId ===
                currentUser.id
          ).length;
        }


        if (
          currentUser.role ===
          'leader'
        ) {

          const hasExplicitTeam =
            employees.some(
              e =>
                e.teamLeaderId ===
                currentUser.id
            );


          if (
            hasExplicitTeam
          ) {

            const assignedEmpIds =
              new Set(
                employees
                  .filter(
                    e =>
                      e.teamLeaderId ===
                        currentUser.id ||

                      (
                        currentUser.teamId &&
                        e.teamId ===
                          currentUser.teamId
                      )
                  )
                  .map(
                    e =>
                      e.id
                  )
              );


            if (
              assignedEmpIds.size >
              0
            ) {

              return leaveRequests.filter(
                l =>
                  l.status ===
                    'pending' &&

                  (
                    assignedEmpIds.has(
                      l.employeeId
                    ) ||

                    l.employeeId ===
                      currentUser.id
                  )
              ).length;
            }
          }
        }


        return leaveRequests.filter(
          l =>
            l.status ===
            'pending'
        ).length;

      },
      [
        leaveRequests,
        currentUser,
        employees
      ]
    );


  /* =========================================================
     RENDER
     ========================================================= */

  return (

    <div
      className="
        min-h-screen
        bg-slate-100/70
        text-slate-900
        font-sans
        antialiased
        selection:bg-emerald-500
        selection:text-white
      "
    >

      <Header

        activeTab={
          activeTab
        }

        setActiveTab={
          setActiveTab
        }

        lang={
          lang
        }

        setLang={
          setLang
        }

        searchTerm={
          searchTerm
        }

        setSearchTerm={
          setSearchTerm
        }

        pendingLeavesCount={
          pendingLeavesCount
        }

        companyNameAr={
          companyNameAr
        }

        companyNameEn={
          companyNameEn
        }

        onOpenRulesModal={() =>
          setIsRulesModalOpen(
            true
          )
        }

        onOpenNoticeModal={() =>
          setIsNoticeModalOpen(
            true
          )
        }

        currentUser={
          currentUser
        }

        onOpenLoginModal={() =>
          setIsLoginModalOpen(
            true
          )
        }

        onLogout={
          handleLogout
        }

        onUpdateEmployee={
          handleUpdateEmployee
        }

        employees={
          employees
        }

        attendanceRecords={
          attendanceRecords
        }

        leaveRequests={
          leaveRequests
        }

        notifications={
          notifications
        }

        currentUserId={
          currentUser?.id
        }

        onMarkNotificationAsRead={
          handleMarkNotificationAsRead
        }

        onMarkAllNotificationsAsRead={
          handleMarkAllNotificationsAsRead
        }
      />


      <UrgentNoticeBanner

        notice={
          urgentNotice
        }

        onEditNotice={() =>
          setIsNoticeModalOpen(
            true
          )
        }

        lang={
          lang
        }

        isLeader={
          currentUser?.role ===
            'leader' ||
          !currentUser
        }
      />


      <main
        className="
          py-6
          pb-16
        "
      >

        {activeTab ===
          'dashboard' && (

          <DashboardOverview

            employees={
              employees
            }

            attendanceRecords={
              attendanceRecords
            }

            leaveRequests={
              leaveRequests
            }

            onOpenManualPunch={() =>
              setActiveTab(
                'attendance'
              )
            }

            onOpenAddEmployee={() =>
              setActiveTab(
                'employees'
              )
            }

            onExportCSV={
              handleExportCSV
            }

            onUpdateLeaveStatus={
              handleUpdateLeaveStatus
            }

            onDeleteRecord={
              handleDeleteRecord
            }

            onClearTodayRecords={
              handleClearTodayRecords
            }

            setActiveTab={
              setActiveTab
            }

            lang={
              lang
            }

            onForceEndBreak={
              handleForceEndBreak
            }

            currentUser={
              currentUser
            }
          />
        )}


        {activeTab ===
          'kiosk' && (

          <KioskPunch

            employees={
              employees
            }

            shifts={
              shifts
            }

            todayRecords={
              attendanceRecords.filter(
                r =>
                  r.date ===
                  getTodayString()
              )
            }

            leaveRequests={
              leaveRequests
            }

            onPunch={
              handlePunch
            }

            onAddLeave={
              handleAddLeave
            }

            lang={
              lang
            }

            currentUser={
              currentUser
            }
          />
        )}


        {activeTab ===
          'attendance' && (

          <AttendanceLogTable

            records={
              attendanceRecords
            }

            employees={
              employees
            }

            shifts={
              shifts
            }

            leaveRequests={
              leaveRequests
            }

            onAddRecord={
              handleAddRecord
            }

            onBatchAddRecords={
              handleBatchAddRecords
            }

            onUpdateRecord={
              handleUpdateRecord
            }

            onDeleteRecord={
              handleDeleteRecord
            }

            onClearTodayRecords={
              handleClearTodayRecords
            }

            onDeleteFutureRecords={
              handleDeleteFutureAttendance
            }

            onExportCSV={
              handleExportCSV
            }

            lang={
              lang
            }

            onForceEndBreak={
              handleForceEndBreak
            }

            currentUser={
              currentUser
            }

            globalSearchTerm={
              searchTerm
            }
          />
        )}


        {activeTab ===
          'employees' && (

          <EmployeeManager

            employees={
              employees
            }

            shifts={
              shifts
            }

            attendanceRecords={
              attendanceRecords
            }

            leaveRequests={
              leaveRequests
            }

            onAddEmployee={
              handleAddEmployee
            }

            onUpdateEmployee={
              handleUpdateEmployee
            }

            onDeleteEmployee={
              handleDeleteEmployee
            }

            lang={
              lang
            }

            globalSearchTerm={
              searchTerm
            }
          />
        )}


        {activeTab ===
          'leaves' && (

          <LeaveManager

            leaveRequests={
              leaveRequests
            }

            employees={
              employees
            }

            officialHolidays={
              officialHolidays
            }

            onAddLeave={
              handleAddLeave
            }

            onUpdateLeaveStatus={
              handleUpdateLeaveStatus
            }

            onDeleteLeave={
              handleDeleteLeaveRequest
            }

            onAddOfficialHoliday={
              handleAddOfficialHoliday
            }

            onDeleteOfficialHoliday={
              handleDeleteOfficialHoliday
            }

            currentUser={
              currentUser
            }

            lang={
              lang
            }

            globalSearchTerm={
              searchTerm
            }
          />
        )}


        {activeTab ===
          'import_leaves' && (

          <ImportLeavesView

            employees={
              employees
            }

            existingLeaves={
              leaveRequests
            }

            onImportSuccess={
              handleImportLeavesSuccess
            }

            currentUser={
              currentUser
            }

            lang={
              lang
            }

            onDeleteFutureRecords={
              handleDeleteFutureAttendance
            }
          />
        )}


        {activeTab ===
          'analytics' && (

          <AnalyticsView

            records={
              attendanceRecords
            }

            employees={
              employees
            }

            leaveRequests={
              leaveRequests
            }

            lang={
              lang
            }

            globalSearchTerm={
              searchTerm
            }
          />
        )}


        {activeTab ===
          'portal' && (

          <EmployeePortal

            employees={
              employees
            }

            attendanceRecords={
              attendanceRecords
            }

            leaveRequests={
              leaveRequests
            }

            onPunch={
              handlePunch
            }

            onAddLeave={
              handleAddLeave
            }

            onUpdateEmployee={
              handleUpdateEmployee
            }

            onAddRecord={
              handleAddRecord
            }

            onUpdateRecord={
              handleUpdateRecord
            }

            onUpdateLeaveStatus={
              handleUpdateLeaveStatus
            }

            shifts={
              shifts
            }

            lang={
              lang
            }

            currentUser={
              currentUser
            }
          />
        )}

      </main>


      {/* =====================================================
          LOGIN
          ===================================================== */}

      <LoginModal

        isOpen={
          isLoginModalOpen
        }

        onClose={() =>
          setIsLoginModalOpen(
            false
          )
        }

        employees={
          employees
        }

        onLoginSuccess={
          handleLoginSuccess
        }

        lang={
          lang
        }
      />


      {/* =====================================================
          COMPANY RULES
          ===================================================== */}

      <CompanyRulesModal

        isOpen={
          isRulesModalOpen
        }

        onClose={() =>
          setIsRulesModalOpen(
            false
          )
        }

        lang={
          lang
        }
      />


      {/* =====================================================
          URGENT NOTICE
          ===================================================== */}

      <UrgentNoticeModal

        isOpen={
          isNoticeModalOpen
        }

        onClose={() =>
          setIsNoticeModalOpen(
            false
          )
        }

        notice={
          urgentNotice
        }

        onSaveNotice={
          (
            newNotice:
              UrgentNotice |
              null
          ) => {

            urgentNoticeRef.current =
              newNotice;

            setUrgentNotice(
              newNotice
            );


            if (
              newNotice &&
              newNotice.active !==
                false
            ) {

              localStorage.setItem(
                'urgent_notice',
                JSON.stringify(
                  newNotice
                )
              );


              try {

                Object.keys(
                  localStorage
                ).forEach(
                  key => {

                    if (
                      key.startsWith(
                        'dismissed_notice_'
                      )
                    ) {

                      localStorage.removeItem(
                        key
                      );
                    }
                  }
                );

              } catch {}

            } else {

              localStorage.removeItem(
                'urgent_notice'
              );
            }


            void pushSync({
              urgentNotice:
                newNotice
            });
          }
        }

        lang={
          lang
        }

        authorName={

          currentUser

            ? `${
                (
                  lang === 'ar'
                    ? currentUser.nameAr
                    : currentUser.nameEn
                ) ||
                currentUser.nameAr ||
                currentUser.nameEn ||
                'فريق القيادة'
              } (${
                currentUser.role ===
                'leader'
                  ? 'Team Leader'
                  : (
                      lang === 'ar'
                        ? 'إدارة'
                        : 'Admin'
                    )
              })`

            : (
                lang === 'ar'
                  ? 'فريق القيادة (Team Leader)'
                  : 'Management (Team Leader)'
              )
        }
      />


      {/* =====================================================
    FOOTER
    ===================================================== */}

<footer
  className="
    bg-slate-900
    text-slate-400
    text-xs
    py-6
    border-t
    border-slate-800
  "
>
  <div
    className="
      max-w-7xl
      mx-auto
      px-4
      flex
      flex-col
      gap-5
    "
  >

    <CompanySocialBar
      lang={lang}
      variant="footer"
    />

    <div
      className="
        pt-4
        border-t
        border-slate-800/80
        flex
        flex-col
        sm:flex-row
        items-center
        justify-between
        gap-4
        text-center
        sm:text-right
      "
    >

      <div
        className="
          flex
          items-center
          gap-2.5
        "
      >

        <div
          className="
            h-7
            px-2
            py-0.5
            rounded-md
            bg-white
            border
            border-slate-700
            flex
            items-center
            justify-center
            shrink-0
          "
        >
          <img
            src="logo.png"
            alt="Tech Source GDS"
            className="
              h-full
              w-auto
              object-contain
            "
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        </div>

        <span
          className="
            font-medium
            text-slate-300
          "
        >
          {
            lang === 'ar'
              ? 'TECH SOURCE - GDS Global © 2026 - جميع الحقوق محفوظة'
              : 'TECH SOURCE - GDS Global © 2026 - All Rights Reserved'
          }
        </span>

      </div>

      <div
        className="
          flex
          items-center
          gap-3
          text-slate-400
          font-mono
          text-[11px]
        "
      >

        <span>
          by/Ahmed Mahmoud
        </span>

        <span>
          •
        </span>

        <span
          className="
            text-emerald-400
            font-bold
          "
        >
    
        </span>

      </div>

    </div>

  </div>
</footer>
  </div>
);

}/* =========================================================
   CSV EXPORT
   ========================================================= */

function handleExportCSV() {
  // This function is intentionally declared outside the component
  // only as a placeholder-safe fallback.
  // The actual export handler is attached inside App below.
}
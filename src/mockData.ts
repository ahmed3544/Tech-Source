import { Employee, Shift, AttendanceRecord, LeaveRequest, Department, OfficialHoliday, UrgentNotice } from "./types";

export const INITIAL_SHIFTS: Shift[] = [];

export const INITIAL_DEPARTMENTS: Department[] = [
  { id: "dep-2", nameAr: "CX", nameEn: "CX", managerName: "Mostafa Mohamed Kamel" },
  { id: "dep-4", nameAr: "Quality", nameEn: "Quality", managerName: "-" },
];

export const INITIAL_COMPANY_NAME_AR = "شركة TECH SOURCE GDS";
export const INITIAL_COMPANY_NAME_EN = "TECH SOURCE - GDS Global";

export const INITIAL_URGENT_NOTICE: UrgentNotice | null = null;

export const INITIAL_EMPLOYEES: Employee[] = [
{
    "id": "emp-002",
    "companyId": "tech-source",
    "code": "EMP002",
    "nameAr": "Ahmed Mahmoud Ahmed Mahmoud",
    "nameEn": "Ahmed Mahmoud Ahmed Mahmoud",
    "avatar": "",
    "email": "ahmed.mahmoud@techsource-gds.com",
    "phone": "+966 50 123 4567",
    "department": "CX",
    "jobTitleAr": "CX Agent",
    "jobTitleEn": "CX Agent",
    "shiftId": "shift-1",
    "pin": "1234",
    "role": "admin",
    "joinedDate": "2022-03-15",
    "status": "active",
    "annualLeaveBalance": 14,
    "casualLeaveBalance": 7,
    "regularLeaveBalance": 7,
    "sickLeaveBalance": 25
  }
];

export const INITIAL_LEAVES: LeaveRequest[] = [];

export const INITIAL_ATTENDANCE: AttendanceRecord[] = [];

export const INITIAL_OFFICIAL_HOLIDAYS: OfficialHoliday[] = [
  {
    id: "hol-1",
    nameAr: "عيد الميلاد المجيد",
    nameEn: "Coptic Christmas",
    startDate: "2026-01-07",
    endDate: "2026-01-07",
    daysCount: 1,
    type: "religious",
  },
  {
    id: "hol-2",
    nameAr: "عيد الشرطة وثورة 25 يناير",
    nameEn: "Revolution & Police Day",
    startDate: "2026-01-25",
    endDate: "2026-01-25",
    daysCount: 1,
    type: "national",
  },
  {
    id: "hol-3",
    nameAr: "عيد الفطر المبارك",
    nameEn: "Eid Al-Fitr",
    startDate: "2026-03-20",
    endDate: "2026-03-22",
    daysCount: 3,
    type: "religious",
  },
  {
    id: "hol-4",
    nameAr: "عيد تحرير سيناء",
    nameEn: "Sinai Liberation Day",
    startDate: "2026-04-25",
    endDate: "2026-04-25",
    daysCount: 1,
    type: "national",
  },
  {
    id: "hol-5",
    nameAr: "عيد العمال",
    nameEn: "Labor Day",
    startDate: "2026-05-01",
    endDate: "2026-05-01",
    daysCount: 1,
    type: "official",
  },
  {
    id: "hol-6",
    nameAr: "عيد الأضحى المبارك",
    nameEn: "Eid Al-Adha",
    startDate: "2026-05-27",
    endDate: "2026-05-30",
    daysCount: 4,
    type: "religious",
  },
  {
    id: "hol-7",
    nameAr: "ثورة 30 يونيو",
    nameEn: "June 30 Revolution",
    startDate: "2026-06-30",
    endDate: "2026-06-30",
    daysCount: 1,
    type: "national",
  },
  {
    id: "hol-8",
    nameAr: "ثورة 23 يوليو",
    nameEn: "July 23 Revolution",
    startDate: "2026-07-23",
    endDate: "2026-07-23",
    daysCount: 1,
    type: "national",
  },
  {
    id: "hol-9",
    nameAr: "المولد النبوي الشريف",
    nameEn: "Prophet Birthday",
    startDate: "2026-08-25",
    endDate: "2026-08-25",
    daysCount: 1,
    type: "religious",
  },
  {
    id: "hol-10",
    nameAr: "عيد القوات المسلحة (نصر أكتوبر)",
    nameEn: "Armed Forces Day (6th October)",
    startDate: "2026-10-06",
    endDate: "2026-10-06",
    daysCount: 1,
    type: "national",
  },
];

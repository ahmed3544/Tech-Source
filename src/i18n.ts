import { Language } from './types';

export const UI_TRANSLATIONS = {
  ar: {
    department: 'قسم',
    approved: 'معتمدة',
    present: 'حاضر',
    regularLeave: 'إجازة اعتيادية',
    casualLeave: 'إجازة عارضة',
    sickLeave: 'إجازة مرضية',
    emergencyLeave: 'إجازة طارئة',
    permission: 'إذن استئذان',
    officialHoliday: 'إجازة رسمية',
    weekendHoliday: 'عطلة أسبوعية',
    absent: 'غائب',
    late: 'متأخر',
    earlyLeave: 'انصراف مبكر',
    overtime: 'ساعات إضافية',
    inProgress: 'قيد العمل الآن',
    notLogged: 'لم يسجل بعد',
    hourUnit: 'س',
    hoursUnit: 'ساعات',
    minuteUnit: 'دقيقة',
    minutesUnit: 'دقائق',
    endBreak: 'إنهاء الاستراحة والعودة للعمل',
  },
  en: {
    department: 'Department',
    approved: 'Approved',
    present: 'Present',
    regularLeave: 'Regular Leave',
    casualLeave: 'Casual Leave',
    sickLeave: 'Sick Leave',
    emergencyLeave: 'Emergency Leave',
    permission: 'Permission',
    officialHoliday: 'Official Holiday',
    weekendHoliday: 'Weekend Holiday',
    absent: 'Absent',
    late: 'Late Arrival',
    earlyLeave: 'Early Departure',
    overtime: 'Overtime Work',
    inProgress: 'Currently Clocked In',
    notLogged: 'Not Logged Yet',
    hourUnit: 'h',
    hoursUnit: 'hrs',
    minuteUnit: 'min',
    minutesUnit: 'mins',
    endBreak: 'End Break',
  },
} as const;

const BACKEND_VALUE_MAP: Record<string, keyof typeof UI_TRANSLATIONS.en> = {
  'حاضر': 'present',
  'حاضر (في الوقت)': 'present',
  'موجود': 'present',
  'غياب': 'absent',
  'غائب': 'absent',
  'متأخر': 'late',
  'انصراف مبكر': 'earlyLeave',
  'ساعات إضافية': 'overtime',
  'قيد العمل الان': 'inProgress',
  'قيد العمل الآن': 'inProgress',
  'لم يسجل بعد': 'notLogged',
  'عطلة أسبوعية': 'weekendHoliday',
  'إجازة اعتيادية': 'regularLeave',
  'إجازة سنوية': 'regularLeave',
  'إجازة عارضة': 'casualLeave',
  'إجازة مرضية': 'sickLeave',
  'إجازة طارئة': 'emergencyLeave',
  'إذن استئذان': 'permission',
  'استئذان': 'permission',
  'إجازة رسمية': 'officialHoliday',
  'معتمدة': 'approved',
  'قسم': 'department',
  'س': 'hourUnit',
  'ساعة': 'hourUnit',
  'ساعات': 'hoursUnit',
  'دقيقة': 'minuteUnit',
  'دقائق': 'minutesUnit',
};

/** Translate known Arabic values returned by the API/database before rendering. */
export function localizeBackendValue(value: unknown, lang: Language): string {
  if (value === null || value === undefined) return '';
  const raw = String(value).trim();
  if (!raw) return '';
  if (lang !== 'en') return raw;

  const key = BACKEND_VALUE_MAP[raw];
  if (key) return UI_TRANSLATIONS.en[key];

  let result = raw;
  for (const [ar, keyName] of Object.entries(BACKEND_VALUE_MAP)) {
    if (result.includes(ar)) result = result.split(ar).join(UI_TRANSLATIONS.en[keyName]);
  }
  return result;
}

export function getUiText(lang: Language) {
  return UI_TRANSLATIONS[lang] || UI_TRANSLATIONS.ar;
}

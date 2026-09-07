import { Language } from './types';

export const UI_TRANSLATIONS = {
  ar: {
    department: 'قسم',
    approved: 'معتمدة',
    hourUnit: 'س',
    minuteUnit: 'دقيقة',
    endBreak: 'إنهاء الاستراحة والعودة للعمل',
  },
  en: {
    department: 'Department',
    approved: 'Approved',
    hourUnit: 'h',
    minuteUnit: 'min',
    endBreak: 'End Break',
  },
} as const;

export function getUiText(lang: Language) {
  return UI_TRANSLATIONS[lang] || UI_TRANSLATIONS.ar;
}

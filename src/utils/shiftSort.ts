import type { Shift } from '../types';

/** "HH:mm" → minutes since midnight; null when missing or malformed. */
const toMinutes = (time?: string | null): number | null => {
  if (!time) return null;
  const match = /^(\d{1,2}):(\d{2})/.exec(String(time).trim());
  if (!match) return null;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  return Number.isFinite(minutes) ? minutes : null;
};

/**
 * Orders shifts ASCENDING by start time ("عايزك تنظم الشفتات تصاعدي"), with
 * end time then Arabic name as tiebreakers. Shifts without a start time keep
 * their relative order at the end. Returns a new array — the input is intact.
 */
export const sortShiftsAscending = (shifts: Shift[]): Shift[] =>
  [...shifts].sort((a, b) => {
    const aStart = toMinutes(a.startTime);
    const bStart = toMinutes(b.startTime);
    if (aStart === null && bStart !== null) return 1;
    if (aStart !== null && bStart === null) return -1;
    if (aStart !== null && bStart !== null && aStart !== bStart) return aStart - bStart;
    const aEnd = toMinutes(a.endTime);
    const bEnd = toMinutes(b.endTime);
    if (aEnd !== null && bEnd !== null && aEnd !== bEnd) return aEnd - bEnd;
    return String(a.nameAr || a.name || '').localeCompare(String(b.nameAr || b.name || ''));
  });

import { Language } from '../types';

/**
 * Universal Excel dashboard import engine — "استيراد الداش بورد من Excel".
 *
 * The user manages their dashboard in their OWN Excel file (Arabic or English,
 * any layout). This engine scans every worksheet, finds the header row, maps
 * the columns by bilingual synonyms, and classifies each sheet:
 *
 *   - 'employees' : a staff list (name/code columns, no date columns)
 *   - 'schedule'  : a roster — either a GRID (one column per date/weekday) or
 *                   a LONG table (one row per employee+date with a shift column)
 *   - 'unknown'   : reported back with its headers so the preview stays honest
 *
 * The engine is pure TypeScript (no DOM, no Node APIs) so it runs identically
 * in the browser (file upload preview) and on the server (URL auto-sync).
 */

export interface DashboardSheetInput {
  name: string;
  rows: unknown[][];
}

export interface DashboardEmployeeCandidate {
  rowIndex: number;
  code: string;
  nameRaw: string;
  nameAr: string;
  nameEn: string;
  phone: string;
  department: string;
  jobTitle: string;
  roleText: string;
}

export interface DashboardCellAssignment {
  /** Index into the sheet's `employees` array. */
  employeeIndex: number;
  date: string; // YYYY-MM-DD
  rawText: string;
  /** Shift label without the time range (e.g. "صباحي") — used to match/create shifts. */
  nameText: string;
  startTime: string; // HH:MM or ''
  endTime: string;   // HH:MM or ''
  kind: 'shift' | 'off';
}

export interface DashboardSheetAnalysis {
  name: string;
  kind: 'employees' | 'schedule' | 'unknown';
  headerRowIndex: number;
  columns: {
    code?: number;
    name?: number;
    nameEn?: number;
    role?: number;
    department?: number;
    phone?: number;
    jobTitle?: number;
    pin?: number;
    shift?: number;
    date?: number;
  };
  dateColumns: Array<{ col: number; date: string }>;
  longFormat: boolean;
  employees: DashboardEmployeeCandidate[];
  assignments: DashboardCellAssignment[];
  dateRange: [string, string] | null;
  warnings: string[];
  sampleHeaders: string[];
  skippedRows: number;
}

export interface DashboardAnalysis {
  sheets: DashboardSheetAnalysis[];
  totalEmployees: number;
  totalAssignments: number;
  warnings: string[];
}

export interface AnalyzeOptions {
  lang: Language;
  /** YYYY-MM-DD anchor for weekday headers / year-less dates. Defaults to today (Cairo). */
  today?: string;
}

/* ------------------------------------------------------------------ */
/* Text normalization + bilingual keyword dictionaries                 */
/* ------------------------------------------------------------------ */

const pad = (n: number) => String(n).padStart(2, '0');

const norm = (x: unknown): string =>
  String(x ?? '')
    .replace(/[\u064B-\u0652\u0640]/g, '') // diacritics + tatweel
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const hasArabic = (text: string) => /[\u0600-\u06FF]/.test(text);

/** Header keyword tables — checked longest-first so "كود الموظف" beats "كود". */
const HEADER_KEYS: Record<string, string[]> = {
  name: ['اسم الموظف', 'الاسم بالكامل', 'employee name', 'full name', 'الاسم', 'اسم', 'الموظف', 'name', 'employee'],
  nameEn: ['الاسم بالانجليزي', 'الاسم بالإنجليزية', 'الاسم الانجليزي', 'english name', 'name en', 'name english'],
  code: ['رقم الموظف', 'الكود الوظيفي', 'كود الموظف', 'الرقم الوظيفي', 'employee id', 'employee code', 'الرقم السري', 'الكود', 'كود', 'code', 'emp id', 'id'],
  role: ['الدور الوظيفي', 'الصلاحية', 'الدور', 'role', 'الدور الوظيفى'],
  department: ['القسم', 'قسم', 'الفريق', 'department', 'dept', 'team'],
  jobTitle: ['الوظيفة', 'المنصب', 'المسمى الوظيفي', 'job title', 'position', 'title', 'job'],
  phone: ['رقم الموبايل', 'الموبايل', 'موبايل', 'التليفون', 'الهاتف', 'هاتف', 'الجوال', 'phone', 'mobile'],
  pin: ['كلمة المرور', 'كلمة السر', 'كود الدخول', 'الباسورد', 'password', 'pin'],
  shift: ['الشيفت الافتراضي', 'الوردية الافتراضية', 'الشيفت', 'الشيام', 'الوردية', 'شيفت', 'default shift', 'shift'],
  date: ['التاريخ', 'تاريخ', 'اليوم', 'date', 'day'],
  timeIn: ['وقت الحضور', 'وقت الدخول', 'الحضور', 'الدخول', 'حضور', 'دخول', 'check in', 'checkin', 'time in', 'start time', 'start'],
  timeOut: ['وقت الانصراف', 'وقت الخروج', 'الانصراف', 'الخروج', 'انصراف', 'خروج', 'check out', 'checkout', 'time out', 'end time', 'end'],
  status: ['الحالة', 'حالة', 'status'],
};

/**
 * Returns the matched keyword for a column kind, or null.
 * Pass 1: exact (normalized) equality — "الاسم" must stay "name", never bleed
 *         into "الاسم بالانجليزي" (nameEn).
 * Pass 2: the header CONTAINS the keyword ("كود الموظف" contains "كود").
 * The reverse containment (keyword contains header) is intentionally dropped:
 * it made every short header match a longer unrelated key.
 */
const matchHeaderKey = (header: string, kind: keyof typeof HEADER_KEYS): string | null => {
  const h = norm(header);
  if (!h) return null;
  for (const key of HEADER_KEYS[kind]) {
    const k = norm(key);
    if (k && h === k) return key;
  }
  for (const key of HEADER_KEYS[kind]) {
    const k = norm(key);
    if (k && k.length >= 3 && h.length >= k.length + 1 && h.includes(k)) return key;
  }
  return null;
};

const matchAnyHeader = (header: string): keyof typeof HEADER_KEYS | null => {
  const kinds = Object.keys(HEADER_KEYS) as Array<keyof typeof HEADER_KEYS>;
  // Pass 1 — exact equality wins immediately.
  for (const kind of kinds) {
    const h = norm(header);
    if (h && HEADER_KEYS[kind].some((key) => norm(key) === h)) return kind;
  }
  // Pass 2 — longest matched containment keyword wins.
  let best: keyof typeof HEADER_KEYS | null = null;
  let bestLen = -1;
  for (const kind of kinds) {
    const matched = matchHeaderKey(header, kind);
    if (matched) {
      const len = norm(matched).length;
      if (len > bestLen) { best = kind; bestLen = len; }
    }
  }
  return best;
};

/* ------------------------------------------------------------------ */
/* Dates: header parsing + anchoring                                   */
/* ------------------------------------------------------------------ */

/** Arabic weekday variants → JS weekday (0 = Sunday .. 6 = Saturday). */
const AR_WEEKDAYS: Array<{ variants: string[]; jsDay: number }> = [
  { variants: ['الأحد', 'الاحد'], jsDay: 0 },
  { variants: ['الاثنين', 'الإثنين'], jsDay: 1 },
  { variants: ['الثلاثاء'], jsDay: 2 },
  { variants: ['الأربعاء', 'الاربعاء'], jsDay: 3 },
  { variants: ['الخميس'], jsDay: 4 },
  { variants: ['الجمعة', 'الجمعه'], jsDay: 5 },
  { variants: ['السبت'], jsDay: 6 },
];
// "الحد" = colloquial Sunday spelling seen in hand-made rosters.
AR_WEEKDAYS[0].variants.push('الحد');
const EN_WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/** Arabic/English month names → month number (1..12), alt spellings included. */
const AR_MONTHS: Array<{ variants: string[]; month: number }> = [
  { variants: ['يناير', 'كانون الثاني'], month: 1 },
  { variants: ['فبراير', 'شباط'], month: 2 },
  { variants: ['مارس', 'آذار'], month: 3 },
  { variants: ['أبريل', 'ابريل', 'نيسان'], month: 4 },
  { variants: ['مايو', 'أيار'], month: 5 },
  { variants: ['يونيو', 'يونيه', 'حزيران'], month: 6 },
  { variants: ['يوليو', 'يوليه', 'تموز'], month: 7 },
  { variants: ['أغسطس', 'اغسطس', 'آب'], month: 8 },
  { variants: ['سبتمبر', 'أيلول'], month: 9 },
  { variants: ['أكتوبر', 'اكتوبر', 'تشرين الأول'], month: 10 },
  { variants: ['نوفمبر', 'تشرين الثاني'], month: 11 },
  { variants: ['ديسمبر', 'كانون الأول'], month: 12 },
];
const EN_MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

/** Excel serial date (number) → YYYY-MM-DD. */
const excelSerialToDate = (value: number): string => {
  if (!Number.isFinite(value) || value < 20000 || value > 60000) return ''; // 1954..2064 sanity window
  const ms = Math.round((value - 25569) * 86400 * 1000);
  const d = new Date(ms);
  return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : '';
};

/**
 * Parses a cell/header into YYYY-MM-DD.
 * Accepts ISO (2026-10-25), dd/mm/yyyy, dd-mm-yyyy, dd/mm, dd Month (25 اكتوبر),
 * Month dd (اكتوبر 25) and Excel serial numbers. Year-less forms are anchored
 * to the year that lands closest to `today`.
 */
export const parseDateCell = (raw: unknown, today: string): string => {
  if (raw === null || raw === undefined || raw === '') return '';
  if (typeof raw === 'number') return excelSerialToDate(raw);
  const text = String(raw).replace(/\s+/g, ' ').trim();
  if (!text) return '';

  const iso = text.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const key = `${iso[1]}-${pad(Number(iso[2]))}-${pad(Number(iso[3]))}`;
    return Number.isFinite(Date.parse(`${key}T00:00:00Z`)) ? key : '';
  }
  const dmy = text.match(/(\d{1,2})\s*[/\-.]\s*(\d{1,2})(?:\s*[/\-.]\s*(\d{2,4}))?/);
  const monthName = (() => {
    const lower = norm(text);
    const arHit = AR_MONTHS.find((m) => m.variants.some((v) => lower.includes(norm(v))));
    if (arHit) return arHit.month;
    const enIdx = EN_MONTHS.findIndex((m) => lower.includes(m.slice(0, 3)));
    if (enIdx >= 0) return enIdx + 1;
    return 0;
  })();
  if (monthName) {
    const dayMatch = text.match(/(\d{1,2})/);
    const yearMatch = text.match(/(20\d{2})/);
    if (dayMatch) {
      const day = pad(Number(dayMatch[1]));
      const month = pad(monthName);
      if (yearMatch) return `${yearMatch[1]}-${month}-${day}`;
      return anchorYear(today, month, day);
    }
  }
  if (dmy) {
    const day = pad(Number(dmy[1]));
    const month = pad(Number(dmy[2]));
    if (dmy[3]) {
      const year = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
      const key = `${year}-${month}-${day}`;
      return Number.isFinite(Date.parse(`${key}T00:00:00Z`)) ? key : '';
    }
    return anchorYear(today, month, day);
  }
  return '';
};

/** Anchors month-day to the year (today-1 / today / today+1) closest to today. */
const anchorYear = (today: string, month: string, day: string): string => {
  const year = Number(today.slice(0, 4));
  const candidates = [year - 1, year, year + 1]
    .map((y) => `${y}-${month}-${day}`)
    .filter((key) => Number.isFinite(Date.parse(`${key}T00:00:00Z`)));
  if (!candidates.length) return '';
  const todayTs = Date.parse(`${today}T00:00:00Z`);
  return candidates.sort((a, b) =>
    Math.abs(Date.parse(`${a}T00:00:00Z`) - todayTs) - Math.abs(Date.parse(`${b}T00:00:00Z`) - todayTs),
  )[0];
};

/** Weekday-name header → date in the Saturday..Friday week containing `today`. */
const weekdayHeaderToDate = (header: string, today: string): string => {
  const lower = norm(header);
  let jsDay = -1;
  const arHit = AR_WEEKDAYS.find((wd) => wd.variants.some((v) => lower.includes(norm(v))));
  if (arHit) jsDay = arHit.jsDay;
  if (jsDay < 0) {
    for (let i = 0; i < EN_WEEKDAYS.length; i++) {
      if (lower.includes(EN_WEEKDAYS[i].slice(0, 3))) { jsDay = i; break; }
    }
  }
  if (jsDay < 0) return '';
  // Anchor: the Saturday..Friday window containing today.
  const base = new Date(`${today}T00:00:00Z`);
  const daysSinceSaturday = (base.getUTCDay() + 1) % 7; // Sat=0, Sun=1, ... Fri=6
  const saturday = new Date(base);
  saturday.setUTCDate(base.getUTCDate() - daysSinceSaturday);
  // Map JS weekday (0=Sun..6=Sat) to offset from Saturday: Sat=0, Sun=1 ... Fri=6
  const offsetFromSaturday = (jsDay + 1) % 7;
  const result = new Date(saturday);
  result.setUTCDate(saturday.getUTCDate() + offsetFromSaturday);
  return result.toISOString().slice(0, 10);
};

/* ------------------------------------------------------------------ */
/* Shift cell parsing                                                  */
/* ------------------------------------------------------------------ */

const TIME_RANGE_RE = /(\d{1,2})[:.](\d{2})\s*(?:ص|م|am|pm)?\s*[–\-—ـ]\s*(\d{1,2})[:.](\d{2})\s*(?:ص|م|am|pm)?/gi;

const normTime = (h: string, m: string) => `${pad(Number(h))}:${m}`;

const OFF_WORDS = ['off', 'راحة', 'راحه', 'اجازة', 'إجازة', 'عطلة', 'رست', 'rest', 'leave', 'day off'];

export const parseShiftCell = (raw: unknown): { kind: 'shift' | 'off' | 'empty'; nameText: string; startTime: string; endTime: string } => {
  if (raw === null || raw === undefined) return { kind: 'empty', nameText: '', startTime: '', endTime: '' };
  const text = String(raw).replace(/\s+/g, ' ').trim();
  if (!text || text === '-' || text === '—' || text === 'ـ') return { kind: 'empty', nameText: '', startTime: '', endTime: '' };

  // NOTE: JS \b never matches around Arabic letters (non-\w), so compare with
  // normalized equality / prefix instead of word-boundary regexes.
  const n = norm(text);
  if (n === 'x' || n === '×' || OFF_WORDS.some((w) => n === w || n.startsWith(`${w} `) || n.endsWith(` ${w}`))) {
    return { kind: 'off', nameText: text, startTime: '', endTime: '' };
  }

  TIME_RANGE_RE.lastIndex = 0;
  const range = TIME_RANGE_RE.exec(text);
  if (range) {
    const nameText = text.replace(range[0], ' ').replace(TIME_RANGE_RE, ' ').replace(/[–\-—ـ]/g, ' ').replace(/\s+/g, ' ').trim();
    return { kind: 'shift', nameText, startTime: normTime(range[1], range[2]), endTime: normTime(range[3], range[4]) };
  }
  // A bare time like "09:00" alone is not enough to build a shift → treat as name text.
  return { kind: 'shift', nameText: text, startTime: '', endTime: '' };
};

/* ------------------------------------------------------------------ */
/* Sheet analysis                                                      */
/* ------------------------------------------------------------------ */

const MAX_HEADER_SCAN = 12;

const scoreHeaderRow = (row: unknown[], today: string): number => {
  let score = 0;
  for (const cell of row) {
    if (cell === null || cell === undefined || String(cell).trim() === '') continue;
    const text = String(cell);
    if (matchAnyHeader(text)) { score += 2; continue; }
    if (parseDateCell(text, today)) { score += 2; continue; }
    if (weekdayHeaderToDate(text, today)) { score += 2; continue; }
  }
  return score;
};

const cairoToday = (): string => {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
};

export function analyzeDashboardSheets(sheets: DashboardSheetInput[], options: AnalyzeOptions): DashboardAnalysis {
  const today = options.today || cairoToday();
  const globalWarnings: string[] = [];
  const result: DashboardSheetAnalysis[] = [];

  for (const sheet of sheets) {
    const analysis = analyzeOneSheet(sheet, today, options.lang);
    if (analysis.kind === 'unknown' && analysis.warnings.length) globalWarnings.push(`${sheet.name}: ${analysis.warnings[0]}`);
    result.push(analysis);
  }

  const seenGlobalCodes = new Set<string>();
  const seenGlobalNames = new Set<string>();
  let totalEmployees = 0;
  let totalAssignments = 0;
  for (const sheet of result) {
    totalAssignments += sheet.assignments.length;
    if (sheet.kind === 'unknown') continue;
    for (const employee of sheet.employees) {
      const codeKey = norm(employee.code);
      const nameKey = norm(employee.nameRaw);
      if ((codeKey && seenGlobalCodes.has(codeKey)) || (nameKey && seenGlobalNames.has(nameKey))) continue;
      if (codeKey) seenGlobalCodes.add(codeKey);
      if (nameKey) seenGlobalNames.add(nameKey);
      totalEmployees++;
    }
  }

  return { sheets: result, totalEmployees, totalAssignments, warnings: globalWarnings };
}

function analyzeOneSheet(sheet: DashboardSheetInput, today: string, lang: Language): DashboardSheetAnalysis {
  const ar = lang === 'ar';
  const grid = (sheet.rows || []).filter((r): r is unknown[] => Array.isArray(r));
  const analysis: DashboardSheetAnalysis = {
    name: sheet.name,
    kind: 'unknown',
    headerRowIndex: -1,
    columns: {},
    dateColumns: [],
    longFormat: false,
    employees: [],
    assignments: [],
    dateRange: null,
    warnings: [],
    sampleHeaders: [],
    skippedRows: 0,
  };
  if (grid.length < 2) {
    analysis.warnings.push(ar ? 'الورقة فارغة أو لا تحتوي على صفوف كافية.' : 'The sheet is empty or has too few rows.');
    return analysis;
  }

  /* 1) Find the header row: first of the top rows with the best keyword score. */
  let headerRowIndex = -1;
  let bestScore = 0;
  const scanLimit = Math.min(MAX_HEADER_SCAN, grid.length - 1);
  for (let r = 0; r < scanLimit; r++) {
    const score = scoreHeaderRow(grid[r] ?? [], today);
    if (score > bestScore) { bestScore = score; headerRowIndex = r; }
  }
  if (headerRowIndex < 0 || bestScore < 2) {
    analysis.warnings.push(ar ? 'لم يتم التعرف على صف عناوين — لا تحتوي الورقة على أعمدة معروفة.' : 'No recognizable header row — none of the columns match known fields.');
    return analysis;
  }
  const header = (grid[headerRowIndex] ?? []).map((c) => (c === null || c === undefined ? '' : String(c)));
  analysis.headerRowIndex = headerRowIndex;
  analysis.sampleHeaders = header.filter((h) => String(h).trim()).slice(0, 12).map((h) => String(h).trim());

  /* 2) Map columns. */
  const columns: DashboardSheetAnalysis['columns'] = {};
  const dateColumns: Array<{ col: number; date: string }> = [];
  let hasBreakColumn = false;
  for (let col = 0; col < header.length; col++) {
    const cellText = header[col];
    if (!String(cellText).trim()) continue;
    const kind = matchAnyHeader(cellText);
    if (kind) {
      if (kind === 'date') {
        if (columns.date === undefined) columns.date = col;
        continue;
      }
      if (columns[kind as keyof typeof columns] === undefined) (columns as any)[kind] = col;
      continue;
    }
    if (/بريكات|breaks?\b/i.test(String(cellText))) { hasBreakColumn = true; continue; }
    const dateKey = parseDateCell(cellText, today);
    if (dateKey) { dateColumns.push({ col, date: dateKey }); continue; }
    const weekdayKey = weekdayHeaderToDate(cellText, today);
    if (weekdayKey) dateColumns.push({ col, date: weekdayKey });
  }
  analysis.columns = columns;
  analysis.dateColumns = dateColumns;
  if (hasBreakColumn) {
    analysis.warnings.push(ar ? 'أعمدة البريكات غير مدعومة في استيراد الداش بورد وتم تجاهلها.' : 'Breaks columns are not supported by the dashboard import and were ignored.');
  }

  /* 3) Classify the sheet. */
  const hasIdentity = columns.name !== undefined || columns.code !== undefined;
  if (dateColumns.length >= 1 && hasIdentity) {
    analysis.kind = 'schedule';
  } else if (hasIdentity && columns.date !== undefined && columns.shift !== undefined) {
    analysis.kind = 'schedule';
    analysis.longFormat = true;
  } else if (hasIdentity) {
    analysis.kind = 'employees';
  } else {
    analysis.warnings.push(ar ? 'لم يتم العثور على عمود اسم أو كود للموظف.' : 'No employee name or code column found.');
    return analysis;
  }

  /* 4) Parse employee rows. Long-format rosters legitimately repeat the same
        employee on multiple rows (one row per date) — only dedupe grid/list
        sheets, where duplicates are genuinely the same row re-entered. */
  const dedupeRows = analysis.kind !== 'schedule' || !analysis.longFormat;
  const seenCodes = new Set<string>();
  const seenNames = new Set<string>();
  for (let r = headerRowIndex + 1; r < grid.length; r++) {
    const row = grid[r] ?? [];
    const code = columns.code !== undefined ? String(row[columns.code] ?? '').replace(/\s+/g, ' ').trim() : '';
    const rawName = columns.name !== undefined ? String(row[columns.name] ?? '').replace(/\s+/g, ' ').trim() : '';
    if (!code && !rawName) { analysis.skippedRows++; continue; }
    const codeKey = norm(code);
    const nameKey = norm(rawName);
    if (dedupeRows) {
      if ((codeKey && seenCodes.has(codeKey)) || (nameKey && seenNames.has(nameKey))) continue;
      if (codeKey) seenCodes.add(codeKey);
      if (nameKey) seenNames.add(nameKey);
    }

    const rawNameEn = columns.nameEn !== undefined ? String(row[columns.nameEn] ?? '').trim() : '';
    let nameAr = '';
    let nameEn = '';
    if (rawNameEn) { nameEn = rawNameEn; if (hasArabic(rawName)) nameAr = rawName; }
    else if (hasArabic(rawName)) nameAr = rawName;
    else nameEn = rawName;

    analysis.employees.push({
      rowIndex: r,
      code,
      nameRaw: rawName || rawNameEn || code,
      nameAr,
      nameEn,
      phone: columns.phone !== undefined ? String(row[columns.phone] ?? '').trim() : '',
      department: columns.department !== undefined ? String(row[columns.department] ?? '').trim() : '',
      jobTitle: columns.jobTitle !== undefined ? String(row[columns.jobTitle] ?? '').trim() : '',
      roleText: columns.role !== undefined ? String(row[columns.role] ?? '').trim() : '',
    });
  }
  if (!analysis.employees.length) {
    analysis.warnings.push(ar ? 'لم يتم العثور على صفوف موظفين صالحة.' : 'No valid employee rows found.');
  }

  /* 5) Parse schedule cells. */
  if (analysis.kind === 'schedule') {
    let unmatchedCells = 0;
    if (analysis.longFormat) {
      for (let r = headerRowIndex + 1; r < grid.length; r++) {
        const row = grid[r] ?? [];
        const dateKey = parseDateCell(row[columns.date ?? -1], today);
        if (!dateKey) { analysis.skippedRows++; continue; }
        const employeeIndex = analysis.employees.findIndex((e) => e.rowIndex === r);
        if (employeeIndex < 0) continue;
        const shiftCol = columns.shift ?? -1;
        const parsed = parseShiftCell(row[shiftCol]);
        if (parsed.kind === 'empty') continue;
        if (parsed.kind === 'shift' && !parsed.startTime && !parsed.nameText) { unmatchedCells++; continue; }
        analysis.assignments.push({ employeeIndex, date: dateKey, rawText: String(row[shiftCol] ?? ''), nameText: parsed.nameText, startTime: parsed.startTime, endTime: parsed.endTime, kind: parsed.kind === 'off' ? 'off' : 'shift' });
      }
    } else {
      for (let r = headerRowIndex + 1; r < grid.length; r++) {
        const row = grid[r] ?? [];
        const employeeIndex = analysis.employees.findIndex((e) => e.rowIndex === r);
        if (employeeIndex < 0) continue;
        for (const { col, date } of dateColumns) {
          const parsed = parseShiftCell(row[col]);
          if (parsed.kind === 'empty') continue;
          if (parsed.kind === 'shift' && !parsed.startTime && !parsed.nameText) { unmatchedCells++; continue; }
          analysis.assignments.push({ employeeIndex, date, rawText: String(row[col] ?? ''), nameText: parsed.nameText, startTime: parsed.startTime, endTime: parsed.endTime, kind: parsed.kind === 'off' ? 'off' : 'shift' });
        }
      }
    }
    if (unmatchedCells) {
      analysis.warnings.push(ar ? `${unmatchedCells} خلية شيفت غير مفهومة تم تجاهلها.` : `${unmatchedCells} unrecognized shift cells were skipped.`);
    }
    const dates = Array.from(new Set(analysis.assignments.map((a) => a.date))).sort();
    analysis.dateRange = dates.length ? [dates[0], dates[dates.length - 1]] : null;
  }

  return analysis;
}

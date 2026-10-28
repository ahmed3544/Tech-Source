import { eq } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import * as schema from '../src/db/schema.js';
import { requireManager, isPlatformAdmin, canManageEmployee, authenticateRequest, type AuthedEmployee } from './auth.js';
import { logActivity } from './activity-logs.js';
import { timingSafeEqual } from 'node:crypto';

function cryptoSafeEqual(a: string, b: string): boolean {
  try { return timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8')); }
  catch { return false; }
}
import { analyzeDashboardSheets, type DashboardSheetInput, type DashboardAnalysis } from '../src/utils/dashboardImport.js';

/**
 * Excel dashboard import — "استيراد الداش بورد من اكسيل تلقائي".
 *
 * The user keeps their dashboard in their own Excel file. Two ways in:
 *
 *  1. Upload: the browser parses the file (xlsx), the shared engine
 *     (src/utils/dashboardImport.ts) auto-detects sheets/columns, the panel
 *     shows a preview, and POST /api/dashboard-import/apply applies it.
 *  2. Auto-sync (URL): the admin saves a direct link to the hosted file
 *     (OneDrive / Google Drive / any URL). POST /api/dashboard-import/url
 *     downloads + parses + applies server-side, and the Vercel cron
 *     (GET /api/dashboard-import/cron) repeats it daily when autoSync is on.
 *
 * What gets applied:
 *   - Employees: matched by code or name; missing ones created (role always
 *     'employee', default PIN from the panel/config); empty phone/department/
 *     job title fields filled for existing rows. PINs/codes/roles never touched.
 *   - Shifts: cells like "صباحي 09:00-17:00" match an existing shift by name or
 *     start+end time; unmatched ones are auto-created when the option is on.
 *   - Schedule: merged into settings.dailyShiftAssignments with the same
 *     semantics as /api/schedule-sync (fresh stamp = import wins), OFF/راحة/
 *     إجازة cells become isOffDay.
 *
 * Permissions: managers only; team leaders are scoped to their own team for
 * existing employees and only ever create members of their own team.
 */

const CONFIG_KEY = 'dashboardImportConfig';
const URL_RE = /^(https:\/\/\S+|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?\S*)$/i;
const MAX_SHEETS = 20;
const MAX_ROWS_PER_SHEET = 5000;
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const AUTO_MIN_INTERVAL_MS = 6 * 60 * 60 * 1000; // cron auto runs at most every 6h
// Stored-workbook auto-import: the raw uploaded file is kept (base64) so the
// daily cron can re-apply it without any manual step. Cap keeps the settings
// JSON row well under Postgres/Vercel limits (3 MB binary ≈ 4 MB base64).
const MAX_STORED_FILE_BYTES = 3 * 1024 * 1024;
const MAX_STORED_B64_CHARS = 4_100_000;

export interface DashboardImportConfig {
  sourceUrl: string;
  autoSync: boolean;
  defaultPin: string;
  // Auto re-import of the last uploaded workbook (local-file story).
  autoImport?: boolean;
  storedFile?: {
    name: string;
    data: string; // base64 of the .xlsx/.xls/.csv bytes
    size: number;
    uploadedAt: string;
    uploadedBy: string;
    uploadedByName: string;
  } | null;
  lastSyncAt?: string | null;
  lastSyncStatus?: 'ok' | 'error' | null;
  lastSyncError?: string | null;
  lastSyncSummary?: string | null;
}

async function readConfig(): Promise<DashboardImportConfig> {
  const rows = await db.select().from(schema.settings).where(eq(schema.settings.key, CONFIG_KEY));
  const value = rows[0]?.value;
  const raw = (value && typeof value === 'object' && !Array.isArray(value) ? value : {}) as Partial<DashboardImportConfig>;
  return {
    sourceUrl: String(raw.sourceUrl ?? ''),
    autoSync: Boolean(raw.autoSync),
    defaultPin: String(raw.defaultPin ?? ''),
    autoImport: Boolean(raw.autoImport),
    storedFile: raw.storedFile && typeof raw.storedFile === 'object' && typeof raw.storedFile.data === 'string' ? raw.storedFile : null,
    lastSyncAt: raw.lastSyncAt ?? null,
    lastSyncStatus: raw.lastSyncStatus ?? null,
    lastSyncError: raw.lastSyncError ?? null,
    lastSyncSummary: raw.lastSyncSummary ?? null,
  };
}

async function writeConfig(cfg: DashboardImportConfig): Promise<void> {
  await db.insert(schema.settings).values({ key: CONFIG_KEY, value: cfg } as any)
    .onConflictDoUpdate({ target: schema.settings.key, set: { value: cfg } as any });
}

const cairoToday = (): string => {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
};

const norm = (x: unknown) => String(x ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
const hasArabic = (text: string) => /[\u0600-\u06FF]/.test(text);

const TIME_RANGE_RE = /(\d{1,2})[:.](\d{2})\s*[–\-—ـ]\s*(\d{1,2})[:.](\d{2})/;

function minutesBetween(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let mins = eh * 60 + em - (sh * 60 + sm);
  if (mins <= 0) mins += 1440; // overnight shift
  return Math.max(0, mins);
}

/* ------------------------------------------------------------------ */
/* Apply pipeline                                                      */
/* ------------------------------------------------------------------ */

export interface ApplyOptions {
  defaultPin: string;
  createMissingEmployees: boolean;
  autoCreateShifts: boolean;
  overwriteAssignments: boolean;
}

export interface ApplySummary {
  sheetsScanned: number;
  sheetKinds: Array<{ name: string; kind: string }>;
  employeesCreated: number;
  employeesUpdated: number;
  shiftsCreated: number;
  assignmentsApplied: number;
  offDays: number;
  skippedAssignments: number;
  dateRange: [string, string] | null;
  warnings: string[];
  createdEmployeeCodes: string[];
  createdShiftNames: string[];
}

export async function applyDashboardImport(
  sheets: DashboardSheetInput[],
  options: ApplyOptions,
  manager: AuthedEmployee | null,
): Promise<ApplySummary> {
  const analysis: DashboardAnalysis = analyzeDashboardSheets(sheets, { lang: 'ar', today: cairoToday() });
  const summary: ApplySummary = {
    sheetsScanned: analysis.sheets.length,
    sheetKinds: analysis.sheets.map((s) => ({ name: s.name, kind: s.kind })),
    employeesCreated: 0,
    employeesUpdated: 0,
    shiftsCreated: 0,
    assignmentsApplied: 0,
    offDays: 0,
    skippedAssignments: 0,
    dateRange: null,
    warnings: [...analysis.warnings],
    createdEmployeeCodes: [],
    createdShiftNames: [],
  };

  const employees = await db.select().from(schema.employees);
  const shifts = await db.select().from(schema.shifts);
  const settingsRows = await db.select().from(schema.settings).where(eq(schema.settings.key, 'dailyShiftAssignments'));
  const existingAssignments: any[] = Array.isArray(settingsRows[0]?.value) ? settingsRows[0].value : [];

  const byCode = new Map<string, any>();
  const byName = new Map<string, any>();
  for (const e of employees as any[]) {
    const code = norm(e.code);
    if (code) byCode.set(code, e);
    for (const n of [e.nameAr, e.nameEn]) {
      const key = norm(n);
      if (key && !byName.has(key)) byName.set(key, e);
    }
  }

  /* ---- 1) Employees ---- */
  // candidateKey `${sheetIdx}:${employeeIndexInSheet}` → resolved employee row
  const resolved = new Map<string, { id: string; allowed: boolean }>();
  const usedCodes = new Set<string>(Array.from(byCode.keys()));

  for (let sheetIdx = 0; sheetIdx < analysis.sheets.length; sheetIdx++) {
    const sheet = analysis.sheets[sheetIdx];
    if (sheet.kind === 'unknown') continue;
    // NOTE: assignments reference employees by ARRAY INDEX (employeeIndex),
    // so the resolution map must be keyed by that index — not by the raw
    // spreadsheet row number.
    for (let candidateIdx = 0; candidateIdx < sheet.employees.length; candidateIdx++) {
      const candidate = sheet.employees[candidateIdx];
      const key = `${sheetIdx}:${candidateIdx}`;
      let match = candidate.code ? byCode.get(norm(candidate.code)) : undefined;
      if (!match) {
        match = byName.get(norm(candidate.nameAr)) ?? byName.get(norm(candidate.nameEn)) ?? byName.get(norm(candidate.nameRaw));
      }

      if (match) {
        const allowed = !manager || manager.role !== 'leader' || canManageEmployee(manager, match);
        resolved.set(key, { id: String(match.id), allowed });
        if (allowed && manager && manager.role !== 'leader') {
          // Fill EMPTY informative fields only — never pin/code/role.
          const updates: Record<string, string> = {};
          if (!String(match.phone ?? '').trim() && candidate.phone) updates.phone = candidate.phone;
          if (!String(match.department ?? '').trim() && candidate.department) updates.department = candidate.department;
          if (candidate.jobTitle) {
            if (!String(match.jobTitleAr ?? '').trim() && hasArabic(candidate.jobTitle)) updates.jobTitleAr = candidate.jobTitle;
            if (!String(match.jobTitleEn ?? '').trim() && !hasArabic(candidate.jobTitle)) updates.jobTitleEn = candidate.jobTitle;
          }
          if (Object.keys(updates).length) {
            await db.update(schema.employees).set({ ...updates, updatedAt: new Date().toISOString() } as any).where(eq(schema.employees.id, String(match.id)));
            summary.employeesUpdated++;
          }
        }
        continue;
      }

      if (!options.createMissingEmployees) continue;
      if (!options.defaultPin || options.defaultPin.length < 3) {
        summary.warnings.push(`PIN افتراضي غير صالح — لم يتم إنشاء موظفين جدد. / Invalid default PIN — new employees were not created.`);
        continue;
      }

      let code = String(candidate.code ?? '').trim();
      if (!code) {
        for (let n = 1; n < 100000; n++) {
          const candidateCode = `IMP${String(n).padStart(3, '0')}`;
          if (!usedCodes.has(norm(candidateCode))) { code = candidateCode; break; }
        }
      }
      if (!code) continue;
      if (usedCodes.has(norm(code))) continue; // collision with a concurrently created code
      usedCodes.add(norm(code));

      const baseId = `emp-${code.toLowerCase().replace(/[^a-z0-9_-]/g, '')}` || `emp-imp-${Date.now().toString(36)}`;
      const id = (employees as any[]).some((e) => String(e.id) === baseId) ? `${baseId}-${Math.random().toString(36).slice(2, 6)}` : baseId;
      const nameAr = candidate.nameAr || (hasArabic(candidate.nameRaw) ? candidate.nameRaw : '');
      const nameEn = candidate.nameEn || (!hasArabic(candidate.nameRaw) ? candidate.nameRaw : '') || nameAr;
      const row: Record<string, unknown> = {
        id,
        companyId: 'tech-source',
        code: code.toUpperCase(),
        nameAr: nameAr || nameEn || code,
        nameEn: nameEn || nameAr || code,
        avatar: '',
        email: '',
        phone: candidate.phone ?? '',
        department: candidate.department || 'CX',
        jobTitleAr: hasArabic(candidate.jobTitle) ? candidate.jobTitle : '',
        jobTitleEn: candidate.jobTitle && !hasArabic(candidate.jobTitle) ? candidate.jobTitle : '',
        shiftId: '',
        pin: options.defaultPin,
        role: 'employee',
        joinedDate: cairoToday(),
        status: 'active',
        updatedAt: new Date().toISOString(),
      };
      if (manager && manager.role === 'leader') {
        row.teamLeaderId = manager.id;
        row.teamId = manager.teamId ?? null;
      }
      await db.insert(schema.employees).values(row as any);
      const inserted = { id, code: row.code, nameAr: row.nameAr, nameEn: row.nameEn, phone: row.phone, department: row.department, jobTitleAr: row.jobTitleAr, jobTitleEn: row.jobTitleEn };
      (employees as any[]).push(inserted);
      byCode.set(norm(row.code as string), inserted);
      byName.set(norm(row.nameAr as string), inserted);
      byName.set(norm(row.nameEn as string), inserted);
      resolved.set(key, { id, allowed: true });
      summary.employeesCreated++;
      summary.createdEmployeeCodes.push(String(row.code));
    }
  }

  /* ---- 2) Shifts ---- */
  const shiftCache = new Map<string, { id: string } | null>();
  const matchOrCreateShift = async (nameText: string, start: string, end: string): Promise<{ id: string } | null> => {
    const cacheKey = `${norm(nameText)}|${start}|${end}`;
    if (shiftCache.has(cacheKey)) return shiftCache.get(cacheKey) ?? null;

    let matched: any = undefined;
    const namePart = norm(nameText);
    if (namePart) {
      matched = (shifts as any[]).find((s) => {
        const candidates = [s.name, (s as any).nameAr, (s as any).nameEn].map(norm).filter(Boolean);
        return candidates.some((c) => c === namePart || (namePart.length >= 3 && (c.includes(namePart) || namePart.includes(c))));
      });
    }
    if (!matched && start && end) {
      matched = (shifts as any[]).find((s) =>
        (String(s.startTime).slice(0, 5) === start && String(s.endTime).slice(0, 5) === end) ||
        (String(s.startTime).slice(0, 5) === end && String(s.endTime).slice(0, 5) === start));
    }

    let result: { id: string } | null = matched ? { id: String(matched.id) } : null;
    if (!result && options.autoCreateShifts && start && end) {
      const slug = `${norm(nameText) || 'shift'}-${start}-${end}`.replace(/[^a-z0-9-]/g, '').slice(0, 40);
      const id = `shift-imp-${slug}-${Math.random().toString(36).slice(2, 6)}`;
      const name = nameText.trim() || `Shift ${start}-${end}`;
      const row = {
        id,
        companyId: 'tech-source',
        name,
        startTime: start,
        endTime: end,
        durationMinutes: minutesBetween(start, end),
        breakMinutes: 0,
        gracePeriodMinutes: 10,
        overtimeEnabled: false,
        isOvernight: end <= start,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await db.insert(schema.shifts).values(row as any);
      (shifts as any[]).push(row);
      result = { id };
      summary.shiftsCreated++;
      summary.createdShiftNames.push(name);
    }
    shiftCache.set(cacheKey, result);
    return result;
  };

  /* ---- 3) Schedule assignments ---- */
  const stamp = new Date().toISOString();
  const merged = new Map<string, any>();
  for (const item of existingAssignments) {
    const employeeId = String(item?.employeeId ?? '').trim();
    const date = String(item?.date ?? '').slice(0, 10);
    if (employeeId && /^\d{4}-\d{2}-\d{2}$/.test(date)) merged.set(`${employeeId}|${date}`, item);
  }

  let minDate = '';
  let maxDate = '';
  for (let sheetIdx = 0; sheetIdx < analysis.sheets.length; sheetIdx++) {
    const sheet = analysis.sheets[sheetIdx];
    if (sheet.kind !== 'schedule') continue;
    for (const assignment of sheet.assignments) {
      const employee = resolved.get(`${sheetIdx}:${assignment.employeeIndex}`);
      if (!employee || !employee.allowed) { summary.skippedAssignments++; continue; }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(assignment.date)) { summary.skippedAssignments++; continue; }

      let shiftId = '';
      let isOffDay = false;
      if (assignment.kind === 'off') {
        isOffDay = true;
      } else {
        const shift = await matchOrCreateShift(assignment.nameText, assignment.startTime, assignment.endTime);
        if (!shift) {
          summary.skippedAssignments++;
          if (summary.warnings.length < 12) {
            summary.warnings.push(`شيفت غير معروف: "${assignment.rawText.slice(0, 30)}" — تم تجاهله. / Unrecognized shift "${assignment.rawText.slice(0, 30)}" skipped.`);
          }
          continue;
        }
        shiftId = shift.id;
      }

      const key = `${employee.id}|${assignment.date}`;
      if (!options.overwriteAssignments && merged.has(key)) { summary.skippedAssignments++; continue; }
      // Preserve any existing shadowing (training) window — the dashboard file
      // has no concept of shadowing, so imports must never erase one.
      const previousShadowing = merged.get(key)?.shadowing ?? null;
      merged.set(key, { employeeId: employee.id, date: assignment.date, shiftId, isOffDay, clear: false, shadowing: previousShadowing, assignedBy: manager?.id ?? null, updatedAt: stamp });
      summary.assignmentsApplied++;
      if (isOffDay) summary.offDays++;
      if (!minDate || assignment.date < minDate) minDate = assignment.date;
      if (!maxDate || assignment.date > maxDate) maxDate = assignment.date;
    }
  }
  if (minDate && maxDate) summary.dateRange = [minDate, maxDate];

  if (summary.assignmentsApplied > 0 || summary.employeesCreated > 0 || summary.employeesUpdated > 0) {
    const assignments = Array.from(merged.values()).map((item: any) => ({
      employeeId: item.employeeId,
      date: item.date,
      shiftId: item.shiftId || '',
      isOffDay: Boolean(item.isOffDay),
      shadowing: item.shadowing ?? null,
      assignedBy: item.assignedBy ?? undefined,
      updatedAt: item.updatedAt || stamp,
    }));
    if (settingsRows[0]) {
      await db.update(schema.settings).set({ value: assignments } as any).where(eq(schema.settings.key, 'dailyShiftAssignments'));
    } else {
      await db.insert(schema.settings).values({ key: 'dailyShiftAssignments', value: assignments } as any);
    }
    const stampKey = '__sync_updated_at:dailyShiftAssignments';
    const stampRows = await db.select().from(schema.settings).where(eq(schema.settings.key, stampKey));
    if (stampRows[0]) {
      await db.update(schema.settings).set({ value: stamp } as any).where(eq(schema.settings.key, stampKey));
    } else {
      await db.insert(schema.settings).values({ key: stampKey, value: stamp } as any);
    }
  }

  return summary;
}

/* ------------------------------------------------------------------ */
/* URL auto-sync (download → parse → apply)                            */
/* ------------------------------------------------------------------ */

export async function runUrlSync(url: string, options: ApplyOptions, manager: AuthedEmployee | null, source: 'manual' | 'cron'): Promise<{ ok: true; summary: ApplySummary } | { ok: false; error: string }> {
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(30000),
      headers: { 'User-Agent': 'TechSource-DashboardImport/1.0', Accept: '*/*' },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_FILE_BYTES) throw new Error('FILE_TOO_LARGE');
    if (buffer.byteLength < 4) throw new Error('EMPTY_FILE');

    const XLSX: any = await import('xlsx');
    const workbook = XLSX.read(Buffer.from(buffer), { type: 'buffer' });
    const sheets: DashboardSheetInput[] = workbook.SheetNames.slice(0, MAX_SHEETS).map((name: string) => ({
      name,
      rows: XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: '' }) as unknown[][],
    }));

    const summary = await applyDashboardImport(sheets, options, manager);
    return { ok: true, summary };
  } catch (error: any) {
    return { ok: false, error: String(error?.message || error || 'SYNC_FAILED').slice(0, 200) };
  }
}

async function optionsFromConfig(cfg: DashboardImportConfig): Promise<ApplyOptions> {
  return {
    defaultPin: cfg.defaultPin || '1234',
    createMissingEmployees: true,
    autoCreateShifts: true,
    overwriteAssignments: true,
  };
}

/**
 * Re-apply the stored workbook (the last uploaded dashboard file).
 * Powers both "استيراد الملف المحفوظ الآن" and the daily cron auto-import,
 * so a LOCAL Excel file keeps the site in sync without any manual step:
 * the user re-uploads the file when it changes, the server reapplies it
 * automatically every day in between.
 */
export async function applyStoredFile(cfg: DashboardImportConfig, manager: AuthedEmployee | null, source: 'manual' | 'cron'): Promise<{ ok: true; summary: ApplySummary } | { ok: false; error: string }> {
  try {
    const stored = cfg.storedFile;
    if (!stored?.data) return { ok: false, error: 'NO_STORED_FILE' };
    const buffer = Buffer.from(stored.data, 'base64');
    if (!buffer.byteLength) return { ok: false, error: 'EMPTY_STORED_FILE' };

    const XLSX: any = await import('xlsx');
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    if (!workbook.SheetNames?.length) throw new Error('WORKBOOK_HAS_NO_SHEETS');
    const sheets: DashboardSheetInput[] = workbook.SheetNames.slice(0, MAX_SHEETS).map((name: string) => ({
      name,
      rows: XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: '' }) as unknown[][],
    }));

    const summary = await applyDashboardImport(sheets, await optionsFromConfig(cfg), manager);
    return { ok: true, summary };
  } catch (error: any) {
    return { ok: false, error: String(error?.message || error || 'STORED_FILE_IMPORT_FAILED').slice(0, 200) };
  }
}

/* ------------------------------------------------------------------ */
/* Route registration                                                  */
/* ------------------------------------------------------------------ */

function validateSheetsPayload(sheets: unknown): sheets is DashboardSheetInput[] {
  if (!Array.isArray(sheets) || sheets.length === 0 || sheets.length > MAX_SHEETS) return false;
  return sheets.every((s: any) =>
    typeof s?.name === 'string' && s.name.length <= 200 &&
    Array.isArray(s?.rows) && s.rows.length <= MAX_ROWS_PER_SHEET);
}

export function registerDashboardImport(app: any) {
  // GET /api/dashboard-import — managers read config (PIN masked).
  app.get('/api/dashboard-import', async (req: any, res: any) => {
    try {
      const manager = await requireManager(req, (status: number, body: unknown) => res.status(status).json(body));
      if (!manager) return;
      const cfg = await readConfig();
      return res.json({
        success: true,
        config: {
          sourceUrl: cfg.sourceUrl,
          autoSync: cfg.autoSync,
          hasDefaultPin: Boolean(cfg.defaultPin),
          autoImport: Boolean(cfg.autoImport),
          hasStoredFile: Boolean(cfg.storedFile?.data),
          storedFileName: cfg.storedFile?.name ?? null,
          storedFileSize: cfg.storedFile?.size ?? null,
          storedFileUploadedAt: cfg.storedFile?.uploadedAt ?? null,
          storedFileUploadedBy: cfg.storedFile?.uploadedByName ?? cfg.storedFile?.uploadedBy ?? null,
          lastSyncAt: cfg.lastSyncAt,
          lastSyncStatus: cfg.lastSyncStatus,
          lastSyncError: cfg.lastSyncError,
          lastSyncSummary: cfg.lastSyncSummary,
        },
      });
    } catch (error: any) {
      console.error('[dashboard-import] GET failed:', error?.message || error);
      return res.status(500).json({ success: false, error: 'DASHBOARD_IMPORT_READ_FAILED' });
    }
  });

  // PUT /api/dashboard-import — admins save the auto-sync settings.
  app.put('/api/dashboard-import', async (req: any, res: any) => {
    try {
      const manager = await requireManager(req, (status: number, body: unknown) => res.status(status).json(body));
      if (!manager) return;
      if (!isPlatformAdmin(manager.role)) {
        return res.status(403).json({ success: false, error: 'Only admins can change the dashboard import settings.' });
      }
      // Partial update: only the fields present in the body are changed, so the
      // auto-import toggle can be flipped without re-sending the URL settings.
      const cfgBefore = await readConfig();
      const hasSourceUrl = req.body?.sourceUrl !== undefined;
      const sourceUrl = hasSourceUrl ? String(req.body?.sourceUrl ?? '').trim() : cfgBefore.sourceUrl;
      if (sourceUrl && (!URL_RE.test(sourceUrl) || sourceUrl.length > 1000)) {
        return res.status(400).json({ success: false, error: 'INVALID_URL' });
      }
      const autoSync = req.body?.autoSync === undefined ? cfgBefore.autoSync : Boolean(req.body?.autoSync);
      const autoImport = req.body?.autoImport === undefined ? cfgBefore.autoImport : Boolean(req.body?.autoImport);
      let defaultPin = String(req.body?.defaultPin ?? '').trim();
      if (defaultPin === '***') defaultPin = cfgBefore.defaultPin; // mask round-trip
      else if (defaultPin) defaultPin = defaultPin.slice(0, 64);
      else defaultPin = cfgBefore.defaultPin; // empty = keep existing

      const next: DashboardImportConfig = { ...cfgBefore, sourceUrl, autoSync, autoImport, defaultPin };
      if (req.body?.removeStoredFile === true) next.storedFile = null;
      if (req.body?.resetSyncClock === true) { next.lastSyncAt = null; next.lastSyncStatus = null; next.lastSyncError = null; next.lastSyncSummary = null; }
      await writeConfig(next);
      logActivity({
        actorId: manager.id, actorRole: manager.role, action: 'dashboard.config', entityType: 'dashboard', entityId: 'excel-import',
        entityLabel: [
          autoSync || autoImport ? 'Dashboard import settings updated (auto on' : 'Dashboard import settings updated',
          autoSync ? ' URL' : '', autoImport ? ' file' : '', autoSync || autoImport ? ')' : '',
          req.body?.removeStoredFile === true ? ' — stored file cleared' : '',
        ].join(''),
        companyId: 'tech-source',
      });
      return res.json({
        success: true,
        config: {
          sourceUrl,
          autoSync,
          autoImport,
          hasDefaultPin: Boolean(next.defaultPin),
          hasStoredFile: Boolean(next.storedFile?.data),
        },
      });
    } catch (error: any) {
      console.error('[dashboard-import] PUT failed:', error?.message || error);
      return res.status(500).json({ success: false, error: 'Could not save the dashboard import settings.' });
    }
  });

  // POST /api/dashboard-import/apply — managers apply a parsed workbook
  // (rows already extracted client-side from the uploaded Excel file).
  const applyHandler = async (req: any, res: any) => {
    try {
      const manager = await requireManager(req, (status: number, body: unknown) => res.status(status).json(body));
      if (!manager) return;
      const sheets = req.body?.sheets;
      if (!validateSheetsPayload(sheets)) {
        return res.status(400).json({ success: false, error: 'INVALID_SHEETS_PAYLOAD' });
      }
      const body = req.body?.options ?? {};
      const options: ApplyOptions = {
        defaultPin: String(body.defaultPin ?? '1234').trim().slice(0, 64) || '1234',
        createMissingEmployees: body.createMissingEmployees !== false,
        autoCreateShifts: body.autoCreateShifts !== false,
        overwriteAssignments: body.overwriteAssignments !== false,
      };
      const summary = await applyDashboardImport(sheets, options, manager);
      logActivity({
        actorId: manager.id, actorRole: manager.role, action: 'dashboard.import', entityType: 'dashboard', entityId: 'excel-upload',
        entityLabel: `Excel dashboard import: +${summary.employeesCreated} موظف، ${summary.assignmentsApplied} تعيين`,
        details: {
          source: 'upload',
          sheets: summary.sheetKinds,
          employeesCreated: summary.employeesCreated,
          employeesUpdated: summary.employeesUpdated,
          shiftsCreated: summary.shiftsCreated,
          assignmentsApplied: summary.assignmentsApplied,
          offDays: summary.offDays,
          skipped: summary.skippedAssignments,
          dateRange: summary.dateRange,
        },
        companyId: 'tech-source',
      });
      return res.json({ success: true, summary });
    } catch (error: any) {
      console.error('[dashboard-import] apply failed:', error?.message || error);
      return res.status(500).json({ success: false, error: 'DASHBOARD_IMPORT_APPLY_FAILED' });
    }
  };
  app.post('/api/dashboard-import/apply', applyHandler);
  app.post('/api/dashboard-import-apply', applyHandler); // single-segment alias (Vercel multi-segment routing quirk)

  // POST /api/dashboard-import/url — admins trigger a manual auto-sync run.
  const urlSyncHandler = async (req: any, res: any) => {
    let manager: AuthedEmployee | null = null;
    try {
      manager = await requireManager(req, (status: number, body: unknown) => res.status(status).json(body));
      if (!manager) return;
      if (!isPlatformAdmin(manager.role)) {
        return res.status(403).json({ success: false, error: 'Only admins can run the URL sync.' });
      }
      const cfg = await readConfig();
      const url = String(req.body?.url ?? '').trim() || cfg.sourceUrl;
      if (!url || !URL_RE.test(url) || url.length > 1000) {
        return res.status(400).json({ success: false, error: 'INVALID_URL' });
      }
      const options = await optionsFromConfig(cfg);
      const result = await runUrlSync(url, options, manager, 'manual');
      const next: DashboardImportConfig = { ...cfg, sourceUrl: url, lastSyncAt: new Date().toISOString() };
      let action = 'dashboard.import_failed';
      let entityLabel = '';
      let details: Record<string, unknown>;
      let status = 200;
      let payload: Record<string, unknown>;
      if (result.ok === true) {
        next.lastSyncStatus = 'ok';
        next.lastSyncError = null;
        next.lastSyncSummary = `+${result.summary.employeesCreated} موظف، ${result.summary.assignmentsApplied} تعيين شيفت`;
        action = 'dashboard.import';
        entityLabel = `Excel auto-sync from URL: +${result.summary.employeesCreated} موظف، ${result.summary.assignmentsApplied} تعيين`;
        details = { source: 'url', assignmentsApplied: result.summary.assignmentsApplied, employeesCreated: result.summary.employeesCreated, dateRange: result.summary.dateRange };
        payload = { success: true, summary: result.summary };
      } else {
        next.lastSyncStatus = 'error';
        next.lastSyncError = result.error;
        next.lastSyncSummary = null;
        action = 'dashboard.import_failed';
        entityLabel = `Excel auto-sync failed: ${result.error}`;
        details = { source: 'url', error: result.error };
        status = 502;
        payload = { success: false, error: result.error };
      }
      await writeConfig(next);
      logActivity({
        actorId: manager.id, actorRole: manager.role, action, entityType: 'dashboard', entityId: 'excel-url', entityLabel, details,
        companyId: 'tech-source',
      });
      return res.status(status).json(payload);
    } catch (error: any) {
      console.error('[dashboard-import] url sync failed:', error?.message || error);
      return res.status(500).json({ success: false, error: 'DASHBOARD_IMPORT_URL_FAILED' });
    }
  };
  app.post('/api/dashboard-import/url', urlSyncHandler);
  app.post('/api/dashboard-import-url', urlSyncHandler); // single-segment alias

  // POST /api/dashboard-import/store — managers keep a copy of the uploaded
  // workbook on the server so it can be re-applied automatically (cron) or
  // manually ("استيراد الملف المحفوظ الآن") later. Body: { name, data(base64) }.
  const storeHandler = async (req: any, res: any) => {
    try {
      const manager = await requireManager(req, (status: number, body: unknown) => res.status(status).json(body));
      if (!manager) return;
      const name = String(req.body?.name ?? 'dashboard.xlsx').trim().slice(0, 200) || 'dashboard.xlsx';
      const data = String(req.body?.data ?? '').replace(/\s/g, '');
      if (!data || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) {
        return res.status(400).json({ success: false, error: 'INVALID_FILE_DATA' });
      }
      if (data.length > MAX_STORED_B64_CHARS) {
        return res.status(400).json({ success: false, error: 'STORED_FILE_TOO_LARGE', maxSizeBytes: MAX_STORED_FILE_BYTES });
      }
      const buffer = Buffer.from(data, 'base64');
      if (!buffer.byteLength) return res.status(400).json({ success: false, error: 'EMPTY_FILE' });
      if (buffer.byteLength > MAX_STORED_FILE_BYTES) {
        return res.status(400).json({ success: false, error: 'STORED_FILE_TOO_LARGE', maxSizeBytes: MAX_STORED_FILE_BYTES });
      }

      const cfg = await readConfig();
      // The auth context carries only id/role — resolve the display name for
      // the audit trail from the employees table (cosmetic only).
      let uploaderName = manager.id;
      try {
        const rows = await db.select({ nameAr: schema.employees.nameAr, nameEn: schema.employees.nameEn }).from(schema.employees).where(eq(schema.employees.id, manager.id)).limit(1);
        uploaderName = String(rows[0]?.nameAr || rows[0]?.nameEn || manager.id);
      } catch { /* keep id as fallback */ }
      const next: DashboardImportConfig = {
        ...cfg,
        storedFile: {
          name,
          data,
          size: buffer.byteLength,
          uploadedAt: new Date().toISOString(),
          uploadedBy: manager.id,
          uploadedByName: uploaderName,
        },
      };
      await writeConfig(next);
      logActivity({
        actorId: manager.id, actorRole: manager.role, action: 'dashboard.config', entityType: 'dashboard', entityId: 'excel-stored-file',
        entityLabel: `تم حفظ نسخة ملف الداش بورد للاستيراد التلقائي: ${name} (${Math.round(buffer.byteLength / 1024)} KB)`,
        companyId: 'tech-source',
      });
      return res.json({
        success: true,
        storedFile: { name, size: buffer.byteLength, uploadedAt: next.storedFile!.uploadedAt },
      });
    } catch (error: any) {
      console.error('[dashboard-import] store failed:', error?.message || error);
      return res.status(500).json({ success: false, error: 'DASHBOARD_IMPORT_STORE_FAILED' });
    }
  };
  app.post('/api/dashboard-import/store', storeHandler);
  app.post('/api/dashboard-import-store', storeHandler); // single-segment alias

  // POST /api/dashboard-import/file — managers re-apply the stored workbook
  // right now (same engine as the cron auto-import).
  const fileHandler = async (req: any, res: any) => {
    try {
      const manager = await requireManager(req, (status: number, body: unknown) => res.status(status).json(body));
      if (!manager) return;
      const cfg = await readConfig();
      if (!cfg.storedFile?.data) {
        return res.status(400).json({ success: false, error: 'NO_STORED_FILE' });
      }
      const result = await applyStoredFile(cfg, manager, 'manual');
      const next: DashboardImportConfig = { ...cfg, lastSyncAt: new Date().toISOString() };
      let action = 'dashboard.import_failed';
      let entityLabel = '';
      let details: Record<string, unknown>;
      let status = 200;
      let payload: Record<string, unknown>;
      if (result.ok === true) {
        next.lastSyncStatus = 'ok';
        next.lastSyncError = null;
        next.lastSyncSummary = `+${result.summary.employeesCreated} موظف، ${result.summary.assignmentsApplied} تعيين شيفت`;
        action = 'dashboard.import';
        entityLabel = `استيراد الملف المحفوظ (${cfg.storedFile.name}): +${result.summary.employeesCreated} موظف، ${result.summary.assignmentsApplied} تعيين`;
        details = { source: 'stored-file', assignmentsApplied: result.summary.assignmentsApplied, employeesCreated: result.summary.employeesCreated, dateRange: result.summary.dateRange };
        payload = { success: true, summary: result.summary };
      } else {
        next.lastSyncStatus = 'error';
        next.lastSyncError = result.error;
        next.lastSyncSummary = null;
        action = 'dashboard.import_failed';
        entityLabel = `استيراد الملف المحفوظ فشل: ${result.error}`;
        details = { source: 'stored-file', error: result.error };
        status = 502;
        payload = { success: false, error: result.error };
      }
      await writeConfig(next);
      logActivity({
        actorId: manager.id, actorRole: manager.role, action, entityType: 'dashboard', entityId: 'excel-stored-file', entityLabel, details,
        companyId: 'tech-source',
      });
      return res.status(status).json(payload);
    } catch (error: any) {
      console.error('[dashboard-import] stored-file apply failed:', error?.message || error);
      return res.status(500).json({ success: false, error: 'DASHBOARD_IMPORT_FILE_FAILED' });
    }
  };
  app.post('/api/dashboard-import/file', fileHandler);
  app.post('/api/dashboard-import-file', fileHandler); // single-segment alias

  // POST /api/dashboard-import/power-automate — secure inbound Excel Online webhook.
  // Power Automate sends the workbook bytes as base64. The shared secret is
  // stored only in Vercel environment variables, never in the workbook or UI.
  app.post('/api/dashboard-import/power-automate', async (req: any, res: any) => {
    try {
      const expected = String(process.env.EXCEL_ONLINE_SYNC_SECRET ?? '');
      const authHeader = String(req.headers?.authorization ?? '');
      const supplied = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
      if (!expected || !supplied || supplied.length !== expected.length ||
          !cryptoSafeEqual(supplied, expected)) {
        return res.status(401).json({ success: false, error: 'UNAUTHORIZED' });
      }

      const encoded = String(req.body?.workbookBase64 ?? '');
      if (!encoded || encoded.length > Math.ceil(MAX_FILE_BYTES * 4 / 3) + 16) {
        return res.status(400).json({ success: false, error: 'INVALID_OR_OVERSIZED_WORKBOOK' });
      }
      const buffer = Buffer.from(encoded, 'base64');
      if (buffer.byteLength < 4 || buffer.byteLength > MAX_FILE_BYTES) {
        return res.status(400).json({ success: false, error: 'INVALID_OR_OVERSIZED_WORKBOOK' });
      }

      const XLSX: any = await import('xlsx');
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheets: DashboardSheetInput[] = workbook.SheetNames.slice(0, MAX_SHEETS).map((name: string) => ({
        name,
        rows: XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: '' }) as unknown[][],
      }));
      if (!validateSheetsPayload(sheets)) {
        return res.status(400).json({ success: false, error: 'INVALID_WORKBOOK_SHEETS' });
      }

      // Safe defaults: never create accounts, never change PINs/roles, preserve
      // existing assignments outside dates represented by the workbook.
      const summary = await applyDashboardImport(sheets, {
        defaultPin: '',
        createMissingEmployees: false,
        autoCreateShifts: true,
        overwriteAssignments: true,
      }, null);

      const cfg = await readConfig();
      await writeConfig({
        ...cfg,
        lastSyncAt: new Date().toISOString(),
        lastSyncStatus: 'ok',
        lastSyncError: null,
        lastSyncSummary: `Power Automate: ${summary.assignmentsApplied} schedule assignments; ${summary.skippedAssignments} skipped`,
      });
      logActivity({
        actorId: 'excel-online-sync', actorRole: 'system', action: 'dashboard.import',
        entityType: 'dashboard', entityId: 'excel-online-power-automate',
        entityLabel: `Excel Online import: ${summary.assignmentsApplied} schedule assignments`,
        details: { source: 'power-automate', assignmentsApplied: summary.assignmentsApplied, skipped: summary.skippedAssignments, dateRange: summary.dateRange },
        companyId: 'tech-source',
      });
      return res.json({ success: true, summary });
    } catch (error: any) {
      console.error('[dashboard-import] Power Automate webhook failed:', error?.message || error);
      return res.status(500).json({ success: false, error: 'EXCEL_ONLINE_IMPORT_FAILED' });
    }
  });

  // GET /api/dashboard-import/cron — Vercel Cron entry point (daily).
  // Authorized via CRON_SECRET bearer token, Vercel's x-vercel-cron header,
  // or admin auth headers (local testing).
  const cronHandler = async (req: any, res: any) => {
    try {
      const secret = String(process.env.CRON_SECRET ?? '');
      const bearer = String(req.headers?.authorization ?? '').replace(/^Bearer\s+/i, '').trim();
      const viaSecret = Boolean(secret) && bearer === secret;
      const viaVercel = Boolean(req.headers?.['x-vercel-cron']);
      let admin: AuthedEmployee | null = null;
      if (!viaSecret && !viaVercel) {
        const auth = await authenticateRequest(req);
        if (auth.ok && isPlatformAdmin(auth.employee.role)) admin = auth.employee;
      }
      if (!viaSecret && !viaVercel && !admin) {
        return res.status(401).json({ success: false, error: 'Unauthorized cron invocation.' });
      }

      const cfg = await readConfig();
      // Auto import sources: a hosted file URL (autoSync) takes precedence;
      // otherwise the stored copy of the last uploaded workbook (autoImport).
      const useUrl = Boolean(cfg.autoSync && cfg.sourceUrl);
      const useStored = Boolean(!useUrl && cfg.autoImport && cfg.storedFile?.data);
      if (!useUrl && !useStored) {
        return res.json({ success: true, skipped: true, reason: !cfg.autoSync && !cfg.autoImport ? 'AUTO_SYNC_DISABLED' : 'NO_SOURCE' });
      }
      const last = cfg.lastSyncAt ? Date.parse(cfg.lastSyncAt) : 0;
      if (Number.isFinite(last) && Date.now() - last < AUTO_MIN_INTERVAL_MS) {
        return res.json({ success: true, skipped: true, reason: 'RECENT_SYNC' });
      }

      const options = await optionsFromConfig(cfg);
      const result = useUrl
        ? await runUrlSync(cfg.sourceUrl, options, admin, 'cron')
        : await applyStoredFile(cfg, admin, 'cron');
      const next: DashboardImportConfig = { ...cfg, lastSyncAt: new Date().toISOString() };
      let action = 'dashboard.import_failed';
      let entityLabel = '';
      let details: Record<string, unknown>;
      let status = 200;
      let payload: Record<string, unknown>;
      if (result.ok === true) {
        next.lastSyncStatus = 'ok';
        next.lastSyncError = null;
        next.lastSyncSummary = `+${result.summary.employeesCreated} موظف، ${result.summary.assignmentsApplied} تعيين شيفت`;
        action = 'dashboard.import';
        entityLabel = `مزامنة تلقائية يومية (${useUrl ? 'رابط' : `الملف المحفوظ: ${cfg.storedFile?.name ?? 'dashboard'}`}): +${result.summary.employeesCreated} موظف، ${result.summary.assignmentsApplied} تعيين`;
        details = { source: useUrl ? 'cron-url' : 'cron-stored-file', assignmentsApplied: result.summary.assignmentsApplied, employeesCreated: result.summary.employeesCreated };
        payload = { success: true, summary: result.summary };
      } else {
        next.lastSyncStatus = 'error';
        next.lastSyncError = result.error;
        next.lastSyncSummary = null;
        action = 'dashboard.import_failed';
        entityLabel = `المزامنة التلقائية فشلت: ${result.error}`;
        details = { source: useUrl ? 'cron-url' : 'cron-stored-file', error: result.error };
        status = 502;
        payload = { success: false, error: result.error };
      }
      await writeConfig(next);
      logActivity({
        actorId: admin?.id ?? 'cron', actorRole: admin?.role ?? 'system', action, entityType: 'dashboard', entityId: 'excel-cron', entityLabel, details,
        companyId: 'tech-source',
      });
      return res.status(status).json(payload);
    } catch (error: any) {
      console.error('[dashboard-import] cron failed:', error?.message || error);
      return res.status(500).json({ success: false, error: 'DASHBOARD_IMPORT_CRON_FAILED' });
    }
  };
  app.get('/api/dashboard-import/cron', cronHandler);
  app.get('/api/dashboard-import-cron', cronHandler); // single-segment alias
}

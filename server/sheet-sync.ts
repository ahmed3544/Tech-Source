import { eq } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import * as schema from '../src/db/schema.js';
import { requireManager, isPlatformAdmin } from './auth.js';
import { logActivity } from './activity-logs.js';

/**
 * Google Sheets dashboard sync — "اربط الويب سايت بشيت الداش بورد".
 *
 * The admin pastes a Google Apps Script Web-App URL (deployed from their
 * dashboard spreadsheet, see scripts/google-apps-script.gs) into the website.
 * Every sync then builds a compact tabular payload from the database and POSTs
 * it to that URL; the script writes one tab per dataset (Employees,
 * Attendance, Leaves, Overtime, Schedule, Breaks, BreakRequests, Shifts).
 * Their own dashboard tabs/pivots keep referencing these feed tabs untouched.
 *
 * Privacy: the payload NEVER contains PINs or any credential — employees are
 * projected field by field.
 *
 * Endpoints (registered on the shared Express app, so they work identically on
 * the local server and on the Vercel catch-all):
 *   GET  /api/sheet-sync       — managers: read config + last sync status.
 *   PUT  /api/sheet-sync       — admins: save webhook URL / token / autoSync.
 *   POST /api/sheet-sync/test  — managers: probe a (possibly unsaved) URL.
 *   POST /api/sheet-sync/run   — managers: build payload and push
 *                                ({auto:true} = background trigger, rate
 *                                limited server-side; {force:true} = button).
 */

const CONFIG_KEY = 'sheetSyncConfig';
const HISTORY_DAYS = 92;   // attendance / schedule / breaks window
const REQUEST_DAYS = 180;  // leaves / overtime window
const MAX_ROWS_PER_SHEET = 10000;
const AUTO_MIN_INTERVAL_MS = 60 * 60 * 1000;  // auto runs at most hourly
const AUTO_STALE_MS = 12 * 60 * 60 * 1000;    // ...and only when older than 12h
const URL_RE = /^(https:\/\/\S+|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?\S*)$/i;

export interface SheetSyncConfig {
  webhookUrl: string;
  token: string;
  autoSync: boolean;
  lastSyncAt?: string | null;
  lastSyncStatus?: 'ok' | 'error' | null;
  lastSyncError?: string | null;
  lastSyncCounts?: Record<string, number> | null;
}

async function readConfig(): Promise<SheetSyncConfig> {
  const rows = await db.select().from(schema.settings).where(eq(schema.settings.key, CONFIG_KEY));
  const value = rows[0]?.value;
  const raw = (value && typeof value === 'object' && !Array.isArray(value) ? value : {}) as Partial<SheetSyncConfig>;
  return {
    webhookUrl: String(raw.webhookUrl ?? ''),
    token: String(raw.token ?? ''),
    autoSync: Boolean(raw.autoSync),
    lastSyncAt: raw.lastSyncAt ?? null,
    lastSyncStatus: raw.lastSyncStatus ?? null,
    lastSyncError: raw.lastSyncError ?? null,
    lastSyncCounts: raw.lastSyncCounts ?? null,
  };
}

async function writeConfig(cfg: SheetSyncConfig): Promise<void> {
  await db.insert(schema.settings).values({ key: CONFIG_KEY, value: cfg } as any)
    .onConflictDoUpdate({ target: schema.settings.key, set: { value: cfg } as any });
}

/* ------------------------------------------------------------------ */
/* Payload building                                                    */
/* ------------------------------------------------------------------ */

type Cell = string | number;
type Row = Cell[];

interface SheetBlock { header: string[]; rows: Row[]; }

/** Keep every cell small and sheet-friendly; never throw on weird data. */
function cell(value: unknown): Cell {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? value : '';
  const text = String(value).replace(/\s+/g, ' ').trim();
  return text.length > 400 ? text.slice(0, 400) : text;
}

function employeeName(e: any): string {
  return String(e?.nameAr || e?.nameEn || e?.name || '').trim() || String(e?.code || e?.id || '');
}

/** Raw attendance status → Arabic label (extra column, raw value kept too). */
const STATUS_AR: Record<string, string> = {
  on_time: 'حاضر (في الوقت)',
  in_progress: 'قيد العمل الآن',
  early_leave: 'انصراف مبكر',
  on_leave: 'إجازة',
  absent: 'غائب',
  weekend: 'عطلة أسبوعية',
};

async function buildPayload(): Promise<{ sheets: Record<string, SheetBlock>; counts: Record<string, number>; totalRows: number }> {
  const today = new Date().toISOString().slice(0, 10);
  const cutoffHistory = new Date(Date.now() - HISTORY_DAYS * 86400000).toISOString().slice(0, 10);
  const cutoffRequests = new Date(Date.now() - REQUEST_DAYS * 86400000).toISOString().slice(0, 10);

  const [employees, attendance, leaves, overtime, shifts, settingsRows] = await Promise.all([
    db.select().from(schema.employees),
    db.select().from(schema.attendanceRecords),
    db.select().from(schema.leaveRequests),
    db.select().from(schema.overtimeRequests),
    db.select().from(schema.shifts),
    db.select().from(schema.settings),
  ]);

  // Optional tables (created by ensure-schema; tolerate a not-yet-healed DB).
  let breaks: any[] = [];
  let breakRequests: any[] = [];
  try { breaks = await db.select().from(schema.employeeBreaks); } catch (error: any) { console.warn('[sheet-sync] employee_breaks read failed (ignored):', error?.message || error); }
  try { breakRequests = await db.select().from(schema.breakChangeRequests); } catch (error: any) { console.warn('[sheet-sync] break_change_requests read failed (ignored):', error?.message || error); }

  const byId = new Map<string, any>(employees.map((e: any) => [String(e.id), e]));
  const nameOf = (employeeId: unknown): string => {
    const e = byId.get(String(employeeId ?? ''));
    return e ? employeeName(e) : String(employeeId ?? '');
  };
  const codeOf = (employeeId: unknown): string => {
    const e = byId.get(String(employeeId ?? ''));
    return String(e?.code || employeeId || '');
  };
  const shiftNameById = new Map<string, string>(shifts.map((s: any) => [String(s.id), String(s.name || s.nameAr || s.nameEn || s.id)]));
  const settingsMap = new Map(settingsRows.map((row: any) => [String(row.key), row.value]));
  const assignments = Array.isArray(settingsMap.get('dailyShiftAssignments')) ? settingsMap.get('dailyShiftAssignments') as any[] : [];
  const swapRequests = Array.isArray(settingsMap.get('shiftSwapRequests')) ? settingsMap.get('shiftSwapRequests') as any[] : [];

  const sheets: Record<string, SheetBlock> = {};

  sheets.Employees = {
    header: ['Code', 'Name (AR)', 'Name (EN)', 'Email', 'Phone', 'Department', 'Job Title', 'Role', 'Status', 'Joined Date', 'Team Leader ID', 'Team ID'],
    rows: employees
      .slice(0, MAX_ROWS_PER_SHEET)
      .map((e: any) => [
        cell(e.code), cell(e.nameAr), cell(e.nameEn), cell(e.email), cell(e.phone),
        cell(e.department), cell(e.jobTitleAr || e.jobTitleEn), cell(e.role),
        cell(e.status), cell(e.joinedDate), cell(e.teamLeaderId), cell(e.teamId),
      ]),
  };

  sheets.Attendance = {
    header: ['Date', 'Code', 'Name', 'Check In', 'Check Out', 'Status', 'الحالة', 'Late (min)', 'Early Leave (min)', 'Work Hours', 'Overtime (h)', 'Minus (h)', 'Notes'],
    rows: attendance
      .filter((r: any) => String(r.date ?? '').slice(0, 10) >= cutoffHistory)
      .sort((a: any, b: any) => String(b.date).localeCompare(String(a.date)) || String(a.employeeId).localeCompare(String(b.employeeId)))
      .slice(0, MAX_ROWS_PER_SHEET)
      .map((r: any) => [
        cell(String(r.date).slice(0, 10)), cell(codeOf(r.employeeId)), cell(nameOf(r.employeeId)),
        cell(r.checkIn), cell(r.checkOut), cell(r.status), cell(STATUS_AR[String(r.status || '')] || ''),
        cell(r.lateMinutes ?? 0), cell(r.earlyLeaveMinutes ?? 0), cell(r.workHours ?? 0),
        cell(r.overtimeHours ?? 0), cell(r.minusHours ?? 0), cell(r.notes),
      ]),
  };

  sheets.Leaves = {
    header: ['Type', 'Code', 'Name', 'Start Date', 'End Date', 'Hours', 'Status', 'Reason', 'Reviewed By'],
    rows: leaves
      .filter((r: any) => String(r.startDate ?? '').slice(0, 10) >= cutoffRequests)
      .sort((a: any, b: any) => String(b.startDate).localeCompare(String(a.startDate)))
      .slice(0, MAX_ROWS_PER_SHEET)
      .map((r: any) => [
        cell(r.type), cell(codeOf(r.employeeId)), cell(nameOf(r.employeeId)),
        cell(String(r.startDate ?? '').slice(0, 10)), cell(String(r.endDate ?? '').slice(0, 10)),
        cell(r.hours ?? ''), cell(r.status), cell(r.reason), cell(r.reviewedBy),
      ]),
  };

  sheets.Overtime = {
    header: ['Date', 'Code', 'Name', 'Type', 'Hours', 'Status', 'Reason'],
    rows: overtime
      .filter((r: any) => String(r.date ?? '').slice(0, 10) >= cutoffRequests)
      .sort((a: any, b: any) => String(b.date).localeCompare(String(a.date)))
      .slice(0, MAX_ROWS_PER_SHEET)
      .map((r: any) => [
        cell(String(r.date ?? '').slice(0, 10)), cell(codeOf(r.employeeId)), cell(nameOf(r.employeeId)),
        cell(r.type), cell(Math.round((Number(r.durationSeconds || 0) / 3600) * 100) / 100),
        cell(r.status), cell(r.reason),
      ]),
  };

  sheets.Schedule = {
    header: ['Date', 'Code', 'Name', 'Shift', 'Off Day', 'Assigned By'],
    rows: assignments
      .filter((r: any) => String(r.date ?? '').slice(0, 10) >= cutoffHistory)
      .sort((a: any, b: any) => String(b.date).localeCompare(String(a.date)))
      .slice(0, MAX_ROWS_PER_SHEET)
      .map((r: any) => [
        cell(String(r.date).slice(0, 10)), cell(codeOf(r.employeeId)), cell(nameOf(r.employeeId)),
        cell(shiftNameById.get(String(r.shiftId || '')) || (r.isOffDay ? '' : String(r.shiftId || ''))),
        cell(r.isOffDay ? 'نعم' : ''), cell(r.assignedBy),
      ]),
  };

  sheets.Breaks = {
    header: ['Date', 'Code', 'Name', 'Break', 'Start', 'End', 'Minutes'],
    rows: breaks
      .filter((r: any) => String(r.date ?? '').slice(0, 10) >= cutoffHistory)
      .sort((a: any, b: any) => String(b.date).localeCompare(String(a.date)))
      .slice(0, MAX_ROWS_PER_SHEET)
      .map((r: any) => [
        cell(String(r.date).slice(0, 10)), cell(codeOf(r.employeeId)), cell(nameOf(r.employeeId)),
        cell(r.nameAr || r.nameEn || r.name), cell(r.startTime), cell(r.endTime), cell(r.durationMinutes ?? ''),
      ]),
  };

  sheets.BreakRequests = {
    header: ['Date', 'Code', 'Name', 'Current', 'Proposed', 'Status', 'Reason', 'Reviewed By'],
    rows: breakRequests
      .filter((r: any) => String(r.date ?? '').slice(0, 10) >= cutoffHistory)
      .sort((a: any, b: any) => String(b.date).localeCompare(String(a.date)))
      .slice(0, MAX_ROWS_PER_SHEET)
      .map((r: any) => [
        cell(String(r.date).slice(0, 10)), cell(codeOf(r.employeeId)), cell(nameOf(r.employeeId)),
        cell(r.currentStartTime && r.currentEndTime ? `${r.currentStartTime}-${r.currentEndTime}` : ''),
        cell(`${r.proposedStartTime}-${r.proposedEndTime}`),
        cell(r.status), cell(r.reason), cell(r.reviewedBy),
      ]),
  };

  sheets.Swaps = {
    header: ['Date', 'From', 'To', 'Date Swap', 'Status', 'Updated At'],
    rows: swapRequests
      .slice(0, MAX_ROWS_PER_SHEET)
      .map((r: any) => [
        cell(String(r.createdAt ?? '').slice(0, 10)), cell(nameOf(r.fromEmployeeId ?? r.requesterId)),
        cell(nameOf(r.toEmployeeId ?? r.targetId)), cell(String(r.date ?? r.scheduleDate ?? '')),
        cell(r.status), cell(String(r.updatedAt ?? r.createdAt ?? '').slice(0, 19).replace('T', ' ')),
      ]),
  };

  sheets.Shifts = {
    header: ['Name', 'Start', 'End', 'Duration (min)', 'Break (min)', 'Grace (min)'],
    rows: shifts.slice(0, MAX_ROWS_PER_SHEET).map((s: any) => [
      cell(s.name || s.nameAr || s.nameEn), cell(s.startTime), cell(s.endTime),
      cell(s.durationMinutes ?? ''), cell(s.breakMinutes ?? 0), cell(s.gracePeriodMinutes ?? 0),
    ]),
  };

  const counts: Record<string, number> = {};
  let totalRows = 0;
  for (const [name, block] of Object.entries(sheets)) {
    counts[name] = block.rows.length;
    totalRows += block.rows.length;
  }
  counts.Employees = sheets.Employees.rows.length; // kept for clarity
  void today;
  return { sheets, counts, totalRows };
}

/* ------------------------------------------------------------------ */
/* Routes                                                              */
/* ------------------------------------------------------------------ */

let runningSync: Promise<unknown> | null = null;

export function registerSheetSync(app: any) {
  // GET — config + last sync status (managers; the panel is leader/admin only).
  app.get('/api/sheet-sync', async (req: any, res: any) => {
    try {
      const manager = await requireManager(req, (status: number, body: unknown) => res.status(status).json(body));
      if (!manager) return;
      const cfg = await readConfig();
      res.setHeader('Cache-Control', 'no-store');
      return res.json({
        success: true,
        config: { webhookUrl: cfg.webhookUrl, token: cfg.token, autoSync: cfg.autoSync },
        status: { lastSyncAt: cfg.lastSyncAt, lastSyncStatus: cfg.lastSyncStatus, lastSyncError: cfg.lastSyncError, lastSyncCounts: cfg.lastSyncCounts },
      });
    } catch (error: any) {
      console.error('[sheet-sync] GET failed:', error?.message || error);
      return res.status(500).json({ success: false, error: 'Could not load the Google Sheets settings.' });
    }
  });

  // PUT — save config (platform admins only).
  app.put('/api/sheet-sync', async (req: any, res: any) => {
    try {
      const manager = await requireManager(req, (status: number, body: unknown) => res.status(status).json(body));
      if (!manager) return;
      if (!isPlatformAdmin(manager.role)) {
        return res.status(403).json({ success: false, error: 'Only admins can change the Google Sheets link.' });
      }
      const body = req.body ?? {};
      const webhookUrl = String(body.webhookUrl ?? '').trim();
      const token = String(body.token ?? '').trim().slice(0, 200);
      const autoSync = Boolean(body.autoSync);
      if (webhookUrl && (!URL_RE.test(webhookUrl) || webhookUrl.length > 1000)) {
        return res.status(400).json({ success: false, error: 'INVALID_URL' });
      }
      const cfg = await readConfig();
      const next: SheetSyncConfig = { ...cfg, webhookUrl, token, autoSync };
      await writeConfig(next);
      logActivity({
        actorId: manager.id, actorRole: 'leader', action: 'sheet.config', entityType: 'sheet', entityId: 'google-sheets',
        entityLabel: autoSync ? 'Google Sheets link updated (auto-sync on)' : 'Google Sheets link updated',
        companyId: 'tech-source',
      });
      return res.json({ success: true, config: { webhookUrl, token, autoSync } });
    } catch (error: any) {
      console.error('[sheet-sync] PUT failed:', error?.message || error);
      return res.status(500).json({ success: false, error: 'Could not save the Google Sheets settings.' });
    }
  });

  // POST /api/sheet-sync/test — probe a (possibly unsaved) webhook URL.
  const testHandler = async (req: any, res: any) => {
    try {
      const manager = await requireManager(req, (status: number, body: unknown) => res.status(status).json(body));
      if (!manager) return;
      const url = String(req.body?.webhookUrl ?? '').trim();
      if (!URL_RE.test(url) || url.length > 1000) {
        return res.status(400).json({ success: false, error: 'INVALID_URL' });
      }
      const response = await fetch(url, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(15000) });
      const text = (await response.text()).slice(0, 500);
      let ok = response.ok;
      let service: string | null = null;
      try {
        const parsed = JSON.parse(text);
        if (parsed && parsed.ok === false) ok = false;
        if (parsed?.service) service = String(parsed.service);
      } catch { /* non-JSON response still counts when HTTP ok */ }
      return res.json({ success: ok, httpStatus: response.status, service });
    } catch (error: any) {
      return res.status(502).json({ success: false, error: String(error?.message || error).slice(0, 300) });
    }
  };
  app.post('/api/sheet-sync/test', testHandler);
  app.post('/api/sheet-sync-test', testHandler); // single-segment alias (Vercel multi-segment routing quirk)

  // POST /api/sheet-sync/run — build the payload and push it to the sheet.
  const runHandler = async (req: any, res: any) => {
    const manager = await requireManager(req, (status: number, body: unknown) => res.status(status).json(body));
    if (!manager) return;
    const cfg = await readConfig();
    if (!URL_RE.test(cfg.webhookUrl)) {
      return res.status(400).json({ success: false, error: 'NO_WEBHOOK' });
    }

    // Background triggers are rate limited server-side so a kiosk tab left
    // open can never hammer Google: at most one auto run per hour, and only
    // when the last sync is older than 12h (or it failed before).
    const isAuto = req.body?.auto === true;
    const force = req.body?.force === true;
    if (isAuto && !force) {
      const lastMs = cfg.lastSyncAt ? new Date(cfg.lastSyncAt).getTime() : 0;
      const recent = Date.now() - lastMs < AUTO_MIN_INTERVAL_MS;
      const fresh = Date.now() - lastMs < AUTO_STALE_MS && cfg.lastSyncStatus === 'ok';
      if (recent || fresh) return res.json({ success: true, skipped: true });
    }
    if (runningSync) return res.status(409).json({ success: false, error: 'SYNC_IN_PROGRESS' });

    const run = (async () => {
      try {
        const payload = await buildPayload();
        const response = await fetch(cfg.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: cfg.token, generatedAt: new Date().toISOString(), timeZone: 'Africa/Cairo', source: 'tech-source', sheets: payload.sheets, counts: payload.counts }),
          signal: AbortSignal.timeout(30000),
        });
        const text = (await response.text()).slice(0, 1000);
        let remoteError: string | null = null;
        try {
          const parsed = JSON.parse(text);
          if (parsed && parsed.ok === false) remoteError = String(parsed.error || 'script error');
        } catch { /* non-JSON: judge by HTTP status only */ }
        const ok = response.ok && !remoteError;
        const next: SheetSyncConfig = {
          ...cfg,
          lastSyncAt: new Date().toISOString(),
          lastSyncStatus: ok ? 'ok' : 'error',
          lastSyncError: ok ? null : (remoteError || `HTTP ${response.status}: ${text.slice(0, 200)}`),
          lastSyncCounts: payload.counts,
        };
        await writeConfig(next);
        logActivity({
          actorId: manager.id, actorRole: 'leader',
          action: ok ? 'sheet.sync' : 'sheet.sync_failed',
          entityType: 'sheet', entityId: 'google-sheets',
          entityLabel: `Google Sheets sync — ${payload.totalRows} rows`,
          details: { counts: payload.counts, httpStatus: response.status, ok },
          companyId: 'tech-source',
        });
        if (!ok) return res.status(502).json({ success: false, error: next.lastSyncError });
        return res.json({ success: true, counts: payload.counts, lastSyncAt: next.lastSyncAt });
      } catch (error: any) {
        const message = String(error?.message || error);
        try {
          await writeConfig({ ...cfg, lastSyncAt: new Date().toISOString(), lastSyncStatus: 'error', lastSyncError: message.slice(0, 500), lastSyncCounts: null });
        } catch { /* keep the original failure response path */ }
        logActivity({
          actorId: manager.id, actorRole: 'leader', action: 'sheet.sync_failed',
          entityType: 'sheet', entityId: 'google-sheets', entityLabel: 'Google Sheets sync failed',
          details: message.slice(0, 500), companyId: 'tech-source',
        });
        return res.status(502).json({ success: false, error: message.slice(0, 300) });
      }
    })();

    runningSync = run;
    try {
      return await run;
    } finally {
      runningSync = null;
    }
  };
  app.post('/api/sheet-sync/run', runHandler);
  app.post('/api/sheet-sync-run', runHandler); // single-segment alias
}

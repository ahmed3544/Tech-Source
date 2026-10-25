import crypto from 'crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import * as schema from '../src/db/schema.js';
import {
  authenticateRequest,
  canManageEmployee,
  findEmployeeById,
  isManagerRole,
  requireManager,
  type AuthedEmployee,
} from './auth.js';
import { validateBreakList } from './employee-breaks.js';
import { logActivity } from './activity-logs.js';
import { ensureNotificationStorage, saveOne } from './notification-system-v2.js';
import { publishNotification } from './notification-sse.js';
import { sendPushToEmployee } from './fcm.js';

/**
 * Break change requests API.
 *
 * Employees ask the admin/leader to move one of their breaks on a given date:
 *   POST /api/break-request         { date, currentStartTime?, currentEndTime?, proposedStartTime, proposedEndTime, reason? }
 *   GET  /api/break-requests        ?employeeId=&status=&from=&to=
 *   POST /api/break-request-review  { id, action: 'approve' | 'reject', reviewNotes? }
 *
 * All paths are static and single-segment on purpose: some Vercel deployments
 * never route dynamic multi-segment /api paths to the catch-all function and
 * answer them with the platform 404 "The page could not be found".
 *
 * On approval the server rewrites the employee_breaks rows for that date
 * (replace-all semantics, identical to the manual break editor) and sends the
 * employee a notification over SSE + FCM + the notifications table.
 */

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const toMinutes = (value: string) => {
  const [h, m] = String(value ?? '').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

const clean = (value: unknown) => String(value ?? '').trim();

function serializeRequest(row: any) {
  return {
    id: String(row.id),
    employeeId: String(row.employeeId),
    companyId: row.companyId ?? null,
    date: String(row.date),
    currentStartTime: row.currentStartTime ?? null,
    currentEndTime: row.currentEndTime ?? null,
    proposedStartTime: String(row.proposedStartTime),
    proposedEndTime: String(row.proposedEndTime),
    reason: row.reason ?? null,
    status: String(row.status ?? 'pending'),
    requestedBy: row.requestedBy ?? null,
    reviewedBy: row.reviewedBy ?? null,
    reviewedAt: row.reviewedAt ?? null,
    reviewNotes: row.reviewNotes ?? null,
    createdAt: String(row.createdAt ?? ''),
    updatedAt: String(row.updatedAt ?? ''),
  };
}

/** Same notification pipeline as request-notification-triggers (SSE + FCM + DB). */
async function notify(recipientId: string, type: string, title: string, message: string, relatedEmployeeId: string) {
  const recipient = clean(recipientId);
  if (!recipient) return;
  try {
    await ensureNotificationStorage();
    const related = clean(relatedEmployeeId);
    const id = `n2_${crypto.createHash('sha256').update(`${recipient}|${type}|${related}|${title}|${message}`).digest('hex').slice(0, 40)}`;
    const now = new Date().toISOString();
    const saved = await saveOne({
      id,
      recipientId: recipient,
      type,
      title,
      message,
      relatedEmployeeId: related || null,
      isRead: false,
      createdAt: now,
      updatedAt: now,
    });
    if (saved) publishNotification(saved);
    try { await sendPushToEmployee(recipient, title, message, { type, relatedId: related }); } catch (pushError) {
      console.warn('[BREAK-REQUESTS] push delivery failed:', pushError);
    }
  } catch (error) {
    console.error('[BREAK-REQUESTS] notification persistence failed:', error);
  }
}

async function leaderRecipients(employeeId: string): Promise<string[]> {
  const employees = (await db.select().from(schema.employees)) as any[];
  const self = employees.find((e) => clean(e.id) === clean(employeeId));
  const leaderId = clean(self?.teamLeaderId);
  if (leaderId) return [leaderId];
  return employees
    .filter((e) => ['leader', 'admin', 'company_admin', 'platform_admin'].includes(clean(e.role)))
    .map((e) => clean(e.id))
    .filter(Boolean);
}

/** Effective planned breaks for one employee+date: own rows first, then the shift-level fallback. */
async function effectiveBreaksFor(employeeId: string, date: string): Promise<Array<{ name?: string; nameAr?: string; nameEn?: string; startTime: string; endTime: string; durationMinutes?: number }>> {
  const ownRows = await db
    .select()
    .from(schema.employeeBreaks)
    .where(and(eq(schema.employeeBreaks.employeeId, employeeId), eq(schema.employeeBreaks.date, date)));
  if (ownRows.length) {
    return ownRows
      .map((row: any) => ({
        name: row.name ?? undefined,
        nameAr: row.nameAr ?? undefined,
        nameEn: row.nameEn ?? undefined,
        startTime: String(row.startTime),
        endTime: String(row.endTime),
        durationMinutes: Number(row.durationMinutes ?? 0) || undefined,
      }))
      .sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime));
  }

  // Shift-level fallback: assignment shift wins, then the employee's default shift.
  const settingsRows = await db.select().from(schema.settings).where(eq(schema.settings.key, 'dailyShiftAssignments'));
  const assignments: any[] = Array.isArray(settingsRows[0]?.value) ? settingsRows[0].value : [];
  const assignment = assignments.find((a) => clean(a?.employeeId) === clean(employeeId) && String(a?.date ?? '').slice(0, 10) === date);
  const assignmentShiftId = clean(assignment?.shiftId);

  let shift: any = null;
  if (assignmentShiftId) {
    const shiftRows = await db.select().from(schema.shifts).where(eq(schema.shifts.id, assignmentShiftId));
    shift = shiftRows[0] ?? null;
  }
  if (!shift) {
    const employeeRows = await db.select().from(schema.employees).where(eq(schema.employees.id, employeeId));
    const defaultShiftId = clean(employeeRows[0]?.shiftId);
    if (defaultShiftId) {
      const shiftRows = await db.select().from(schema.shifts).where(eq(schema.shifts.id, defaultShiftId));
      shift = shiftRows[0] ?? null;
    }
  }
  if (!shift) return [];

  const breakMapRows = await db.select().from(schema.settings).where(eq(schema.settings.key, 'shiftBreaks'));
  const breakMap: any = breakMapRows[0]?.value && typeof breakMapRows[0].value === 'object' && !Array.isArray(breakMapRows[0].value) ? breakMapRows[0].value : {};
  const raw = Array.isArray((shift as any).breaks) ? (shift as any).breaks : (Array.isArray(breakMap[String(shift.id)]) ? breakMap[String(shift.id)] : []);
  return raw
    .filter((item: any) => item && item.startTime && item.endTime)
    .map((item: any) => ({
      name: item.name ?? item.nameAr ?? item.nameEn ?? undefined,
      nameAr: item.nameAr ?? undefined,
      nameEn: item.nameEn ?? undefined,
      startTime: String(item.startTime),
      endTime: String(item.endTime),
      durationMinutes: Number(item.durationMinutes ?? 0) || toMinutes(String(item.endTime)) - toMinutes(String(item.startTime)),
    }))
    .sort((a: any, b: any) => toMinutes(a.startTime) - toMinutes(b.startTime));
}

async function writeBreaksForDate(employeeId: string, companyId: string | null, date: string, breaks: Array<Record<string, any>>) {
  await db.delete(schema.employeeBreaks).where(and(eq(schema.employeeBreaks.employeeId, employeeId), eq(schema.employeeBreaks.date, date)));
  if (!breaks.length) return;
  const now = new Date().toISOString();
  await db.insert(schema.employeeBreaks).values(breaks.map((b) => ({
    id: `brk-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    companyId: companyId ?? 'tech-source',
    employeeId,
    date,
    name: b.name ?? null,
    nameAr: b.nameAr ?? null,
    nameEn: b.nameEn ?? null,
    startTime: b.startTime,
    endTime: b.endTime,
    durationMinutes: toMinutes(b.endTime) - toMinutes(b.startTime),
    createdAt: now,
    updatedAt: now,
  } as any)));
}

export function registerBreakRequests(app: any) {
  // List requests. Employees see only their own; leaders their team; admins all.
  app.get('/api/break-requests', async (req: any, res: any) => {
    try {
      const auth = await authenticateRequest(req);
      if (auth.ok === false) return res.status(auth.status).json({ success: false, error: auth.error });
      const viewer: AuthedEmployee = auth.employee;

      const employeeIdFilter = clean(req.query?.employeeId);
      const statusFilter = clean(req.query?.status).toLowerCase();
      const from = clean(req.query?.from);
      const to = clean(req.query?.to);

      let employeeIds: string[] | null = null; // null = no restriction (admin)
      if (employeeIdFilter) {
        const target = await findEmployeeById(employeeIdFilter);
        if (!target) return res.status(404).json({ success: false, error: 'Employee not found.' });
        const allowed = clean(target.id) === viewer.id || canManageEmployee(viewer, target);
        if (!allowed) return res.status(403).json({ success: false, error: 'You can only view your own break requests.' });
        employeeIds = [clean(target.id)];
      } else if (!isManagerRole(viewer.role)) {
        employeeIds = [viewer.id];
      } else if (viewer.role === 'leader') {
        const all = (await db.select().from(schema.employees)) as any[];
        employeeIds = all.filter((e) => canManageEmployee(viewer, e)).map((e) => clean(e.id));
      }

      // Filter in memory — the requests table stays small and this avoids a
      // drizzle inArray() edge case with empty id lists.
      const rowsRaw = (await db.select().from(schema.breakChangeRequests)) as any[];
      let rows = rowsRaw;
      if (employeeIds) rows = rows.filter((r) => employeeIds!.includes(clean(r.employeeId)));
      if (statusFilter && ['pending', 'approved', 'rejected'].includes(statusFilter)) {
        rows = rows.filter((r) => clean(r.status).toLowerCase() === statusFilter);
      }
      if (DATE_RE.test(from)) rows = rows.filter((r) => String(r.date) >= from);
      if (DATE_RE.test(to)) rows = rows.filter((r) => String(r.date) <= to);
      rows.sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));

      res.setHeader('Cache-Control', 'no-store');
      return res.json({ success: true, requests: rows.map(serializeRequest) });
    } catch (error: any) {
      console.error('[BREAK-REQUESTS] GET failed:', error?.message || error);
      return res.status(500).json({ success: false, error: 'Could not load break change requests.' });
    }
  });

  // Employee submits a break change request for themselves.
  app.post('/api/break-request', async (req: any, res: any) => {
    try {
      const auth = await authenticateRequest(req);
      if (auth.ok === false) return res.status(auth.status).json({ success: false, error: auth.error });
      const requester: AuthedEmployee = auth.employee;

      const body = req.body ?? {};
      const employeeId = clean(body.employeeId) || requester.id;
      const date = clean(body.date);
      const currentStart = clean(body.currentStartTime);
      const currentEnd = clean(body.currentEndTime);
      const proposedStart = clean(body.proposedStartTime);
      const proposedEnd = clean(body.proposedEndTime);
      const reason = clean(body.reason);

      if (employeeId !== requester.id) {
        const target = await findEmployeeById(employeeId);
        if (!target) return res.status(404).json({ success: false, error: 'Employee not found.' });
        if (!canManageEmployee(requester, target)) {
          return res.status(403).json({ success: false, error: 'You can only request break changes for yourself.' });
        }
      }
      if (!DATE_RE.test(date)) return res.status(400).json({ success: false, error: 'A valid date (YYYY-MM-DD) is required.' });
      if (!TIME_RE.test(proposedStart) || !TIME_RE.test(proposedEnd)) {
        return res.status(400).json({ success: false, error: 'Proposed break times are required in HH:mm format.' });
      }
      if (toMinutes(proposedEnd) <= toMinutes(proposedStart)) {
        return res.status(400).json({ success: false, error: 'The proposed break end must be after its start.' });
      }
      if (currentStart && !TIME_RE.test(currentStart)) return res.status(400).json({ success: false, error: 'Current break start must be HH:mm.' });
      if (currentEnd && !TIME_RE.test(currentEnd)) return res.status(400).json({ success: false, error: 'Current break end must be HH:mm.' });
      if (currentStart && currentEnd && toMinutes(currentEnd) <= toMinutes(currentStart)) {
        return res.status(400).json({ success: false, error: 'The current break end must be after its start.' });
      }
      if (currentStart && currentEnd && toMinutes(currentStart) === toMinutes(proposedStart) && toMinutes(currentEnd) === toMinutes(proposedEnd)) {
        return res.status(400).json({ success: false, error: 'The proposed break is identical to the current break.' });
      }
      if (reason.length > 300) return res.status(400).json({ success: false, error: 'The reason must be 300 characters or fewer.' });

      const duplicate = (await db.select().from(schema.breakChangeRequests)
        .where(and(eq(schema.breakChangeRequests.employeeId, employeeId), eq(schema.breakChangeRequests.date, date)))) as any[];
      if (duplicate.some((r) => clean(r.status).toLowerCase() === 'pending')) {
        return res.status(409).json({ success: false, error: 'There is already a pending break change request for this date.' });
      }

      const now = new Date().toISOString();
      const row = {
        id: `bcr-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        companyId: 'tech-source',
        employeeId,
        date,
        currentStartTime: currentStart || null,
        currentEndTime: currentEnd || null,
        proposedStartTime: proposedStart,
        proposedEndTime: proposedEnd,
        reason: reason || null,
        status: 'pending',
        requestedBy: requester.id,
        createdAt: now,
        updatedAt: now,
      };
      await db.insert(schema.breakChangeRequests).values(row as any);

      const employee = await findEmployeeById(employeeId);
      const employeeName = clean(employee?.nameAr) || clean(employee?.nameEn) || employeeId;
      const currentLabel = currentStart && currentEnd ? `${currentStart}-${currentEnd}` : 'لا يوجد بريك';

      logActivity({
        actorId: requester.id,
        actorName: (requester as any).nameAr || (requester as any).nameEn || requester.id,
        actorRole: isManagerRole(requester.role) ? 'leader' : 'employee',
        action: 'break_request.submit',
        entityType: 'break_request',
        entityId: String(row.id),
        entityLabel: `${clean(employee?.code) || employeeId} — ${employeeName} — ${date}`,
        details: { from: currentLabel, to: `${proposedStart}-${proposedEnd}`, reason: reason || null },
      });

      const recipients = await leaderRecipients(employeeId);
      for (const recipientId of recipients) {
        if (recipientId === requester.id) continue;
        await notify(
          recipientId,
          'break_request_requested',
          'طلب تغيير بريك جديد',
          `${employeeName} يطلب تغيير البريك ليوم ${date} من ${currentLabel} إلى ${proposedStart}-${proposedEnd}${reason ? `. السبب: ${reason}` : ''}. راجع الطلب من لوحة طلبات الجدول.`,
          employeeId,
        );
      }

      res.setHeader('Cache-Control', 'no-store');
      return res.json({ success: true, request: serializeRequest(row) });
    } catch (error: any) {
      console.error('[BREAK-REQUESTS] POST failed:', error?.message || error);
      return res.status(500).json({ success: false, error: 'Could not submit the break change request.' });
    }
  });

  // Admin/leader reviews a request. Approval rewrites that day's breaks.
  app.post('/api/break-request-review', async (req: any, res: any) => {
    try {
      const manager = await requireManager(req, (status, body) => res.status(status).json(body));
      if (!manager) return;

      const id = clean(req.body?.id);
      const action = clean(req.body?.action).toLowerCase();
      const reviewNotes = clean(req.body?.reviewNotes);
      if (!id) return res.status(400).json({ success: false, error: 'Request id is required.' });
      if (!['approve', 'reject'].includes(action)) return res.status(400).json({ success: false, error: "action must be 'approve' or 'reject'." });

      const rows = (await db.select().from(schema.breakChangeRequests).where(eq(schema.breakChangeRequests.id, id))) as any[];
      const request = rows[0];
      if (!request) return res.status(404).json({ success: false, error: 'Break change request not found.' });
      if (clean(request.status).toLowerCase() !== 'pending') {
        return res.status(409).json({ success: false, error: 'This request was already reviewed.' });
      }
      const target = await findEmployeeById(String(request.employeeId));
      if (!target) return res.status(404).json({ success: false, error: 'Employee not found.' });
      if (!canManageEmployee(manager, target)) {
        return res.status(403).json({ success: false, error: 'You can only review break change requests for your own team.' });
      }

      const now = new Date().toISOString();
      const approved = action === 'approve';
      let savedBreaks: any[] | null = null;

      if (approved) {
        const date = String(request.date);
        const effective = await effectiveBreaksFor(String(request.employeeId), date);
        const currentStart = request.currentStartTime ? String(request.currentStartTime) : '';
        const currentEnd = request.currentEndTime ? String(request.currentEndTime) : '';
        const next: Array<Record<string, any>> = effective.map((b) => ({ ...b }));
        const matchIndex = currentStart && currentEnd
          ? next.findIndex((b) => toMinutes(b.startTime) === toMinutes(currentStart) && toMinutes(b.endTime) === toMinutes(currentEnd))
          : -1;
        const proposed = {
          startTime: String(request.proposedStartTime),
          endTime: String(request.proposedEndTime),
          name: (matchIndex >= 0 ? next[matchIndex].name : undefined),
          nameAr: (matchIndex >= 0 ? next[matchIndex].nameAr : undefined),
          nameEn: (matchIndex >= 0 ? next[matchIndex].nameEn : undefined),
        };
        if (matchIndex >= 0) next[matchIndex] = { ...next[matchIndex], ...proposed };
        else next.push(proposed);
        next.sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime));

        const [validated, validationError] = validateBreakList(next);
        if (validationError) {
          return res.status(400).json({ success: false, error: `Approval rejected by break validation: ${validationError}` });
        }
        await writeBreaksForDate(String(request.employeeId), target.companyId ?? null, date, validated);
        savedBreaks = validated;
      }

      const updated = {
        ...serializeRequest(request),
        status: approved ? 'approved' : 'rejected',
        reviewedBy: manager.id,
        reviewedAt: now,
        reviewNotes: reviewNotes || null,
        updatedAt: now,
      };
      await db.update(schema.breakChangeRequests).set({
        status: updated.status,
        reviewedBy: updated.reviewedBy,
        reviewedAt: updated.reviewedAt,
        reviewNotes: updated.reviewNotes,
        updatedAt: updated.updatedAt,
      } as any).where(eq(schema.breakChangeRequests.id, id));

      const proposedLabel = `${request.proposedStartTime}-${request.proposedEndTime}`;

      logActivity({
        actorId: manager.id,
        actorName: (manager as any).nameAr || (manager as any).nameEn || manager.id,
        actorRole: manager.role,
        action: approved ? 'break_request.approve' : 'break_request.reject',
        entityType: 'break_request',
        entityId: String(id),
        entityLabel: `${clean(target.code) || String(request.employeeId)} — ${clean(target.nameAr) || clean(target.nameEn) || String(request.employeeId)} — ${String(request.date)}`,
        details: { proposed: proposedLabel, reviewNotes: reviewNotes || null },
      });

      if (approved) {
        await notify(
          String(request.employeeId),
          'break_request_approved',
          'تمت الموافقة على تغيير البريك',
          `تم اعتماد تغيير البريك ليوم ${request.date}: البريك الآن ${proposedLabel}. تم تحديث جدولك.`,
          String(request.employeeId),
        );
      } else {
        await notify(
          String(request.employeeId),
          'break_request_rejected',
          'تم رفض طلب تغيير البريك',
          `تم رفض طلب تغيير البريك ليوم ${request.date} (المقترح ${proposedLabel}).${reviewNotes ? ` السبب: ${reviewNotes}` : ''}`,
          String(request.employeeId),
        );
      }
      res.setHeader('Cache-Control', 'no-store');
      return res.json({ success: true, request: updated, ...(savedBreaks ? { breaks: savedBreaks } : {}) });
    } catch (error: any) {
      console.error('[BREAK-REQUESTS] review failed:', error?.message || error);
      return res.status(500).json({ success: false, error: 'Could not review the break change request.' });
    }
  });
}

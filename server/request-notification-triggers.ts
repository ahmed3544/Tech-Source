import crypto from 'crypto';
import { eq } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import * as schema from '../src/db/schema.js';
import { sendPushToEmployee } from './fcm.js';

const hasDatabase = () => Boolean(process.env.DATABASE_URL || process.env.SUPABASE_DB_URL);
const clean = (v:any) => String(v ?? '').trim();
const hashId = (recipientId:string, type:string, relatedId:string) => `n2_${crypto.createHash('sha256').update(`${recipientId}|${type}|${relatedId}`).digest('hex').slice(0,40)}`;

async function insertNotification(recipientId:string, type:string, title:string, message:string, relatedEmployeeId:string, relatedLeaveId?:string, relatedOvertimeId?:string, relatedShiftSwapId?:string) {
  if (!recipientId) return;
  const relatedId = clean(relatedLeaveId || relatedOvertimeId || relatedShiftSwapId);
  const id = hashId(recipientId, type, relatedId || `${title}|${message}`);
  const now = new Date().toISOString();
  const result = await db.insert(schema.notifications).values({
    id,
    recipientId,
    type,
    title,
    message,
    relatedEmployeeId: relatedEmployeeId || null,
    relatedLeaveId: relatedLeaveId || null,
    relatedOvertimeId: relatedOvertimeId || null,
    relatedShiftSwapId: relatedShiftSwapId || null,
    isRead: false,
    createdAt: now,
    updatedAt: now,
  } as any).onConflictDoNothing({ target: schema.notifications.id });
  const inserted = Number((result as any)?.rowCount ?? 0) > 0;
  if (!inserted) return;
  try { await sendPushToEmployee(recipientId, title, message, { type, relatedId }); } catch (e) { console.warn('[FCM] request notification push failed', e); }
}

async function emitForSync(body:any) {
  if (!hasDatabase()) return;
  const requestedLeaves = Array.isArray(body?.leaveRequests) ? body.leaveRequests : [];
  const requestedOvertimes = Array.isArray(body?.overtimeRequests) ? body.overtimeRequests : [];
  const requestedSwaps = Array.isArray(body?.shiftSwapRequests) ? body.shiftSwapRequests : [];
  if (!requestedLeaves.length && !requestedOvertimes.length && !requestedSwaps.length) return;

  const employees = await db.select().from(schema.employees);
  const leaders = employees.filter((e:any) => e.role === 'leader' || e.role === 'admin').map((e:any) => String(e.id));
  const employeeName = (id:string) => {
    const e:any = employees.find((x:any) => String(x.id) === id);
    return clean(e?.nameAr) || clean(e?.nameEn) || id;
  };

  // Always read the record back from the database after /api/sync has completed.
  // This prevents a stale device snapshot from creating a notification for a
  // mutation that the server rejected because its updatedAt was older.
  for (const requested of requestedLeaves) {
    const id = clean(requested?.id);
    if (!id) continue;
    const rows = await db.select().from(schema.leaveRequests).where(eq(schema.leaveRequests.id, id));
    const r:any = rows[0];
    if (!r) continue;
    const employeeId = clean(r.employeeId), status = clean(r.status).toLowerCase();
    if (!employeeId) continue;
    const start = clean(r.startDate), end = clean(r.endDate), kind = clean(r.type) || 'leave';
    if (status === 'pending') {
      for (const recipientId of leaders) {
        if (recipientId === employeeId) continue;
        await insertNotification(recipientId, 'leave_requested', 'طلب إجازة جديد', `${employeeName(employeeId)} أرسل طلب ${kind} من ${start} إلى ${end}.`, employeeId, id);
      }
    } else if (status === 'approved' || status === 'rejected') {
      const approved = status === 'approved';
      await insertNotification(employeeId, approved ? 'leave_approved' : 'leave_rejected', approved ? 'تم اعتماد طلب الإجازة' : 'تم رفض طلب الإجازة', approved ? `تم اعتماد طلب ${kind} من ${start} إلى ${end}.` : `تم رفض طلب ${kind} من ${start} إلى ${end}.${clean(r.reviewNotes) ? ` السبب: ${clean(r.reviewNotes)}` : ''}`, employeeId, id);
    }
  }

  for (const requested of requestedOvertimes) {
    const id = clean(requested?.id);
    if (!id) continue;
    const rows = await db.select().from(schema.overtimeRequests).where(eq(schema.overtimeRequests.id, id));
    const r:any = rows[0];
    if (!r) continue;
    const employeeId = clean(r.employeeId), status = clean(r.status).toLowerCase();
    if (!employeeId) continue;
    const date = clean(r.date), seconds = Number(r.durationSeconds || 0);
    const duration = Number.isFinite(seconds) && seconds > 0 ? `${Math.round(seconds/3600*100)/100} ساعة` : '';
    if (status === 'pending') {
      for (const recipientId of leaders) {
        if (recipientId === employeeId) continue;
        await insertNotification(recipientId, 'overtime_requested', 'طلب وقت إضافي جديد', `${employeeName(employeeId)} أرسل طلب وقت إضافي ليوم ${date}${duration ? ` لمدة ${duration}` : ''}.`, employeeId, undefined, id);
      }
    } else if (status === 'approved' || status === 'rejected') {
      const approved = status === 'approved';
      await insertNotification(employeeId, approved ? 'overtime_approved' : 'overtime_rejected', approved ? 'تم اعتماد الوقت الإضافي' : 'تم رفض الوقت الإضافي', approved ? `تم اعتماد طلب الوقت الإضافي ليوم ${date}${duration ? ` لمدة ${duration}` : ''}.` : `تم رفض طلب الوقت الإضافي ليوم ${date}.${clean(r.reviewNotes) ? ` السبب: ${clean(r.reviewNotes)}` : ''}`, employeeId, undefined, id);
    }
  }

  // Shift swaps are persisted in settings by the device-sync layer.
  if (requestedSwaps.length) {
    const settings = await db.select().from(schema.settings).where(eq(schema.settings.key, 'shiftSwapRequests'));
    const persistedSwaps:any[] = Array.isArray(settings[0]?.value) ? settings[0].value : [];
    for (const requested of requestedSwaps) {
      const id = clean(requested?.id);
      const r:any = persistedSwaps.find((x:any) => clean(x?.id) === id);
      if (!r) continue;
      const requesterId = clean(r.requesterId), targetId = clean(r.targetEmployeeId), status = clean(r.status).toLowerCase();
      if (!requesterId || !targetId) continue;
      const date = clean(r.date);
      if (status === 'awaiting_target') {
        await insertNotification(targetId, 'shift_swap_requested', 'طلب تبديل شفت جديد', `${employeeName(requesterId)} أرسل لك طلب تبديل شفت ليوم ${date}. راجع الطلب واضغط موافقة أو رفض.`, requesterId, undefined, undefined, id);
      } else if (status === 'pending') {
        const leaderId = clean(employees.find((e:any) => String(e.id) === requesterId)?.teamLeaderId);
        const recipients = leaderId ? [leaderId] : leaders;
        for (const recipientId of recipients) {
          if (recipientId === requesterId || recipientId === targetId) continue;
          await insertNotification(recipientId, 'shift_swap_accepted', 'تمت الموافقة على Swap', `${employeeName(targetId)} وافق على تبديل الشفت مع ${employeeName(requesterId)} ليوم ${date}. أصبح الطلب جاهزًا لمراجعة الليدر.`, requesterId, undefined, undefined, id);
        }
      } else if (status === 'approved') {
        await insertNotification(requesterId, 'shift_changed', 'تم اعتماد تبديل الشفت', `تم اعتماد تبديل الشفت مع ${employeeName(targetId)} ليوم ${date}.`, requesterId, undefined, undefined, id);
        await insertNotification(targetId, 'shift_changed', 'تم اعتماد تبديل الشفت', `تم اعتماد تبديل الشفت مع ${employeeName(requesterId)} ليوم ${date}.`, targetId, undefined, undefined, id);
      } else if (status === 'rejected') {
        await insertNotification(requesterId, 'shift_swap_rejected', 'تم رفض طلب تبديل الشفت', `تم رفض طلب تبديل الشفت ليوم ${date}.`, requesterId, undefined, undefined, id);
        await insertNotification(targetId, 'shift_swap_rejected', 'تم رفض طلب تبديل الشفت', `تم رفض طلب تبديل الشفت ليوم ${date}.`, targetId, undefined, undefined, id);
      }
    }
  }
}

export function registerRequestNotificationTriggers(app:any) {
  app.use((req:any, res:any, next:any) => {
    if (req.method !== 'POST' || !['/api/sync','/sync'].includes(String(req.path || '').replace(/\/+$/,''))) return next();
    const body = req.body || {};
    res.on('finish', () => {
      void emitForSync(body).catch((e) => console.error('[request-notification-triggers]', e));
    });
    next();
  });
}

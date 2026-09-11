import crypto from 'crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import * as schema from '../src/db/schema.js';
import { sendPushToEmployee } from './fcm.js';

const hasDatabase = () => Boolean(process.env.DATABASE_URL || process.env.SUPABASE_DB_URL);
const clean = (v:any) => String(v ?? '').trim();
const hashId = (recipientId:string, type:string, relatedId:string) => `n2_${crypto.createHash('sha256').update(`${recipientId}|${type}|${relatedId}`).digest('hex').slice(0,40)}`;

async function insertNotification(recipientId:string, type:string, title:string, message:string, relatedEmployeeId:string, relatedLeaveId?:string, relatedOvertimeId?:string) {
  if (!recipientId) return;
  const relatedId = clean(relatedLeaveId || relatedOvertimeId);
  const id = hashId(recipientId, type, relatedId || `${title}|${message}`);
  const existing = await db.select({ id: schema.notifications.id }).from(schema.notifications).where(eq(schema.notifications.id,id));
  if (existing[0]) return;
  const now = new Date().toISOString();
  await db.insert(schema.notifications).values({
    id,
    recipientId,
    type,
    title,
    message,
    relatedEmployeeId: relatedEmployeeId || null,
    relatedLeaveId: relatedLeaveId || null,
    relatedOvertimeId: relatedOvertimeId || null,
    isRead: false,
    createdAt: now,
    updatedAt: now,
  } as any);
  try { await sendPushToEmployee(recipientId, title, message, { type, relatedId }); } catch (e) { console.warn('[FCM] request notification push failed', e); }
}

async function emitForSync(body:any) {
  if (!hasDatabase()) return;
  const leaves = Array.isArray(body?.leaveRequests) ? body.leaveRequests : [];
  const overtimes = Array.isArray(body?.overtimeRequests) ? body.overtimeRequests : [];
  if (!leaves.length && !overtimes.length) return;

  const employees = await db.select().from(schema.employees);
  const leaders = employees.filter((e:any) => e.role === 'leader' || e.role === 'admin').map((e:any) => String(e.id));

  for (const r of leaves) {
    const id = clean(r?.id), employeeId = clean(r?.employeeId), status = clean(r?.status).toLowerCase();
    if (!id || !employeeId) continue;
    const start = clean(r?.startDate), end = clean(r?.endDate), kind = clean(r?.type) || 'leave';
    if (status === 'pending') {
      for (const recipientId of leaders) {
        if (recipientId === employeeId) continue;
        await insertNotification(recipientId, 'leave_requested', 'طلب إجازة جديد', `${employeeId} أرسل طلب ${kind} من ${start} إلى ${end}.`, employeeId, id);
      }
    } else if (status === 'approved' || status === 'rejected') {
      const approved = status === 'approved';
      await insertNotification(employeeId, approved ? 'leave_approved' : 'leave_rejected', approved ? 'تم اعتماد طلب الإجازة' : 'تم رفض طلب الإجازة', approved ? `تم اعتماد طلب ${kind} من ${start} إلى ${end}.` : `تم رفض طلب ${kind} من ${start} إلى ${end}.${clean(r?.reviewNotes) ? ` السبب: ${clean(r.reviewNotes)}` : ''}`, employeeId, id);
    }
  }

  for (const r of overtimes) {
    const id = clean(r?.id), employeeId = clean(r?.employeeId), status = clean(r?.status).toLowerCase();
    if (!id || !employeeId) continue;
    const date = clean(r?.date), duration = clean(r?.durationSeconds) ? `${Math.round(Number(r.durationSeconds)/3600*100)/100} ساعة` : '';
    if (status === 'pending') {
      for (const recipientId of leaders) {
        if (recipientId === employeeId) continue;
        await insertNotification(recipientId, 'overtime_requested', 'طلب وقت إضافي جديد', `${employeeId} أرسل طلب وقت إضافي ليوم ${date}${duration ? ` لمدة ${duration}` : ''}.`, employeeId, undefined, id);
      }
    } else if (status === 'approved' || status === 'rejected') {
      const approved = status === 'approved';
      await insertNotification(employeeId, approved ? 'overtime_approved' : 'overtime_rejected', approved ? 'تم اعتماد الوقت الإضافي' : 'تم رفض الوقت الإضافي', approved ? `تم اعتماد طلب الوقت الإضافي ليوم ${date}${duration ? ` لمدة ${duration}` : ''}.` : `تم رفض طلب الوقت الإضافي ليوم ${date}.${clean(r?.reviewNotes) ? ` السبب: ${clean(r.reviewNotes)}` : ''}`, employeeId, undefined, id);
    }
  }
}

export function registerRequestNotificationTriggers(app:any) {
  app.use((req:any, res:any, next:any) => {
    if (req.method !== 'POST' || !['/api/sync','/sync'].includes(String(req.path || '').replace(/\/+$/,''))) return next();
    const body = req.body || {};
    const originalJson = res.json.bind(res);
    res.json = async (payload:any) => {
      try { await emitForSync(body); } catch (e) { console.error('[request-notification-triggers]', e); }
      return originalJson(payload);
    };
    next();
  });
}

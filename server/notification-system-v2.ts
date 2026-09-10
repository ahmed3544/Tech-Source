import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { Express, Request } from 'express';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import * as schema from '../src/db/schema.js';

type NotificationRecord = { id: string; recipientId: string; type: string; title: string; message: string; relatedEmployeeId?: string; relatedLeaveId?: string; relatedOvertimeId?: string; relatedShiftSwapId?: string; link?: string; targetUrl?: string; isRead: boolean; createdAt: string; updatedAt: string; };
const USE_DATABASE = Boolean(process.env.DATABASE_URL || process.env.SUPABASE_DB_URL);
const LOCAL_FILE = path.join(process.cwd(), 'notifications_v2.json');
const VERSION = '6';
let readyPromise: Promise<void> | null = null;
const clean = (value: unknown) => String(value ?? '').trim();
const nowIso = () => new Date().toISOString();

function stableId(input: Omit<NotificationRecord, 'id'> & { id?: string }) {
  if (clean(input.id)) return clean(input.id);
  const basis = [input.recipientId, input.type, input.relatedEmployeeId || '', input.relatedLeaveId || '', input.relatedOvertimeId || '', input.relatedShiftSwapId || '', input.title, input.message].join('|');
  return `n2_${crypto.createHash('sha256').update(basis).digest('hex').slice(0, 40)}`;
}

function semanticKey(raw: any): string {
  const recipientId = clean(raw?.recipientId);
  const type = clean(raw?.type);
  const relatedId = clean(raw?.relatedLeaveId) || clean(raw?.relatedOvertimeId) || clean(raw?.relatedShiftSwapId);
  if (relatedId) return `${recipientId}|${type}|${relatedId}`;
  return `${recipientId}|${type}|${clean(raw?.title)}|${clean(raw?.message)}`;
}

function targetFor(raw: any): string | undefined {
  const explicit = clean(raw?.link || raw?.targetUrl);
  if (explicit) return explicit;
  const type = clean(raw?.type);
  if (clean(raw?.relatedLeaveId)) return `/leaves?leaveId=${encodeURIComponent(clean(raw.relatedLeaveId))}`;
  if (clean(raw?.relatedOvertimeId)) return `/overtime?overtimeId=${encodeURIComponent(clean(raw.relatedOvertimeId))}`;
  if (clean(raw?.relatedShiftSwapId)) return `/schedule?shiftSwapId=${encodeURIComponent(clean(raw.relatedShiftSwapId))}`;
  if (type.startsWith('leave_')) return '/leaves';
  if (type.startsWith('overtime_')) return '/leaves';
  if (type.startsWith('shift_')) return '/schedule';
  return '/notifications';
}

function withTarget(item: NotificationRecord): NotificationRecord {
  const link = targetFor(item);
  return link ? { ...item, link, targetUrl: link } : item;
}

function normalize(raw: any): NotificationRecord | null {
  const recipientId = clean(raw?.recipientId); const type = clean(raw?.type);
  if (!recipientId || !type) return null;
  // A rejected-leave notification is only valid when it is tied to a real leave request.
  // This permanently blocks the old/orphan "تم رفض الإجازة" notifications from returning.
  if (type === 'leave_rejected' && !clean(raw?.relatedLeaveId)) return null;
  const createdAt = clean(raw?.createdAt) || nowIso(); const updatedAt = clean(raw?.updatedAt) || createdAt;
  const item: Omit<NotificationRecord, 'id'> & { id?: string } = {
    id: clean(raw?.id) || undefined, recipientId, type,
    title: clean(raw?.title) || 'إشعار جديد', message: clean(raw?.message) || 'لديك إشعار جديد.',
    relatedEmployeeId: clean(raw?.relatedEmployeeId) || undefined, relatedLeaveId: clean(raw?.relatedLeaveId) || undefined,
    relatedOvertimeId: clean(raw?.relatedOvertimeId) || undefined, relatedShiftSwapId: clean(raw?.relatedShiftSwapId) || undefined,
    isRead: Boolean(raw?.isRead), createdAt, updatedAt,
  };
  return withTarget({ id: stableId(item), ...item });
}

function mergeDuplicates(items: NotificationRecord[]): NotificationRecord[] {
  const map = new Map<string, NotificationRecord>();
  for (const raw of items) {
    const item = withTarget(raw);
    const key = semanticKey(item);
    const old = map.get(key);
    if (!old) { map.set(key, item); continue; }
    const oldTime = new Date(old.updatedAt || old.createdAt || 0).getTime();
    const newTime = new Date(item.updatedAt || item.createdAt || 0).getTime();
    const newer = newTime >= oldTime ? item : old;
    map.set(key, {
      ...newer,
      isRead: Boolean(old.isRead || item.isRead),
      createdAt: new Date(old.createdAt || item.createdAt || 0).getTime() <= new Date(item.createdAt || old.createdAt || 0).getTime() ? old.createdAt : item.createdAt,
    });
  }
  return Array.from(map.values()).sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
}

function readLocal(): NotificationRecord[] { try { if (!fs.existsSync(LOCAL_FILE)) return []; const parsed = JSON.parse(fs.readFileSync(LOCAL_FILE, 'utf8')); return Array.isArray(parsed) ? parsed : []; } catch { return []; } }
function writeLocal(items: NotificationRecord[]) { try { fs.writeFileSync(LOCAL_FILE, JSON.stringify(items, null, 2)); } catch (error) { console.warn('[Notifications v2] local persistence failed', error); } }

async function ensureReady() {
  if (!readyPromise) readyPromise = (async () => {
    if (USE_DATABASE) {
      await db.execute(sql`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS related_shift_swap_id text`);
      await db.execute(sql`CREATE TABLE IF NOT EXISTS notification_system_meta (key text PRIMARY KEY, value text NOT NULL)`);
      await db.execute(sql`INSERT INTO notification_system_meta (key, value) VALUES ('version', ${VERSION}) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`);
      // Remove any legacy/orphan rejected-leave notifications once and for all.
      await db.execute(sql`DELETE FROM notifications n WHERE n.type = 'leave_rejected' AND (n.related_leave_id IS NULL OR NOT EXISTS (SELECT 1 FROM leave_requests l WHERE l.id = n.related_leave_id AND LOWER(COALESCE(l.status,'')) = 'rejected')`);
    } else if (!fs.existsSync(LOCAL_FILE)) writeLocal([]);
  })().catch(error => { readyPromise = null; throw error; });
  return readyPromise;
}

async function listForUser(userId: string): Promise<NotificationRecord[]> {
  await ensureReady(); const id = clean(userId); if (!id) return [];
  if (USE_DATABASE) {
    const rows = await db.select().from(schema.notifications).where(eq(schema.notifications.recipientId, id));
    const leaveRows = await db.select({ id: schema.leaveRequests.id, status: schema.leaveRequests.status }).from(schema.leaveRequests);
    const validRejectedLeaveIds = new Set(leaveRows.filter((row: any) => String(row.status || '').toLowerCase() === 'rejected').map((row: any) => String(row.id)));
    const validLeaveIds = new Set(leaveRows.map((row: any) => String(row.id)));
    const normalized = rows
      .map((row: any) => withTarget({ ...row, id: String(row.id), recipientId: String(row.recipientId) }))
      .filter((item) => {
        if (item.type === 'leave_rejected') return Boolean(item.relatedLeaveId && validRejectedLeaveIds.has(String(item.relatedLeaveId)));
        return !(item.type.startsWith('leave_') && item.relatedLeaveId && !validLeaveIds.has(String(item.relatedLeaveId)));
      });
    return mergeDuplicates(normalized);
  }
  return mergeDuplicates(readLocal().filter(item => item.recipientId === id).map(normalize).filter(Boolean) as NotificationRecord[]);
}

async function saveOne(input: any): Promise<NotificationRecord | null> {
  const item = normalize(input); if (!item) return null; await ensureReady();
  if (!USE_DATABASE) {
    const items = readLocal();
    const key = semanticKey(item);
    const index = items.findIndex(existing => semanticKey(existing) === key || existing.id === item.id);
    if (index >= 0) {
      const existing = items[index];
      items[index] = { ...existing, ...item, id: existing.id, isRead: Boolean(existing.isRead || item.isRead), updatedAt: nowIso() };
    } else items.push(item);
    writeLocal(mergeDuplicates(items));
    return withTarget(items.find(existing => semanticKey(existing) === key) || item);
  }
  const key = semanticKey(item);
  const allRows = await db.select().from(schema.notifications).where(eq(schema.notifications.recipientId, item.recipientId));
  const existingById: any = allRows.find((row: any) => String(row.id) === item.id);
  const existingByKey: any = allRows.find((row: any) => semanticKey(row) === key);
  const existing: any = existingById || existingByKey;
  if (existing) {
    const existingTime = new Date(existing.updatedAt || existing.createdAt || 0).getTime();
    const incomingTime = new Date(item.updatedAt || item.createdAt || 0).getTime();
    if (existing.isRead && !item.isRead) return withTarget({ ...existing, id: String(existing.id), recipientId: String(existing.recipientId) });
    if (Number.isFinite(existingTime) && Number.isFinite(incomingTime) && incomingTime < existingTime) return withTarget({ ...existing, id: String(existing.id), recipientId: String(existing.recipientId) });
    const merged = { ...item, id: String(existing.id), isRead: Boolean(existing.isRead || item.isRead), updatedAt: nowIso() };
    const { id: _ignoredId, link: _link, targetUrl: _targetUrl, ...changes } = merged;
    await db.update(schema.notifications).set(changes as any).where(eq(schema.notifications.id, String(existing.id)));
    return withTarget(merged);
  }
  const { link: _link, targetUrl: _targetUrl, ...dbItem } = item;
  await db.insert(schema.notifications).values(dbItem as any);
  return item;
}

async function markRead(id: string, recipientId: string) {
  await ensureReady(); const notificationId = clean(id); const userId = clean(recipientId); if (!notificationId || !userId) return false;
  if (!USE_DATABASE) {
    const items = readLocal(); const target = items.find(item => item.id === notificationId && item.recipientId === userId); if (!target) return false;
    const key = semanticKey(target); const updated = items.map(item => semanticKey(item) === key ? { ...item, isRead: true, updatedAt: nowIso() } : item); writeLocal(updated); return true;
  }
  const rows = await db.select().from(schema.notifications).where(eq(schema.notifications.recipientId, userId));
  const target: any = rows.find((row: any) => String(row.id) === notificationId); if (!target) return false;
  const key = semanticKey(target); const matches = rows.filter((row: any) => semanticKey(row) === key);
  await Promise.all(matches.map((row: any) => db.update(schema.notifications).set({ isRead: true, updatedAt: nowIso() }).where(eq(schema.notifications.id, String(row.id))))); return true;
}

async function markAllRead(recipientId: string) {
  await ensureReady(); const userId = clean(recipientId); if (!userId) return 0;
  if (!USE_DATABASE) { const items = readLocal(); let count = 0; const updated = items.map(item => { if (item.recipientId === userId && !item.isRead) { count++; return { ...item, isRead: true, updatedAt: nowIso() }; } return item; }); writeLocal(updated); return count; }
  const result = await db.update(schema.notifications).set({ isRead: true, updatedAt: nowIso() }).where(and(eq(schema.notifications.recipientId, userId), eq(schema.notifications.isRead, false))); return Number((result as any)?.rowCount ?? 0);
}
function bodyOf(req: Request) { return req.body && typeof req.body === 'object' ? req.body : {}; }

export function registerNotificationSystemV2(app: Express) {
  app.get('/api/notifications', async (req, res) => { try { const notifications = await listForUser(clean(req.query.userId)); res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate'); res.setHeader('Pragma', 'no-cache'); res.json({ success: true, notifications }); } catch (error) { console.error('[Notifications v2] GET failed', error); res.status(500).json({ success: false, notifications: [], error: 'notifications_unavailable' }); } });
  app.put('/api/notifications/mark-all-read', async (req, res) => { try { const userId = clean(bodyOf(req).userId || req.query.userId); const count = await markAllRead(userId); const notifications = await listForUser(userId); res.setHeader('Cache-Control', 'no-store'); res.json({ success: true, count, notifications }); } catch (error) { console.error('[Notifications v2] mark-all-read failed', error); res.status(500).json({ success: false, count: 0 }); } });
  app.put('/api/notifications/:id/mark-read', async (req, res) => { try { const userId = clean(bodyOf(req).userId || req.query.userId); const updated = await markRead(req.params.id, userId); const notifications = await listForUser(userId); res.setHeader('Cache-Control', 'no-store'); res.json({ success: updated, updated, notifications }); } catch (error) { console.error('[Notifications v2] mark-read failed', error); res.status(500).json({ success: false, updated: false }); } });
  app.post('/api/notifications/emit', async (req, res) => { try { const notification = await saveOne(bodyOf(req).notification || bodyOf(req)); if (!notification) return res.status(400).json({ success: false, error: 'invalid_notification' }); res.setHeader('Cache-Control', 'no-store'); res.json({ success: true, notification }); } catch (error) { console.error('[Notifications v2] emit failed', error); res.status(500).json({ success: false }); } });
  app.use(async (req, _res, next) => { if (req.method !== 'POST' || !req.path.startsWith('/api/sync')) return next(); const body = bodyOf(req); const incoming = Array.isArray(body.notifications) ? body.notifications : []; if (incoming.length) { try { await Promise.all(incoming.map(item => saveOne(item))); } catch (error) { console.error('[Notifications v2] sync ingestion failed', error); } } delete body.notifications; next(); });
  void ensureReady().catch(error => console.error('[Notifications v2] startup failed', error));
}

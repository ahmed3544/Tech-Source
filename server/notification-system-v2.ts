import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { Express, Request } from 'express';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import * as schema from '../src/db/schema.js';

type NotificationRecord = {
  id: string;
  recipientId: string;
  type: string;
  title: string;
  message: string;
  relatedEmployeeId?: string;
  relatedLeaveId?: string;
  relatedOvertimeId?: string;
  relatedShiftSwapId?: string;
  isRead: boolean;
  createdAt: string;
  updatedAt: string;
};

const USE_DATABASE = Boolean(process.env.SUPABASE_DB_URL);
const LOCAL_FILE = path.join(process.cwd(), 'notifications_v2.json');
const VERSION = '2';
let readyPromise: Promise<void> | null = null;

const clean = (value: unknown) => String(value ?? '').trim();
const nowIso = () => new Date().toISOString();

function stableId(input: Omit<NotificationRecord, 'id'> & { id?: string }) {
  const basis = [
    input.recipientId,
    input.type,
    input.relatedEmployeeId || '',
    input.relatedLeaveId || '',
    input.relatedOvertimeId || '',
    input.relatedShiftSwapId || '',
    input.title,
    input.message,
  ].join('|');
  return `n2_${crypto.createHash('sha256').update(basis).digest('hex').slice(0, 40)}`;
}

function normalize(raw: any): NotificationRecord | null {
  const recipientId = clean(raw?.recipientId);
  const type = clean(raw?.type);
  if (!recipientId || !type) return null;
  const createdAt = clean(raw?.createdAt) || nowIso();
  const updatedAt = clean(raw?.updatedAt) || createdAt;
  const item: Omit<NotificationRecord, 'id'> = {
    recipientId,
    type,
    title: clean(raw?.title) || 'إشعار جديد',
    message: clean(raw?.message) || 'لديك إشعار جديد.',
    relatedEmployeeId: clean(raw?.relatedEmployeeId) || undefined,
    relatedLeaveId: clean(raw?.relatedLeaveId) || undefined,
    relatedOvertimeId: clean(raw?.relatedOvertimeId) || undefined,
    relatedShiftSwapId: clean(raw?.relatedShiftSwapId) || undefined,
    isRead: Boolean(raw?.isRead),
    createdAt,
    updatedAt,
  };
  return { id: stableId(item), ...item };
}

function readLocal(): NotificationRecord[] {
  try {
    if (!fs.existsSync(LOCAL_FILE)) return [];
    const parsed = JSON.parse(fs.readFileSync(LOCAL_FILE, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocal(items: NotificationRecord[]) {
  try {
    fs.writeFileSync(LOCAL_FILE, JSON.stringify(items, null, 2));
  } catch (error) {
    console.warn('[Notifications v2] local persistence failed', error);
  }
}

async function ensureReady() {
  if (!readyPromise) {
    readyPromise = (async () => {
      if (USE_DATABASE) {
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS notification_system_meta (
            key text PRIMARY KEY,
            value text NOT NULL
          )
        `);
        const rows = await db.execute(sql`SELECT value FROM notification_system_meta WHERE key = 'version' LIMIT 1`);
        const current = (rows.rows?.[0] as any)?.value;
        if (current !== VERSION) {
          await db.execute(sql`DELETE FROM notifications`);
          await db.execute(sql`
            INSERT INTO notification_system_meta (key, value)
            VALUES ('version', ${VERSION})
            ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
          `);
        }
      } else if (!fs.existsSync(LOCAL_FILE)) {
        writeLocal([]);
      }
    })().catch(error => {
      readyPromise = null;
      throw error;
    });
  }
  return readyPromise;
}

async function listForUser(userId: string): Promise<NotificationRecord[]> {
  await ensureReady();
  const id = clean(userId);
  if (!id) return [];

  if (USE_DATABASE) {
    const rows = await db.select().from(schema.notifications).where(eq(schema.notifications.recipientId, id));
    return rows
      .map((row: any) => ({ ...row, id: String(row.id), recipientId: String(row.recipientId) }))
      .sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  }

  return readLocal()
    .filter(item => item.recipientId === id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

async function saveOne(input: any): Promise<NotificationRecord | null> {
  const item = normalize(input);
  if (!item) return null;
  await ensureReady();

  if (!USE_DATABASE) {
    const items = readLocal();
    const index = items.findIndex(existing => existing.id === item.id);
    if (index >= 0) {
      const existing = items[index];
      items[index] = existing.isRead && !item.isRead
        ? { ...existing, updatedAt: nowIso() }
        : { ...existing, ...item, isRead: existing.isRead || item.isRead };
    } else {
      items.push(item);
    }
    writeLocal(items);
    return items.find(existing => existing.id === item.id) || item;
  }

  const existingRows = await db.select().from(schema.notifications).where(eq(schema.notifications.id, item.id));
  const existing: any = existingRows[0];

  if (existing) {
    const existingTime = new Date(existing.updatedAt || existing.createdAt || 0).getTime();
    const incomingTime = new Date(item.updatedAt || item.createdAt || 0).getTime();
    if (existing.isRead && !item.isRead) return existing as NotificationRecord;
    if (Number.isFinite(existingTime) && Number.isFinite(incomingTime) && incomingTime < existingTime) {
      return existing as NotificationRecord;
    }
    const merged = { ...item, isRead: Boolean(existing.isRead || item.isRead), updatedAt: nowIso() };
    await db.update(schema.notifications).set(merged as any).where(eq(schema.notifications.id, item.id));
    return merged;
  }

  await db.insert(schema.notifications).values(item as any);
  return item;
}

async function markRead(id: string, recipientId: string) {
  await ensureReady();
  const notificationId = clean(id);
  const userId = clean(recipientId);
  if (!notificationId || !userId) return false;

  if (!USE_DATABASE) {
    const items = readLocal();
    const index = items.findIndex(item => item.id === notificationId && item.recipientId === userId);
    if (index < 0) return false;
    items[index] = { ...items[index], isRead: true, updatedAt: nowIso() };
    writeLocal(items);
    return true;
  }

  const result = await db.update(schema.notifications)
    .set({ isRead: true, updatedAt: nowIso() })
    .where(and(eq(schema.notifications.id, notificationId), eq(schema.notifications.recipientId, userId)));
  return Number((result as any)?.rowCount ?? 1) > 0;
}

async function markAllRead(recipientId: string) {
  await ensureReady();
  const userId = clean(recipientId);
  if (!userId) return 0;

  if (!USE_DATABASE) {
    const items = readLocal();
    let count = 0;
    const updated = items.map(item => {
      if (item.recipientId === userId && !item.isRead) {
        count += 1;
        return { ...item, isRead: true, updatedAt: nowIso() };
      }
      return item;
    });
    writeLocal(updated);
    return count;
  }

  const result = await db.update(schema.notifications)
    .set({ isRead: true, updatedAt: nowIso() })
    .where(and(eq(schema.notifications.recipientId, userId), eq(schema.notifications.isRead, false)));
  return Number((result as any)?.rowCount ?? 0);
}

function bodyOf(req: Request) {
  return req.body && typeof req.body === 'object' ? req.body : {};
}

export function registerNotificationSystemV2(app: Express) {
  // These routes are intentionally registered before the legacy notification routes.
  app.get('/api/notifications', async (req, res) => {
    try {
      const notifications = await listForUser(clean(req.query.userId));
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.json({ success: true, notifications });
    } catch (error) {
      console.error('[Notifications v2] GET failed', error);
      res.status(500).json({ success: false, notifications: [], error: 'notifications_unavailable' });
    }
  });

  app.put('/api/notifications/:id/mark-read', async (req, res) => {
    try {
      const userId = clean(bodyOf(req).userId || req.query.userId);
      const ok = await markRead(req.params.id, userId);
      res.json({ success: ok });
    } catch (error) {
      console.error('[Notifications v2] mark-read failed', error);
      res.status(500).json({ success: false });
    }
  });

  app.put('/api/notifications/mark-all-read', async (req, res) => {
    try {
      const userId = clean(bodyOf(req).userId || req.query.userId);
      const count = await markAllRead(userId);
      res.json({ success: true, count });
    } catch (error) {
      console.error('[Notifications v2] mark-all-read failed', error);
      res.status(500).json({ success: false, count: 0 });
    }
  });

  app.post('/api/notifications/emit', async (req, res) => {
    try {
      const notification = await saveOne(bodyOf(req).notification || bodyOf(req));
      if (!notification) return res.status(400).json({ success: false, error: 'invalid_notification' });
      res.json({ success: true, notification });
    } catch (error) {
      console.error('[Notifications v2] emit failed', error);
      res.status(500).json({ success: false });
    }
  });

  // Convert the old snapshot-style sync into event ingestion. The rest of /api/sync
  // continues to handle attendance/leaves/etc, but notification snapshots never
  // overwrite the authoritative notification table anymore.
  app.use(async (req, _res, next) => {
    if (req.method !== 'POST' || !req.path.startsWith('/api/sync')) return next();
    const body = bodyOf(req);
    const incoming = Array.isArray(body.notifications) ? body.notifications : [];
    if (incoming.length) {
      try {
        await Promise.all(incoming.map(item => saveOne(item)));
      } catch (error) {
        console.error('[Notifications v2] sync ingestion failed', error);
      }
    }
    delete body.notifications;
    next();
  });

  void ensureReady().catch(error => console.error('[Notifications v2] startup failed', error));
}

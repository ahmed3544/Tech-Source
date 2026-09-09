import type { Express } from 'express';
import { sql } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import * as schema from '../src/db/schema.js';
import { getApps, cert, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

const hasDatabase = () => Boolean(process.env.DATABASE_URL || process.env.SUPABASE_DB_URL);

function adminMessaging() {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    console.warn('[FCM] FIREBASE_SERVICE_ACCOUNT_JSON is missing');
    return null;
  }
  try {
    if (!getApps().length) {
      initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)) });
    }
    return getMessaging();
  } catch (error) {
    console.error('[FCM] init failed', error);
    return null;
  }
}

async function readTokens() {
  if (!hasDatabase()) return [];
  try {
    const rows = await db.select().from(schema.settings).where(sql`key = 'fcm_tokens'`).limit(1);
    const value: any = rows[0]?.value;
    return Array.isArray(value) ? value : [];
  } catch (error) {
    console.error('[FCM] token read failed', error);
    return [];
  }
}

async function tokensFor(employeeId: string) {
  const tokens = await readTokens();
  return tokens
    .filter((x: any) => String(x?.employeeId) === employeeId)
    .map((x: any) => String(x?.token || ''))
    .filter(Boolean);
}

async function saveToken(employeeId: string, token: string, platform: string) {
  if (!hasDatabase()) {
    console.warn('[FCM] token not saved: database is unavailable');
    return false;
  }
  const current = await readTokens();
  const next = current.filter((x: any) => x?.token !== token);
  next.push({ employeeId, token, platform, updatedAt: new Date().toISOString() });
  await db.insert(schema.settings).values({ key: 'fcm_tokens', value: next }).onConflictDoUpdate({
    target: schema.settings.key,
    set: { value: next },
  });
  console.info('[FCM] token registered', { employeeId, platform });
  return true;
}

export async function sendPushToEmployee(
  employeeId: string,
  title: string,
  body: string,
  data: Record<string, string> = {}
) {
  const messaging = adminMessaging();
  if (!messaging) return { sent: 0, configured: false };

  const tokens = await tokensFor(employeeId);
  if (!tokens.length) {
    console.warn('[FCM] no registered token for employee', employeeId);
    return { sent: 0, configured: true };
  }

  const response = await messaging.sendEachForMulticast({
    tokens,
    notification: { title, body },
    data,
    android: {
      priority: 'high',
      notification: {
        channelId: 'tech-source-notifications',
        sound: 'default',
      },
    },
    webpush: {
      headers: { Urgency: 'high' },
      notification: { title, body, icon: '/icon-192.png' },
    },
  });

  const invalidTokens = new Set<string>();
  response.responses.forEach((result, index) => {
    const code = (result.error as any)?.code;
    if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') {
      invalidTokens.add(tokens[index]);
    }
  });

  if (invalidTokens.size && hasDatabase()) {
    const current = await readTokens();
    const cleaned = current.filter((x: any) => !invalidTokens.has(String(x?.token || '')));
    try {
      await db.insert(schema.settings).values({ key: 'fcm_tokens', value: cleaned }).onConflictDoUpdate({
        target: schema.settings.key,
        set: { value: cleaned },
      });
    } catch (error) {
      console.warn('[FCM] invalid token cleanup failed', error);
    }
  }

  console.info('[FCM] push result', {
    employeeId,
    requested: tokens.length,
    sent: response.successCount,
    failed: response.failureCount,
  });

  return { sent: response.successCount, failed: response.failureCount, configured: true };
}

export function registerFcmRoutes(app: Express) {
  app.post('/api/push/register', async (req, res) => {
    try {
      const { employeeId, token, platform = 'unknown' } = req.body || {};
      if (!employeeId || !token) return res.status(400).json({ success: false });
      const saved = await saveToken(String(employeeId), String(token), String(platform));
      return res.json({ success: saved });
    } catch (error) {
      console.error('[FCM] register', error);
      return res.status(500).json({ success: false });
    }
  });

  app.post('/api/push/send', async (req, res) => {
    try {
      const { employeeId, title, body, data = {} } = req.body || {};
      if (!employeeId || !title || !body) return res.status(400).json({ success: false });
      return res.json({ success: true, ...await sendPushToEmployee(String(employeeId), String(title), String(body), data) });
    } catch (error) {
      console.error('[FCM] send', error);
      return res.status(500).json({ success: false });
    }
  });
}

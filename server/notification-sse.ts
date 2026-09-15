import type { Express, Request, Response } from 'express';

export type NotificationStreamItem = {
  id: string;
  recipientId: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
};

const subscribers = new Map<string, Set<Response>>();
const clean = (value: unknown) => String(value ?? '').trim();

export function publishNotification(notification: NotificationStreamItem) {
  const recipientId = clean(notification.recipientId);
  if (!recipientId) return;
  const clients = subscribers.get(recipientId);
  if (!clients?.size) return;
  const payload = `event: notification\ndata: ${JSON.stringify(notification)}\n\n`;
  for (const response of clients) {
    try { response.write(payload); } catch { removeSubscriber(recipientId, response); }
  }
}

function removeSubscriber(userId: string, response: Response) {
  const clients = subscribers.get(userId);
  if (!clients) return;
  clients.delete(response);
  if (!clients.size) subscribers.delete(userId);
}

export function registerNotificationSse(app: Express) {
  app.get('/api/notifications/stream', (req: Request, res: Response) => {
    const userId = clean(req.query.userId);
    if (!userId) { res.status(400).end(); return; }
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();
    res.write(`event: ready\ndata: ${JSON.stringify({ connectedAt: new Date().toISOString() })}\n\n`);

    const clients = subscribers.get(userId) || new Set<Response>();
    clients.add(res);
    subscribers.set(userId, clients);
    const heartbeat = setInterval(() => { try { res.write(': heartbeat\\n\\n'); } catch { removeSubscriber(userId, res); } }, 25000);
    const cleanup = () => { clearInterval(heartbeat); removeSubscriber(userId, res); };
    req.on('close', cleanup);
    res.on('error', cleanup);
  });
}

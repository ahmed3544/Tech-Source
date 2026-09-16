import { db } from "../../src/db/index.js";
import * as schema from "../../src/db/schema.js";
import { eq } from "drizzle-orm";

function pathName(req: any) {
  return String(req.url || "").split("?")[0].replace(/\\/g, "");
}

async function listNotifications(userId: string) {
  const rows = await db.select().from(schema.notifications).where(eq(schema.notifications.recipientId, userId));
  const bySemantic = new Map<string, any>();
  for (const row of rows as any[]) {
    const relatedId = String(row.relatedLeaveId || row.relatedOvertimeId || row.relatedShiftSwapId || "").trim();
    const key = relatedId
      ? `${row.recipientId}|${row.type}|${relatedId}`
      : `${row.recipientId}|${row.type}|${String(row.title || "").trim()}|${String(row.message || "").trim()}`;
    const existing = bySemantic.get(key);
    if (!existing) {
      bySemantic.set(key, row);
      continue;
    }
    bySemantic.set(key, {
      ...existing,
      ...row,
      id: String(row.id || existing.id),
      isRead: Boolean(existing.isRead || row.isRead),
      createdAt: new Date(existing.createdAt || row.createdAt || 0).getTime() <= new Date(row.createdAt || existing.createdAt || 0).getTime() ? existing.createdAt : row.createdAt,
    });
  }
  return Array.from(bySemantic.values())
    .map((row: any) => ({
      ...row,
      id: String(row.id),
      recipientId: String(row.recipientId),
      link: row.relatedLeaveId
        ? `/leaves?leaveId=${encodeURIComponent(String(row.relatedLeaveId))}`
        : row.relatedOvertimeId
          ? `/overtime?overtimeId=${encodeURIComponent(String(row.relatedOvertimeId))}`
          : row.relatedShiftSwapId
            ? `/schedule?shiftSwapId=${encodeURIComponent(String(row.relatedShiftSwapId))}`
            : "/notifications",
    }))
    .sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
}

export default async function handler(req: any, res: any) {
  const path = pathName(req);
  const userId = String(req.body?.userId || req.query?.userId || "").trim();

  try {
    if (req.method === "GET" && path.endsWith("/stream")) {
      if (!userId) return res.status(400).end();
      res.status(200);
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders?.();
      res.write(`event: ready\ndata: ${JSON.stringify({ connectedAt: new Date().toISOString() })}\n\n`);
      const timer = setInterval(() => {
        try { res.write(": heartbeat\n\n"); } catch { clearInterval(timer); }
      }, 25000);
      req.on("close", () => clearInterval(timer));
      return;
    }

    if (req.method === "PUT" && path.endsWith("/mark-all-read")) {
      if (!userId) return res.status(400).json({ success: false, count: 0 });
      const rows = await db.select({ isRead: schema.notifications.isRead }).from(schema.notifications).where(eq(schema.notifications.recipientId, userId));
      const count = rows.filter((row: any) => !Boolean(row.isRead)).length;
      await db.update(schema.notifications)
        .set({ isRead: true, updatedAt: new Date().toISOString() })
        .where(eq(schema.notifications.recipientId, userId));
      return res.json({ success: true, count, notifications: await listNotifications(userId) });
    }

    if (req.method === "PUT" && path.includes("/mark-read")) {
      const match = path.match(/\/notifications\/([^/]+)\/mark-read$/);
      const id = String(match?.[1] || "").trim();
      if (!userId || !id) return res.status(400).json({ success: false, updated: false });
      const rows = await db.select().from(schema.notifications).where(eq(schema.notifications.recipientId, userId));
      const target = rows.find((row: any) => String(row.id) === id);
      if (!target) return res.status(404).json({ success: false, updated: false });
      const relatedId = String(target.relatedLeaveId || target.relatedOvertimeId || target.relatedShiftSwapId || "").trim();
      const sameNotification = (row: any) => {
        if (relatedId) return String(row.type || "") === String(target.type || "") && String(row.relatedLeaveId || row.relatedOvertimeId || row.relatedShiftSwapId || "").trim() === relatedId;
        return String(row.type || "") === String(target.type || "") && String(row.title || "").trim() === String(target.title || "").trim() && String(row.message || "").trim() === String(target.message || "").trim();
      };
      const matchingIds = rows.filter(sameNotification).map((row: any) => String(row.id)).filter(Boolean);
      await Promise.all(matchingIds.map((notificationId: string) => db.update(schema.notifications).set({ isRead: true, updatedAt: new Date().toISOString() }).where(eq(schema.notifications.id, notificationId))));
      return res.json({ success: true, updated: matchingIds.length > 0, notifications: await listNotifications(userId) });
    }

    return res.status(404).json({ success: false, error: "not_found" });
  } catch (error) {
    console.error("[notifications-api] failed:", error);
    return res.status(500).json({ success: false, error: "database_unavailable" });
  }
}

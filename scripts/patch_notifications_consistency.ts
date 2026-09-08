import fs from 'fs';
import path from 'path';

const root = process.cwd();
const serverPath = path.join(root, 'server.ts');
const bellPath = path.join(root, 'src/components/NotificationCenter.tsx');

function patchServer() {
  let code = fs.readFileSync(serverPath, 'utf8');

  const start = code.indexOf('        /*\n        =====================================================\n        NOTIFICATIONS\n        =====================================================\n        */');
  const end = code.indexOf('        /*\n        =====================================================\n        URGENT NOTICE', start);

  if (start < 0 || end < 0) {
    throw new Error('Notification sync block not found in server.ts');
  }

  const replacement = `        /*\n        =====================================================\n        NOTIFICATIONS\n        =====================================================\n        */\n\n        for (const n of Array.isArray(b.notifications) ? b.notifications : []) {\n          if (!n?.id || !n?.recipientId) continue;\n\n          const id = String(n.id).trim();\n          const now = new Date().toISOString();\n          const incomingUpdatedAt = n.updatedAt || n.createdAt || now;\n\n          const existingRows = await db\n            .select()\n            .from(schema.notifications)\n            .where(sql\`\${schema.notifications.id} = \${id}\`);\n\n          const existing = existingRows[0] as any;\n\n          // Never let an older browser snapshot overwrite newer server data.\n          if (existing) {\n            const incomingTime = new Date(incomingUpdatedAt).getTime();\n            const existingTime = new Date(existing.updatedAt || existing.createdAt || 0).getTime();\n\n            if (Number.isFinite(incomingTime) && Number.isFinite(existingTime) && incomingTime < existingTime) {\n              continue;\n            }\n\n            // Once read, an old unread snapshot cannot make it unread again.\n            if (existing.isRead === true && n.isRead !== true) {\n              continue;\n            }\n          }\n\n          const notification = {\n            id,\n            recipientId: String(n.recipientId).trim(),\n            type: String(n.type || 'admin_notice'),\n            title: String(n.title || ''),\n            message: String(n.message || ''),\n            relatedEmployeeId: n.relatedEmployeeId == null ? null : String(n.relatedEmployeeId),\n            relatedLeaveId: n.relatedLeaveId == null ? null : String(n.relatedLeaveId),\n            relatedOvertimeId: n.relatedOvertimeId == null ? null : String(n.relatedOvertimeId),\n            isRead: Boolean(n.isRead),\n            createdAt: existing?.createdAt || n.createdAt || now,\n            updatedAt: incomingUpdatedAt,\n          };\n\n          if (!existing) {\n            await db.insert(schema.notifications).values(notification as any);\n          } else {\n            await db.update(schema.notifications)\n              .set(notification as any)\n              .where(sql\`\${schema.notifications.id} = \${id}\`);\n          }\n        }\n\n`;

  code = code.slice(0, start) + replacement + code.slice(end);
  fs.writeFileSync(serverPath, code, 'utf8');
}

function patchBell() {
  let code = fs.readFileSync(bellPath, 'utf8');
  const old = "if (!isDisplayableNotification(item) || item.recipientId !== currentUserId || seen.has(item.id)) {";
  const next = "if (!isDisplayableNotification(item) || String(item.recipientId).trim() !== String(currentUserId).trim() || seen.has(String(item.id))) {";
  if (code.includes(old)) code = code.replace(old, next);
  fs.writeFileSync(bellPath, code, 'utf8');
}

patchServer();
patchBell();
console.log('Patched notification persistence and cross-device read state');

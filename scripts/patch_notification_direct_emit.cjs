const fs = require('fs');

const path = 'src/App.tsx';
const marker = '/* TECH_SOURCE_NOTIFICATION_DIRECT_EMIT_V1 */';

if (!fs.existsSync(path)) {
  console.warn('[patch_notification_direct_emit] App.tsx not found; skipping safely.');
  process.exit(0);
}

let code = fs.readFileSync(path, 'utf8');
if (code.includes(marker)) {
  console.log('[patch_notification_direct_emit] already applied');
  process.exit(0);
}

const anchor = `  if (overrides?.notifications !== undefined) {\n    payload.notifications =\n      overrides.notifications;\n  }`;

if (!code.includes(anchor)) {
  console.warn('[patch_notification_direct_emit] pushSync notifications anchor not found; skipping safely.');
  process.exit(0);
}

const replacement = `  if (overrides?.notifications !== undefined) {\n    payload.notifications =\n      overrides.notifications;\n\n    ${marker}\n    // Persist notification mutations directly through the notification API.\n    // /api/sync remains a secondary backup path. Stable notification IDs make\n    // this safe if the same item also arrives through the sync endpoint.\n    try {\n      await Promise.all(\n        overrides.notifications.map(async (notification) => {\n          const response = await fetch('/api/notifications/emit', {\n            method: 'POST',\n            headers: {\n              'Content-Type': 'application/json',\n              'Cache-Control': 'no-cache',\n              'Pragma': 'no-cache'\n            },\n            body: JSON.stringify({ notification }),\n            cache: 'no-store'\n          });\n\n          if (!response.ok) {\n            throw new Error(\`Notification emit failed: \${response.status}\`);\n          }\n        })\n      );\n    } catch (error) {\n      // Do not block the main mutation: /api/sync will retry persistence.\n      console.warn('[Notifications] direct emit failed; falling back to sync', error);\n    }\n  }`;

code = code.replace(anchor, replacement);
fs.writeFileSync(path, code, 'utf8');
console.log('[patch_notification_direct_emit] applied');

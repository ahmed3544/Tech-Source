const fs = require('fs');
const path = 'src/App.tsx';
const marker = '/* TECH_SOURCE_NOTIFICATION_DIRECT_EMIT_V3 */';

if (!fs.existsSync(path)) process.exit(0);
let code = fs.readFileSync(path, 'utf8');
if (code.includes(marker)) process.exit(0);

const re = /if\s*\(\s*overrides\?\.notifications\s*!==\s*undefined\s*\)\s*\{[\s\S]*?\n\s*\}/;
if (!re.test(code)) {
  console.warn('[patch_notification_direct_emit] pushSync notification block not found; skipping safely.');
  process.exit(0);
}

const replacement = `if (overrides?.notifications !== undefined) {\n    ${marker}\n    // Notifications are authoritative in the dedicated notification API.\n    // Never include them in generic /api/sync: a stale snapshot can resurrect\n    // deleted/read notifications on another device.\n    try {\n      const notificationItems = Array.isArray(overrides.notifications)\n        ? overrides.notifications\n        : [];\n\n      await Promise.all(\n        notificationItems.map(async (notification) => {\n          const response = await fetch('/api/notifications/emit', {\n            method: 'POST',\n            headers: {\n              'Content-Type': 'application/json',\n              'Cache-Control': 'no-cache',\n              'Pragma': 'no-cache'\n            },\n            body: JSON.stringify({ notification }),\n            cache: 'no-store'\n          });\n\n          if (!response.ok) {\n            throw new Error(\`notification emit failed: \${response.status}\`);\n          }\n        })\n      );\n    } catch (error) {\n      console.warn('[Notifications] direct emit failed; notification was not added to generic sync', error);\n    }\n  }`;

code = code.replace(re, replacement);
fs.writeFileSync(path, code, 'utf8');
console.log('[patch_notification_direct_emit] applied V3');

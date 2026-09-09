const fs = require('fs');
const path = 'src/App.tsx';
const marker = '/* TECH_SOURCE_NOTIFICATION_DIRECT_EMIT_V2 */';

if (!fs.existsSync(path)) process.exit(0);
let code = fs.readFileSync(path, 'utf8');
if (code.includes(marker)) process.exit(0);

const re = /(if\s*\(\s*overrides\?\.notifications\s*!==\s*undefined\s*\)\s*\{\s*payload\.notifications\s*=\s*overrides\.notifications;)(\s*\})/;
if (!re.test(code)) {
  console.warn('[patch_notification_direct_emit] pushSync notification block not found; skipping safely.');
  process.exit(0);
}

const injected = `$1\n\n    ${marker}\n    // Notifications have their own authoritative API. Persist every emitted item directly.\n    try {\n      await Promise.all(\n        overrides.notifications.map(async (notification) => {\n          const response = await fetch('/api/notifications/emit', {\n            method: 'POST',\n            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' },\n            body: JSON.stringify({ notification }),\n            cache: 'no-store'\n          });\n          if (!response.ok) throw new Error(\`notification emit failed: \${response.status}\`);\n        })\n      );\n    } catch (error) {\n      console.warn('[Notifications] direct emit failed; sync remains fallback', error);\n    }$2`;

code = code.replace(re, injected);
fs.writeFileSync(path, code, 'utf8');
console.log('[patch_notification_direct_emit] applied');

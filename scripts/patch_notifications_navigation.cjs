const fs = require('fs');

const path = 'src/App.tsx';
if (!fs.existsSync(path)) process.exit(0);

let code = fs.readFileSync(path, 'utf8');
const marker = '/* TECH_SOURCE_NOTIFICATIONS_NAV_V1 */';
if (code.includes(marker)) {
  console.log('[patch_notifications_navigation] already applied');
  process.exit(0);
}

const headerStart = code.indexOf('<Header');
if (headerStart === -1) {
  console.warn('[patch_notifications_navigation] Header invocation not found; skipping safely.');
  process.exit(0);
}

const headerEnd = code.indexOf('/>', headerStart);
if (headerEnd === -1 || headerEnd - headerStart > 30000) {
  console.warn('[patch_notifications_navigation] Header closing tag not found; skipping safely.');
  process.exit(0);
}

const headerBlock = code.slice(headerStart, headerEnd);
if (headerBlock.includes('onOpenNotificationsPage=')) {
  code = code.slice(0, headerStart) + headerBlock + '\n        ' + marker + '\n      ' + code.slice(headerEnd);
  fs.writeFileSync(path, code, 'utf8');
  console.log('[patch_notifications_navigation] callback already existed');
  process.exit(0);
}

if (!headerBlock.includes('onMarkAllNotificationsAsRead=')) {
  console.warn('[patch_notifications_navigation] notification props not found; skipping safely.');
  process.exit(0);
}

const updatedHeader = headerBlock.replace(
  /(onMarkAllNotificationsAsRead=\{\s*handleMarkAllNotificationsAsRead\s*\})/,
  '$1\n        onOpenNotificationsPage={() => setActiveTab(\'notifications\')}'
);

if (updatedHeader === headerBlock) {
  console.warn('[patch_notifications_navigation] anchor replacement failed; skipping safely.');
  process.exit(0);
}

code = code.slice(0, headerStart) + updatedHeader + '\n      ' + marker + '\n      ' + code.slice(headerEnd);
fs.writeFileSync(path, code, 'utf8');
console.log('[patch_notifications_navigation] applied');

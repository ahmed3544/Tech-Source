const fs = require('fs');

const serverPath = 'server.ts';
const pagePath = 'src/components/NotificationsPage.tsx';

function read(file) { return fs.readFileSync(file, 'utf8'); }
function write(file, text) { fs.writeFileSync(file, text); }

// This patch runs on every Vercel build, so every transformation must be
// idempotent. A previous build may already have applied the same fix.
let server = read(serverPath);
const trigger = 'registerRequestNotificationTriggers(app);';
const triggerCount = (server.match(new RegExp(trigger.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
if (triggerCount === 0) {
  throw new Error('[notifications-v2] notification trigger registration is missing');
}
if (triggerCount > 1) {
  // Keep only the last registration if an earlier build left a duplicate.
  let seen = 0;
  server = server.replace(new RegExp(trigger.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), () => (++seen === triggerCount ? trigger : ''));
}

// Remove the legacy notifications-in-/api/sync bridge. It is safe to skip
// this step when a previous build has already removed it.
const notificationBridge = /\napp\.use\(async \(req:any,res:any,next:any\)=>\{\n  if \(req\.method !== 'POST' \|\| !\['\/api\/sync','\/sync'\]\.includes\(String\(req\.path \|\| ''\)\.split\('\?'\)\[0\]\)\) return next\(\);\n  const items = Array\.isArray\(req\.body\?\.notifications\) \? req\.body\.notifications : \[\];\n  if \(!items\.length\) return next\(\);\n  try \{[\s\S]*?  \}\n  return next\(\);\n\}\);\n/;
if (notificationBridge.test(server)) {
  server = server.replace(notificationBridge, '\n');
}

// Ensure the trigger is registered after the leave persistence bridge. If it
// is already there, leave it untouched; otherwise insert it at the anchor.
const leaveBridgeEnd = `  } catch (error:any) {\n    console.error('[leave-sync-bridge] persistence failed:', error);\n    return res.status(500).json({ success:false, error:'Leave sync failed' });\n  }\n});`;
if (!server.includes(trigger)) {
  if (!server.includes(leaveBridgeEnd)) {
    throw new Error('[notifications-v2] leave bridge anchor not found');
  }
  server = server.replace(leaveBridgeEnd, `${leaveBridgeEnd}\n\n${trigger}`);
}
write(serverPath, server);

// Shift-swap actions must never write the authoritative request list to
// localStorage. Neon is the source of truth; /api/sync persists the request.
let page = read(pagePath);
const localStoragePattern = /localStorage\.setItem\('shift_swap_requests',JSON\.stringify\(nextRequests\)\);/;
if (localStoragePattern.test(page)) {
  page = page.replace(localStoragePattern, '');
}

// Surface swap persistence failures instead of swallowing them with only a
// finally block. Safe to skip after a previous build already applied it.
const tryFinallyPattern = /await markRead\(notification\.id\);await load\(true\);\}finally\{/;
if (tryFinallyPattern.test(page)) {
  page = page.replace(tryFinallyPattern, `await markRead(notification.id);await load(true);}catch{setError(true);}finally{`);
}
write(pagePath, page);

console.log('[notifications-v2] authoritative notification fixes applied');

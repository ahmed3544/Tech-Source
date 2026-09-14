const fs = require('fs');

const serverPath = 'server.ts';
const pagePath = 'src/components/NotificationsPage.tsx';

function read(file) { return fs.readFileSync(file, 'utf8'); }
function write(file, text) { fs.writeFileSync(file, text); }

// 1) Notification triggers must run after the leave persistence bridge, so the
// trigger reads the state that was actually written to Neon. The old order
// queried Neon before the mutation and silently skipped the notification.
let server = read(serverPath);
const trigger = 'registerRequestNotificationTriggers(app);';
if ((server.match(new RegExp(trigger.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length !== 1) {
  throw new Error('[notifications-v2] expected exactly one trigger registration');
}
server = server.replace(`\n${trigger}\n\napp.get('/api/data'`, `\napp.get('/api/data'`);

// Remove the legacy notifications-in-/api/sync bridge. Notifications are now
// authoritative in /api/notifications/*; accepting client snapshots here can
// resurrect isRead=false on another device.
const notificationBridge = /\napp\.use\(async \(req:any,res:any,next:any\)=>\{\n  if \(req\.method !== 'POST' \|\| !\['\/api\/sync','\/sync'\]\.includes\(String\(req\.path \|\| ''\)\.split\('\?'\)\[0\]\)\) return next\(\);\n  const items = Array\.isArray\(req\.body\?\.notifications\) \? req\.body\.notifications : \[\];\n  if \(!items\.length\) return next\(\);\n  try \{[\s\S]*?  \}\n  return next\(\);\n\}\);\n/;
if (!notificationBridge.test(server)) {
  throw new Error('[notifications-v2] legacy notification sync bridge not found');
}
server = server.replace(notificationBridge, '\n');

// Register after the leave bridge and before downstream device-sync middleware.
const leaveBridgeEnd = `  } catch (error:any) {\n    console.error('[leave-sync-bridge] persistence failed:', error);\n    return res.status(500).json({ success:false, error:'Leave sync failed' });\n  }\n});`;
if (!server.includes(leaveBridgeEnd)) {
  throw new Error('[notifications-v2] leave bridge anchor not found');
}
server = server.replace(leaveBridgeEnd, `${leaveBridgeEnd}\n\nregisterRequestNotificationTriggers(app);`);
write(serverPath, server);

// 2) Shift-swap actions must never write the authoritative request list to
// localStorage. Neon is the source of truth; /api/sync persists the request.
let page = read(pagePath);
const localStoragePattern = /localStorage\.setItem\('shift_swap_requests',JSON\.stringify\(nextRequests\)\);/;
if (!localStoragePattern.test(page)) {
  throw new Error('[notifications-v2] shift swap localStorage write not found');
}
page = page.replace(localStoragePattern, '');

// Surface swap persistence failures instead of swallowing them with only a
// finally block. The caller can retry after the page reports the service error.
const tryFinallyPattern = /await markRead\(notification\.id\);await load\(true\);\}finally\{/;
if (!tryFinallyPattern.test(page)) {
  throw new Error('[notifications-v2] shift swap try/finally anchor not found');
}
page = page.replace(tryFinallyPattern, `await markRead(notification.id);await load(true);}catch{setError(true);}finally{`);
write(pagePath, page);

console.log('[notifications-v2] authoritative notification fixes applied');

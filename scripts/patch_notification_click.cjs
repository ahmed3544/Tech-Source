const fs=require('fs');
const path='src/components/NotificationsPage.tsx';
if(!fs.existsSync(path))process.exit(0);
let code=fs.readFileSync(path,'utf8');
const marker='/* TECH_SOURCE_NOTIFICATION_CLICK_V1 */';
if(code.includes(marker))process.exit(0);
const re=/(<article\s+key=\{n\.id\})(\s+className=)/;
if(!re.test(code)){console.warn('[patch_notification_click] article anchor not found');process.exit(0);}
code=code.replace(re,`$1 onClick={() => {\n  try { window.dispatchEvent(new CustomEvent('techsource:navigate-notification', { detail: n })); } catch {}\n}} role="button" tabIndex={0} ${marker}\n  $2`);
fs.writeFileSync(path,code,'utf8');
console.log('[patch_notification_click] applied');

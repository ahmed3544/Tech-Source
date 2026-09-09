import fs from 'fs';

const path = 'server.ts';
let code = fs.readFileSync(path, 'utf8');

const importLine = 'import { registerAttendanceRealtime } from "./server/attendance-realtime.js";';
if (!code.includes(importLine)) {
  const marker = 'import { registerFcmRoutes } from "./server/fcm.js";';
  if (code.includes(marker)) code = code.replace(marker, `${marker}\n${importLine}`);
  else throw new Error('attendance realtime import anchor not found');
}

if (!code.includes('registerAttendanceRealtime(app);')) {
  const anchor = 'registerNotificationSystemV2(app);';
  if (code.includes(anchor)) code = code.replace(anchor, `${anchor}\nregisterAttendanceRealtime(app);`);
  else {
    const exportAnchor = 'export default app;';
    if (code.includes(exportAnchor)) code = code.replace(exportAnchor, `registerAttendanceRealtime(app);\n\n${exportAnchor}`);
    else throw new Error('attendance realtime registration anchor not found');
  }
}

fs.writeFileSync(path, code, 'utf8');
console.log('[patch_attendance_realtime] applied');

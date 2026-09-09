import fs from 'fs';

const path = 'server.ts';
let code = fs.readFileSync(path, 'utf8');

const importLine = 'import { registerAttendanceRealtime } from "./server/attendance-realtime.js";';
if (!code.includes(importLine)) {
  const importAnchors = [
    'import { registerFcmRoutes } from "./server/fcm.js";',
    'import * as schema from "./src/db/schema.js";',
    'import { db } from "./src/db/index.js";'
  ];
  const marker = importAnchors.find((x) => code.includes(x));
  if (marker) code = code.replace(marker, `${marker}\n${importLine}`);
  else {
    const firstImportEnd = code.match(/^import[^\n]*;\s*$/m);
    if (firstImportEnd?.[0]) code = code.replace(firstImportEnd[0], `${firstImportEnd[0]}\n${importLine}`);
    else throw new Error('attendance realtime import anchor not found');
  }
}

if (!code.includes('registerAttendanceRealtime(app);')) {
  const anchors = [
    'registerNotificationSystemV2(app);',
    'registerDeviceSyncV2(app);'
  ];
  const marker = anchors.find((x) => code.includes(x));
  if (marker) {
    code = code.replace(marker, `${marker}\nregisterAttendanceRealtime(app);`);
  } else {
    const exportAnchor = 'export default app;';
    if (code.includes(exportAnchor)) code = code.replace(exportAnchor, `registerAttendanceRealtime(app);\n\n${exportAnchor}`);
    else throw new Error('attendance realtime registration anchor not found');
  }
}

fs.writeFileSync(path, code, 'utf8');
console.log('[patch_attendance_realtime] applied');

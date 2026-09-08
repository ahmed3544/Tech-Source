import fs from 'fs';
import path from 'path';

const serverPath = path.join(process.cwd(), 'server.ts');
let code = fs.readFileSync(serverPath, 'utf8');

if (!code.includes('./server/device-sync-v2.js')) {
  code = code.replace(
    'import { registerFcmRoutes } from "./server/fcm.js";',
    'import { registerFcmRoutes } from "./server/fcm.js";\nimport { registerDeviceSyncV2 } from "./server/device-sync-v2.js";'
  );
}

code = code.replace(/\nregisterDeviceSyncV2\(app\);/g, '');
const marker = 'registerNotificationSystemV2(app);';
if (code.includes(marker) && !code.includes('registerDeviceSyncV2(app);')) {
  code = code.replace(marker, `${marker}\nregisterDeviceSyncV2(app);`);
}

fs.writeFileSync(serverPath, code, 'utf8');
console.log('[device-sync-v2] authoritative cross-device sync active');

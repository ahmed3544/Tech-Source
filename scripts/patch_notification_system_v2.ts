import fs from 'fs';
import path from 'path';

const root = process.cwd();
const serverPath = path.join(root, 'server.ts');
let code = fs.readFileSync(serverPath, 'utf8');

if (!code.includes("./server/notification-system-v2.js")) {
  code = code.replace(
    "import { registerFcmRoutes } from \"./server/fcm.js\";",
    "import { registerFcmRoutes } from \"./server/fcm.js\";\nimport { registerNotificationSystemV2 } from \"./server/notification-system-v2.js\";"
  );
}

if (!code.includes('registerNotificationSystemV2(app);')) {
  code = code.replace(
    'registerFcmRoutes(app);',
    'registerFcmRoutes(app);\nregisterNotificationSystemV2(app);'
  );
}

fs.writeFileSync(serverPath, code);
console.log('[notifications-v2] server integration active');

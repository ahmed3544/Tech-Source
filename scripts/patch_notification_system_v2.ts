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

if (!code.includes("./server/device-sync-v2.js")) {
  code = code.replace(
    "import { registerFcmRoutes } from \"./server/fcm.js\";",
    "import { registerFcmRoutes } from \"./server/fcm.js\";\nimport { registerDeviceSyncV2 } from \"./server/device-sync-v2.js\";"
  );
}

code = code.replace(/\nregisterNotificationSystemV2\(app\);/g, '');
code = code.replace(/\nregisterDeviceSyncV2\(app\);/g, '');

const parserMarker = 'app.use(express.urlencoded({ extended: true, limit: "10mb" }));';
const registrations = `${parserMarker}\nregisterNotificationSystemV2(app);\nregisterDeviceSyncV2(app);`;

if (code.includes(parserMarker)) {
  code = code.replace(parserMarker, registrations);
}

fs.writeFileSync(serverPath, code);
console.log('[notifications-v2] notification + device sync integration active after body parser');

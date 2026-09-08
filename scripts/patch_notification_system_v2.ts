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

code = code.replace(/\nregisterNotificationSystemV2\(app\);/g, '');
const parserMarker = 'app.use(express.urlencoded({ extended: true, limit: "10mb" }));';
if (!code.includes('registerNotificationSystemV2(app);')) {
  code = code.replace(parserMarker, `${parserMarker}\nregisterNotificationSystemV2(app);`);
}

fs.writeFileSync(serverPath, code);
console.log('[notifications-v2] server integration active after body parser');

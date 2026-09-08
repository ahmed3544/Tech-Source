import fs from 'fs';
import path from 'path';

const root = process.cwd();
const serverPath = path.join(root, 'server.ts');
const notificationPath = path.join(root, 'server', 'notification-system-v2.ts');
let code = fs.readFileSync(serverPath, 'utf8');

if (fs.existsSync(notificationPath)) {
  let notificationCode = fs.readFileSync(notificationPath, 'utf8');
  // Never wipe the existing notification table during deployment. Existing rows are
  // already compatible with V2 and the legacy backup recovery fills any missing rows.
  notificationCode = notificationCode.replace(
    "          await db.execute(sql`DELETE FROM notifications`);\n",
    "          // Data-preserving migration: do not delete existing notifications.\n"
  );
  fs.writeFileSync(notificationPath, notificationCode);
}

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

if (!code.includes("./server/legacy-data-recovery.js")) {
  code = code.replace(
    "import { registerFcmRoutes } from \"./server/fcm.js\";",
    "import { registerFcmRoutes } from \"./server/fcm.js\";\nimport { recoverMissingLegacyData } from \"./server/legacy-data-recovery.js\";"
  );
}

code = code.replace(/\nregisterNotificationSystemV2\(app\);/g, '');
code = code.replace(/\nregisterDeviceSyncV2\(app\);/g, '');
code = code.replace(/\n\/\/ Legacy backup recovery middleware[\s\S]*?\n\}\);/g, '');

const parserMarker = 'app.use(express.urlencoded({ extended: true, limit: "10mb" }));';
const registrations = `${parserMarker}\nregisterNotificationSystemV2(app);\n\n// Legacy backup recovery: restore only records missing from the database.\napp.use(async (req: any, _res: any, next: any) => {\n  if (process.env.SUPABASE_DB_URL && (req.path === '/api/data' || req.path === '/api/sync')) {\n    await recoverMissingLegacyData();\n  }\n  next();\n});\n\nregisterDeviceSyncV2(app);`;

if (code.includes(parserMarker)) {
  code = code.replace(parserMarker, registrations);
}

fs.writeFileSync(serverPath, code);
console.log('[notifications-v2] notification + safe legacy recovery + device sync integration active after body parser');

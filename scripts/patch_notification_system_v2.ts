import fs from 'fs';
import path from 'path';

const root = process.cwd();
const serverPath = path.join(root, 'server.ts');
const notificationPath = path.join(root, 'server', 'notification-system-v2.ts');
let code = fs.readFileSync(serverPath, 'utf8');

if (fs.existsSync(notificationPath)) {
  let notificationCode = fs.readFileSync(notificationPath, 'utf8');
  notificationCode = notificationCode.replace(
    "          await db.execute(sql`DELETE FROM notifications`);\n",
    "          // Data-preserving migration: do not delete existing notifications.\n"
  );
  fs.writeFileSync(notificationPath, notificationCode);
}

const fcmImport = 'import { registerFcmRoutes } from "./server/fcm.js";';
if (!code.includes("./server/notification-system-v2.js")) code = code.replace(fcmImport, `${fcmImport}\nimport { registerNotificationSystemV2 } from "./server/notification-system-v2.js";`);
if (!code.includes("./server/device-sync-v2.js")) code = code.replace(fcmImport, `${fcmImport}\nimport { registerDeviceSyncV2 } from "./server/device-sync-v2.js";`);
if (!code.includes("./server/legacy-data-recovery.js")) code = code.replace(fcmImport, `${fcmImport}\nimport { recoverMissingLegacyData } from "./server/legacy-data-recovery.js";`);
if (!code.includes("./server/attendance-realtime.js")) code = code.replace(fcmImport, `${fcmImport}\nimport { registerAttendanceRealtime } from "./server/attendance-realtime.js";`);

code = code.replace(/\nregisterNotificationSystemV2\(app\);/g, '');
code = code.replace(/\nregisterDeviceSyncV2\(app\);/g, '');
code = code.replace(/\nregisterAttendanceRealtime\(app\);/g, '');
code = code.replace(/\n\/\/ Legacy backup recovery middleware[\s\S]*?\n\}\);/g, '');

const parserMarker = 'app.use(express.urlencoded({ extended: true, limit: "10mb" }));';
const registrations = `${parserMarker}\nregisterNotificationSystemV2(app);\n\n// Legacy backup recovery: restore only records missing from the database.\napp.use(async (req: any, _res: any, next: any) => {\n  if ((process.env.DATABASE_URL || process.env.SUPABASE_DB_URL) && (req.path === '/api/data' || req.path === '/api/sync')) {\n    try { await recoverMissingLegacyData(); } catch (error) { console.error('[legacy-recovery]', error); }\n  }\n  next();\n});\n\nregisterDeviceSyncV2(app);\nregisterAttendanceRealtime(app);`;

if (code.includes(parserMarker)) code = code.replace(parserMarker, registrations);
else if (!code.includes('registerAttendanceRealtime(app);')) {
  const exportAnchor = 'export default app;';
  if (code.includes(exportAnchor)) code = code.replace(exportAnchor, `registerAttendanceRealtime(app);\n\n${exportAnchor}`);
}

fs.writeFileSync(serverPath, code);
console.log('[notifications-v2] notification + safe legacy recovery + device sync + authoritative attendance active');

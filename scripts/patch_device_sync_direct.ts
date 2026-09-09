import fs from 'fs';
import path from 'path';

const root = process.cwd();
const serverPath = path.join(root, 'server.ts');
let code = fs.readFileSync(serverPath, 'utf8');

const fcmImport = 'import { registerFcmRoutes } from "./server/fcm.js";';
const deviceImport = 'import { registerDeviceSyncV2 } from "./server/device-sync-v2.js";';
const recoveryImport = 'import { recoverMissingLegacyData } from "./server/legacy-data-recovery.js";';

if (!code.includes(deviceImport)) {
  if (code.includes(fcmImport)) code = code.replace(fcmImport, `${fcmImport}\n${deviceImport}`);
  else code = `${deviceImport}\n${code}`;
}
if (!code.includes(recoveryImport)) {
  if (code.includes(deviceImport)) code = code.replace(deviceImport, `${deviceImport}\n${recoveryImport}`);
  else code = `${recoveryImport}\n${code}`;
}

code = code.replace(/\nregisterDeviceSyncV2\(app\);/g, '');
code = code.replace(/\n\/\/ Legacy backup recovery middleware[\s\S]*?\nregisterDeviceSyncV2\(app\);/g, '');

const parserMarker = 'app.use(express.urlencoded({ extended: true, limit: "10mb" }));';
if (code.includes(parserMarker)) {
  const recovery = `${parserMarker}\n\n// Legacy backup recovery: only restores records that are missing from the DB.\napp.use(async (req: any, _res: any, next: any) => {\n  if ((process.env.DATABASE_URL || process.env.SUPABASE_DB_URL) && (req.path === '/api/data' || req.path === '/api/sync')) {\n    await recoverMissingLegacyData();\n  }\n  next();\n});\n\n// Direct cross-device synchronization middleware.\nregisterDeviceSyncV2(app);`;
  code = code.replace(parserMarker, recovery);
} else {
  throw new Error('[device-sync-direct] body parser marker not found in server.ts');
}

fs.writeFileSync(serverPath, code);
console.log('[device-sync-direct] cross-device synchronization + safe legacy recovery active after body parser');

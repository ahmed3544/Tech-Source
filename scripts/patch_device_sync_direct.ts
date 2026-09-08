import fs from 'fs';
import path from 'path';

const root = process.cwd();
const serverPath = path.join(root, 'server.ts');
let code = fs.readFileSync(serverPath, 'utf8');

const fcmImport = 'import { registerFcmRoutes } from "./server/fcm.js";';
const deviceImport = 'import { registerDeviceSyncV2 } from "./server/device-sync-v2.js";';

if (!code.includes(deviceImport)) {
  if (code.includes(fcmImport)) {
    code = code.replace(fcmImport, `${fcmImport}\n${deviceImport}`);
  } else {
    code = `${deviceImport}\n${code}`;
  }
}

code = code.replace(/\nregisterDeviceSyncV2\(app\);/g, '');

const parserMarker = 'app.use(express.urlencoded({ extended: true, limit: "10mb" }));';
if (code.includes(parserMarker)) {
  code = code.replace(
    parserMarker,
    `${parserMarker}\n\n// Direct cross-device synchronization middleware. Keep it independent from notifications.\nregisterDeviceSyncV2(app);`
  );
} else {
  throw new Error('[device-sync-direct] body parser marker not found in server.ts');
}

fs.writeFileSync(serverPath, code);
console.log('[device-sync-direct] cross-device sync registered directly after body parser');

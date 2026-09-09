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

// Remove previous registrations/recovery blocks so the patch stays idempotent.
code = code.replace(/\nregisterDeviceSyncV2\(app\);/g, '');
code = code.replace(/\n\/\/ Legacy backup recovery:[\s\S]*?\n\}\);\n/g, '\n');

// Find an existing Express body-parser middleware in any formatting, or add
// standard JSON + urlencoded parsers immediately after app creation if none exists.
const parserRegex = /app\.use\(express\.(?:json|urlencoded)\([\s\S]*?\)\);/g;
const parserMatches = [...code.matchAll(parserRegex)];

let insertAt = -1;
if (parserMatches.length) {
  const last = parserMatches[parserMatches.length - 1];
  insertAt = (last.index ?? 0) + last[0].length;
} else {
  const appMarker = 'const app = express();';
  const appIndex = code.indexOf(appMarker);
  if (appIndex < 0) throw new Error('[device-sync-direct] Express app marker not found in server.ts');
  insertAt = appIndex + appMarker.length;
  const parsers = `\napp.use(express.json({ limit: "10mb" }));\napp.use(express.urlencoded({ extended: true, limit: "10mb" }));`;
  code = code.slice(0, insertAt) + parsers + code.slice(insertAt);
  insertAt += parsers.length;
}

const registration = `\n\n// Legacy backup recovery: only restores records that are missing from the DB.\napp.use(async (req: any, _res: any, next: any) => {\n  if ((process.env.DATABASE_URL || process.env.SUPABASE_DB_URL) && (req.path === '/api/data' || req.path === '/api/sync')) {\n    await recoverMissingLegacyData();\n  }\n  next();\n});\n\n// Direct cross-device synchronization middleware.\nregisterDeviceSyncV2(app);`;

code = code.slice(0, insertAt) + registration + code.slice(insertAt);

fs.writeFileSync(serverPath, code);
console.log('[device-sync-direct] cross-device synchronization + safe legacy recovery active after body parser');

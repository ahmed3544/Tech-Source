import fs from 'fs';

const appPath = 'src/App.tsx';
if (fs.existsSync(appPath)) {
  let code = fs.readFileSync(appPath, 'utf8');
  if (!code.includes("./firebase-messaging")) {
    code = code.replace(
      "import { WeeklyShiftSchedule } from './components/WeeklyShiftSchedule';",
      "import { WeeklyShiftSchedule } from './components/WeeklyShiftSchedule';\nimport { registerPushNotifications } from './firebase-messaging';"
    );
  }
  if (!code.includes('registerPushNotifications(currentUser?.id)')) {
    const marker = '  /* =========================================================\n     KEEP REFS UPDATED';
    if (code.includes(marker)) {
      code = code.replace(marker, "  useEffect(() => {\n    if (currentUser?.id) registerPushNotifications(currentUser.id);\n  }, [currentUser?.id]);\n\n" + marker);
    }
  }
  code = code.replace(/(\n\s*\| 'notifications'){2,}/g, '$1');
  fs.writeFileSync(appPath, code);
}

const headerPath = 'src/components/Header.tsx';
if (fs.existsSync(headerPath)) {
  let code = fs.readFileSync(headerPath, 'utf8');
  code = code.replace(/(\n\s*\| 'notifications'){2,}/g, '$1');
  code = code.replace(/(\n\s*onOpenNotificationsPage\?: \(\) => void;){2,}/g, '$1');
  fs.writeFileSync(headerPath, code);
}

const serverPath = 'server.ts';
if (fs.existsSync(serverPath)) {
  let code = fs.readFileSync(serverPath, 'utf8');
  if (!code.includes('./server/fcm.js')) {
    code = code.replace(
      'import * as schema from "./src/db/schema.js";',
      'import * as schema from "./src/db/schema.js";\nimport { registerFcmRoutes } from "./server/fcm.js";'
    );
  }
  if (!code.includes('registerFcmRoutes(app)')) {
    code = code.replace('const app = express();', 'const app = express();\nregisterFcmRoutes(app);');
  }
  fs.writeFileSync(serverPath, code);
}

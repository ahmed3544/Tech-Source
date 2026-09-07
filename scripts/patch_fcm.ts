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
      'import * as schema from "./src/db/schema.js";\nimport { registerFcmRoutes, sendPushToEmployee } from "./server/fcm.js";'
    );
  } else if (!code.includes('sendPushToEmployee')) {
    code = code.replace(
      'import { registerFcmRoutes } from "./server/fcm.js";',
      'import { registerFcmRoutes, sendPushToEmployee } from "./server/fcm.js";'
    );
  }
  if (!code.includes('registerFcmRoutes(app)')) {
    code = code.replace('const app = express();', 'const app = express();\nregisterFcmRoutes(app);');
  }

  // Bridge the existing notification sync flow to real FCM delivery.
  // We detect notifications that were not already in the database before /api/sync,
  // let the normal sync handler persist them, then send a push to each recipient.
  if (!code.includes('[FCM] sync push bridge')) {
    const marker = 'app.use(express.urlencoded({ extended: true, limit: "10mb" }));';
    const bridge = `

// [FCM] sync push bridge: deliver newly-created in-app notifications outside the app.
app.use(async (req, res, next) => {
  if (req.method !== 'POST' || !req.path.endsWith('/api/sync') || !Array.isArray(req.body?.notifications)) {
    return next();
  }

  const incoming = req.body.notifications.filter((n: any) => n?.id && n?.recipientId && n?.title && n?.message);
  if (!incoming.length) return next();

  let existingIds = new Set<string>();
  try {
    const rows = await db.select({ id: schema.notifications.id }).from(schema.notifications);
    existingIds = new Set(rows.map((r: any) => String(r.id)));
  } catch (error) {
    console.warn('[FCM] unable to inspect existing notifications', error);
  }

  const newNotifications = incoming.filter((n: any) => !existingIds.has(String(n.id)));
  res.on('finish', () => {
    if (res.statusCode < 200 || res.statusCode >= 300) return;
    void Promise.allSettled(
      newNotifications.map((n: any) =>
        sendPushToEmployee(String(n.recipientId), String(n.title), String(n.message), {
          notificationId: String(n.id),
          type: String(n.type || 'admin_notice'),
        })
      )
    ).then((results) => {
      const sent = results.filter((r: any) => r.status === 'fulfilled' && Number(r.value?.sent || 0) > 0).length;
      if (newNotifications.length) console.info('[FCM] sync push bridge', { created: newNotifications.length, delivered: sent });
    });
  });

  return next();
});`;
    if (code.includes(marker)) {
      code = code.replace(marker, marker + bridge);
    }
  }

  fs.writeFileSync(serverPath, code);
}

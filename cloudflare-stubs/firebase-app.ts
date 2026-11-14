// Wrangler alias stub for firebase-admin/app.
//
// firebase-admin depends on native gRPC transport, which cannot run in the
// Workers runtime and would push the bundle past the free-plan size limit.
// server/fcm.ts degrades gracefully: adminMessaging() checks
// FIREBASE_SERVICE_ACCOUNT_JSON first and, even if it is set, a null
// messaging handle makes sendPushToEmployee() return { sent: 0,
// configured: false }. Push delivery is therefore disabled on Workers while
// the /api/push/register token-store route keeps working against the
// database.
export const getApps = (): any[] => [];
export const cert = (credential?: unknown): any => credential ?? null;
export const initializeApp = (): any => null;

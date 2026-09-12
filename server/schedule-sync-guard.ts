const isSyncPath = (req:any) => ['/api/sync','/sync'].includes(String(req.path || req.url || '').split('?')[0].replace(/\/+$/,'') || '/');

/**
 * Schedule sync is handled by device-sync-v2.ts.
 * Keep this middleware as a pass-through so the same payload is not written
 * twice (or removed from req.body before device-sync-v2 can persist it).
 */
export function registerScheduleSyncGuard(app:any) {
  app.use(async (req:any, _res:any, next:any) => {
    if (req.method === 'POST' && isSyncPath(req)) {
      return next();
    }
    return next();
  });
}

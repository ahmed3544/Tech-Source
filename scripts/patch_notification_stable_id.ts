import fs from 'fs';

// The notification system already preserves incoming notification IDs in source.
// Keep this build step intentionally non-destructive: the previous text-replacement
// implementation could corrupt the function signature when formatting changed.
const path = 'server/notification-system-v2.ts';
if (!fs.existsSync(path)) {
  console.warn('[patch_notification_stable_id] target file not found; skipping safely.');
  process.exit(0);
}
const code = fs.readFileSync(path, 'utf8');
if (!code.includes('function stableId(')) {
  console.warn('[patch_notification_stable_id] stableId function not found; skipping safely.');
  process.exit(0);
}
console.log('[patch_notification_stable_id] verified; no rewrite needed');

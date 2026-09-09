import fs from 'fs';
import path from 'path';

const serverPath = path.join(process.cwd(), 'server.ts');
let code = fs.readFileSync(serverPath, 'utf8');

const oldGuard = `  if (\n  Number.isFinite(existingTime) &&\n  Number.isFinite(incomingTime) &&\n  incomingTime <= existingTime\n) {`;

const newGuard = `  // A pending request may be finalized by an approval/rejection
  // even when the client clock is behind the server clock.
  // Once finalized, the timestamp protection still prevents
  // an older final decision from overwriting a newer one.
  const isFinalizingPending =
    currentStatus === "pending" &&
    (
      incomingStatus === "approved" ||
      incomingStatus === "rejected"
    );

  if (
    !isFinalizingPending &&
    Number.isFinite(existingTime) &&
    Number.isFinite(incomingTime) &&
    incomingTime <= existingTime
  ) {`;

if (code.includes('const isFinalizingPending =')) {
  console.log('Leave status protection already patched.');
  process.exit(0);
}

if (!code.includes(oldGuard)) {
  // The server implementation has already moved/changed this guard.
  // Do not fail the entire production build just because this optional
  // compatibility patch no longer matches the current server source.
  console.warn('[patch_leave_status] leave timestamp guard not found; skipping safely.');
  process.exit(0);
}

code = code.replace(oldGuard, newGuard);
fs.writeFileSync(serverPath, code, 'utf8');
console.log('Patched leave approval/rejection timestamp handling.');

import fs from 'fs';
import path from 'path';

const serverPath = path.join(process.cwd(), 'server.ts');
let code = fs.readFileSync(serverPath, 'utf8');

const oldGuard = `  if (\n  Number.isFinite(existingTime) &&\n  Number.isFinite(incomingTime) &&\n  incomingTime <= existingTime\n) {`;

const newGuard = `  // A pending request may be finalized by an approval/rejection\n  // even when the client clock is behind the server clock.\n  // Once finalized, the timestamp protection still prevents\n  // an older final decision from overwriting a newer one.\n  const isFinalizingPending =\n    currentStatus === "pending" &&\n    (\n      incomingStatus === "approved" ||\n      incomingStatus === "rejected"\n    );\n\n  if (\n    !isFinalizingPending &&\n    Number.isFinite(existingTime) &&\n    Number.isFinite(incomingTime) &&\n    incomingTime <= existingTime\n  ) {`;

if (code.includes('const isFinalizingPending =')) {
  console.log('Leave status protection already patched.');
  process.exit(0);
}

if (!code.includes(oldGuard)) {
  throw new Error('Could not find the leave timestamp guard in server.ts');
}

code = code.replace(oldGuard, newGuard);
fs.writeFileSync(serverPath, code, 'utf8');
console.log('Patched leave approval/rejection timestamp handling.');

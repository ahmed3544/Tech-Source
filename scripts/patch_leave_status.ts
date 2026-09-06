import fs from 'fs';
import path from 'path';

const serverPath = path.join(process.cwd(), 'server.ts');
let code = fs.readFileSync(serverPath, 'utf8');

const oldBlock = `  if (\n  Number.isFinite(existingTime) &&\n  Number.isFinite(incomingTime) &&\n  incomingTime <= existingTime\n) {\n  console.log("BLOCKED OLD LEAVE:",\n    id,\n    "existing:",\n    (existing as any).updatedAt,\n    "incoming:",\n    incoming.updatedAt\n  );\n\n  return;\n}`;

const newBlock = `  // A pending request may be finalized by an approval/rejection\n  // even when the client clock is behind the server clock.\n  // Once finalized, the timestamp protection below still prevents\n  // an older final decision from overwriting a newer one.\n  const isFinalizingPending =\n    currentStatus === "pending" &&\n    (\n      incomingStatus === "approved" ||\n      incomingStatus === "rejected"\n    );\n\n  if (\n    !isFinalizingPending &&\n    Number.isFinite(existingTime) &&\n    Number.isFinite(incomingTime) &&\n    incomingTime <= existingTime\n  ) {\n    console.log(\n      "BLOCKED OLD LEAVE:",\n      id,\n      "existing:",\n      (existing as any).updatedAt,\n      "incoming:",\n      incoming.updatedAt\n    );\n\n    return;\n  }`;

if (code.includes(newBlock)) {
  console.log('Leave status protection already patched.');
  process.exit(0);
}

if (!code.includes(oldBlock)) {
  throw new Error('Could not find the leave timestamp protection block in server.ts');
}

code = code.replace(oldBlock, newBlock);
fs.writeFileSync(serverPath, code, 'utf8');
console.log('Patched leave approval/rejection timestamp handling.');

const fs = require('fs');
const path = 'src/App.tsx';
let code = fs.readFileSync(path, 'utf8');

const marker = `          /*
           * A local mutation happened while this pull
           * was in flight, so the response cannot contain it.
           *
           * This check does not depend on the client and
           * server clocks being in sync.
           */`;

if (!code.includes(marker)) {
  console.warn('[patch_sync_pull_guard_v1] marker not found; skipping');
  process.exit(0);
}

const guard = `          /*
           * A previous mutation is waiting for server confirmation.
           * Never let a stale /api/data snapshot overwrite that local
           * mutation during the retry window.
           */
          try {
            const pendingRaw = localStorage.getItem('attendance_pending_server_sync');
            if (pendingRaw) {
              return;
            }
          } catch {}

`;

if (code.includes("localStorage.getItem('attendance_pending_server_sync')")) {
  console.log('[patch_sync_pull_guard_v1] already applied');
  process.exit(0);
}

code = code.replace(marker, guard + marker);
fs.writeFileSync(path, code);
console.log('[patch_sync_pull_guard_v1] applied');

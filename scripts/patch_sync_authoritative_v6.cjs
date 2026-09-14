const fs = require('fs');
const path = require('path');

function read(file) { return fs.readFileSync(file, 'utf8'); }
function write(file, text) { fs.writeFileSync(file, text, 'utf8'); }
function patch(file, transforms) {
  const before = read(file);
  let after = before;
  for (const [label, fn] of transforms) {
    const next = fn(after);
    if (next === after) console.log(`[sync-v6] ${label}: no change`);
    else console.log(`[sync-v6] ${label}: applied`);
    after = next;
  }
  if (after !== before) write(file, after);
}

const app = path.resolve('src/App.tsx');
patch(app, [
  ['disable generic schedule payload', (s) => s.replace(/\n\s*if \(overrides\?\.dailyShiftAssignments !== undefined\) \{\s*payload\.dailyShiftAssignments = overrides\.dailyShiftAssignments;\s*\}/, '')],
  ['route local schedule save to direct endpoint', (s) => s.replace(/void pushSync\(\{ dailyShiftAssignments: next \}\);/, "void fetch('/api/schedule-sync', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' }, body: JSON.stringify({ dailyShiftAssignments: next }), cache: 'no-store' }).then((res) => { if (!res.ok) throw new Error(`Schedule sync failed: ${res.status}`); return res.json(); }).catch((error) => console.warn('[schedule-sync] failed:', error));")],
  ['allow recovery after failed generic sync', (s) => s.replace(/(} catch \(error: any\) \{\s*\n\s*if \(\s*error\?\.name\s*===\s*'AbortError'\s*\) \{)/, "} catch (error: any) {\n\n    // A failed mutation must not permanently block /api/data pulls.\n    // The server is authoritative until the mutation is successfully retried.\n    lastLocalUpdateRef.current = 0;\n\n    $1")]
]);

const swap = path.resolve('src/components/ShiftSwapPanel.tsx');
patch(swap, [
  ['route swap schedule updates to direct endpoint', (s) => s.replace(/await fetch\('\/api\/sync', \{\s*method: 'POST',\s*headers: \{ 'Content-Type': 'application\/json' \},\s*body: JSON\.stringify\(\{ shiftSwapRequests: nextRequests, notifications: nextNotifications, \(\.\.\.\(nextAssignments !== assignments \? \{ dailyShiftAssignments: nextAssignments \} : \{\}\)\) \}\)\s*\}\);/, "await fetch('/api/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ shiftSwapRequests: nextRequests, notifications: nextNotifications }) });\n      if (nextAssignments !== assignments) {\n        const scheduleRes = await fetch('/api/schedule-sync', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' }, body: JSON.stringify({ dailyShiftAssignments: nextAssignments }), cache: 'no-store' });\n        if (!scheduleRes.ok) throw new Error(`Schedule sync failed: ${scheduleRes.status}`);\n      }")]
]);

console.log('[sync-v6] authoritative client sync patch complete');

// Reproduce "بعد الاسواب مايتعمل الشفت مش بيتبدل": approved swap must swap
// the two employees' dailyShiftAssignments rows. Mirrors the FIXED
// ShiftSwapPanel.review(): swapped rows go through the permission-checked
// POST /api/schedule-sync (NOT /api/sync, which strips schedule rows —
// server/schedule-sync-guard.ts).
const BASE = process.env.BASE || 'http://localhost:3112';
const D = '2026-10-30'; // Friday of the demo week

// Manager auth (demo admin EMP002/1234) — same headers the browser sends.
const authHeaders = { 'Content-Type': 'application/json', Accept: 'application/json', 'x-auth-employee-id': 'emp-002', 'x-auth-pin': '1234' };

const j = async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) });
const post = (path, body, headers = {}) => fetch(BASE + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) }).then(j);
const get = (path) => fetch(BASE + path).then(j);

const stamp = (o = 0) => new Date(Date.now() + o).toISOString();
const results = [];
const check = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? '✓' : '✗'} ${name}${extra ? ' — ' + extra : ''}`); };

// ---- pick two seeded employees ----
const data0 = (await get('/api/data')).body;
const emps = (data0.employees || []).filter((e) => e.status === 'active').slice(0, 2);
if (emps.length < 2) { console.log('FATAL: need 2 employees'); process.exit(2); }
const [A, B] = emps;
console.log(`employees: A=${A.id} (${A.nameEn}) | B=${B.id} (${B.nameEn})`);

// ---- seed: A works morning shift, B is OFF on D (via the dedicated writer) ----
const seedRows = [
  { employeeId: A.id, date: D, shiftId: 'shift-1', isOffDay: false, updatedAt: stamp() },
  { employeeId: B.id, date: D, shiftId: '', isOffDay: true, updatedAt: stamp() },
];
const seedRes = await post('/api/schedule-sync', { dailyShiftAssignments: seedRows }, authHeaders);
check('seed assignments via /api/schedule-sync', seedRes.status === 200 && seedRes.body?.success === true, `status=${seedRes.status}`);

let data1 = (await get('/api/data')).body;
const rowA = (data1.dailyShiftAssignments || []).find((x) => x.employeeId === A.id && x.date === D);
const rowB = (data1.dailyShiftAssignments || []).find((x) => x.employeeId === B.id && x.date === D);
check('A row exists (working)', Boolean(rowA) && !rowA.isOffDay, JSON.stringify(rowA));
check('B row exists (OFF)', Boolean(rowB) && rowB.isOffDay, JSON.stringify(rowB));

// ---- employee submits swap (awaiting_target) — exactly like ShiftSwapPanel.submit ----
const now1 = stamp();
const swap = {
  id: `swap-test-${Date.now()}`,
  requesterId: B.id, targetEmployeeId: A.id,
  date: D,
  requesterShiftId: (rowB || {}).shiftId ?? '',
  targetShiftId: (rowA || {}).shiftId ?? 'shift-1',
  requesterWasOff: true, targetWasOff: false,
  status: 'awaiting_target', createdAt: now1,
};
const subRes = await post('/api/sync', { shiftSwapRequests: [swap], notifications: [] });
check('swap submitted (awaiting_target) persisted', subRes.status === 200 && (subRes.body.shiftSwapRequests || []).some((r) => r.id === swap.id));

// ---- target accepts → pending ----
const now2 = stamp();
const swapPending = { ...swap, status: 'pending', targetRespondedAt: now2, updatedAt: now2 };
const accRes = await post('/api/sync', { shiftSwapRequests: [swapPending], notifications: [] });
check('swap accepted (pending) persisted', accRes.status === 200 && (accRes.body.shiftSwapRequests || []).some((r) => r.id === swap.id && r.status === 'pending'));

// ---- LEADER APPROVAL — exact ShiftSwapPanel.review() logic ----
const key = (e, d) => `${e}|${d}`;
const data2 = (await get('/api/data')).body; // leader's fresh assignments
const assignments = data2.dailyShiftAssignments || [];
const nextAssignments = [...assignments];
const a = nextAssignments.findIndex((x) => key(x.employeeId, x.date) === key(swap.requesterId, swap.date));
const b = nextAssignments.findIndex((x) => key(x.employeeId, x.date) === key(swap.targetEmployeeId, swap.date));
const requesterCurrent = a >= 0 ? nextAssignments[a] : undefined;
const targetCurrent = b >= 0 ? nextAssignments[b] : undefined;
console.log(`  found rows: a=${a}, b=${b}`);
const now3 = stamp();
if (!requesterCurrent || !targetCurrent) {
  check('approval found both rows', false, 'silent no-op path hit (requesterCurrent/targetCurrent missing)');
} else {
  nextAssignments[a] = { ...requesterCurrent, shiftId: swap.targetShiftId, isOffDay: swap.targetWasOff ?? ['__OFF__', 'OFF', 'off'].includes(String(swap.targetShiftId)), assignedBy: 'emp-002-test', updatedAt: now3 };
  nextAssignments[b] = { ...targetCurrent, shiftId: swap.requesterShiftId, isOffDay: swap.requesterWasOff ?? ['__OFF__', 'OFF', 'off'].includes(String(swap.requesterShiftId)), assignedBy: 'emp-002-test', updatedAt: now3 };
  const swapApproved = { ...swapPending, status: 'approved', reviewedBy: 'emp-002-test', reviewedAt: now3 };
  // Fixed client behavior: swapped rows via /api/schedule-sync with manager auth.
  const swapFix = await post('/api/schedule-sync', { dailyShiftAssignments: [nextAssignments[a], nextAssignments[b]], syncTimestamp: now3, source: 'shift-swap' }, authHeaders);
  check('swapped rows accepted by /api/schedule-sync (manager auth)', swapFix.status === 200 && swapFix.body?.success === true, `status=${swapFix.status} ${JSON.stringify(swapFix.body).slice(0, 160)}`);
  const apprRes = await post('/api/sync', { shiftSwapRequests: [swapApproved], notifications: [] });
  check('approval POST /api/sync 200 (request status only)', apprRes.status === 200, `status=${apprRes.status}`);

  // ---- verify the swap LANDED ----
  const data3 = (await get('/api/data')).body;
  const afterA = (data3.dailyShiftAssignments || []).find((x) => x.employeeId === A.id && x.date === D);
  const afterB = (data3.dailyShiftAssignments || []).find((x) => x.employeeId === B.id && x.date === D);
  check('A (was working) is now OFF', afterA && afterA.isOffDay === true, JSON.stringify(afterA));
  check('B (was OFF) now works morning shift', afterB && !afterB.isOffDay && afterB.shiftId === 'shift-1', JSON.stringify(afterB));
}

// ---- cleanup: remove the test rows (back to OFF for both is fine; just delete via clear-less overwrite not supported → restore originals) ----
console.log(`\n===== SWAP APPROVAL REPRO: ${results.filter(Boolean).length}/${results.length} passed =====`);
process.exit(results.every(Boolean) ? 0 : 1);

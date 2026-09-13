const fs = require('fs');

// Final persistence guard. This runs LAST in prebuild so later sync patches
// cannot re-introduce a stale-snapshot overwrite.
const appPath = 'src/App.tsx';
let app = fs.readFileSync(appPath, 'utf8');

const marker = '/* PERSISTENCE_FINAL_V1 */';
if (!app.includes(marker)) {
  const helperAnchor = '/* =========================================================\n     CENTRAL SERVER PULL\n     ========================================================= */';
  const helper = `/* PERSISTENCE_FINAL_V1 */\nfunction mergeLeaveSnapshotPreservingPending(local: LeaveRequest[] = [], incoming: LeaveRequest[] = []): LeaveRequest[] {\n  const server = Array.isArray(incoming) ? incoming : [];\n  const ids = new Set(server.map((x: LeaveRequest) => String(x?.id || '')).filter(Boolean));\n  const result = server.map((x: LeaveRequest) => ({ ...x }));\n  const now = Date.now();\n  for (const item of Array.isArray(local) ? local : []) {\n    if (!item?.id || ids.has(String(item.id)) || item.status !== 'pending') continue;\n    const created = Date.parse(String(item.createdAt || ''));\n    if (!Number.isFinite(created) || now - created <= 7 * 24 * 60 * 60 * 1000) result.push({ ...item });\n  }\n  return result;\n}\nfunction mergeScheduleSnapshotPreservingLocal(local: DailyShiftAssignment[] = [], incoming: DailyShiftAssignment[] = []): DailyShiftAssignment[] {\n  const server = Array.isArray(incoming) ? incoming : [];\n  if (server.length) return server;\n  return Array.isArray(local) ? local : [];\n}\n\n`;
  const at = app.indexOf(helperAnchor);
  if (at >= 0) app = app.slice(0, at) + helper + app.slice(at);

  // Replace every authoritative leave snapshot handler produced by the older patches.
  app = app.replace(
    /const serverLeaves = applyPendingLeaveDecisions\(data\.leaveRequests\);\s*leaveRequestsRef\.current = serverLeaves;\s*setLeaveRequests\(serverLeaves\);/g,
    `const mergedLeaves = mergeLeaveSnapshotPreservingPending(leaveRequestsRef.current, data.leaveRequests);\n          const serverLeaves = applyPendingLeaveDecisions(mergedLeaves);\n          leaveRequestsRef.current = serverLeaves;\n          setLeaveRequests(serverLeaves);`
  );

  // Guard schedule reload: an empty/stale server snapshot must never erase a schedule
  // that is still present locally. A non-empty server snapshot remains authoritative.
  app = app.replace(
    /if \(Array\.isArray\(data\.dailyShiftAssignments\)\) \{\s*setDailyShiftAssignments\(data\.dailyShiftAssignments\);\s*try \{ localStorage\.setItem\('daily_shift_assignments', JSON\.stringify\(data\.dailyShiftAssignments\)\); \} catch \{\}\s*\}/g,
    `if (Array.isArray(data.dailyShiftAssignments)) {\n          const localAssignments = Array.isArray(dailyShiftAssignments) ? dailyShiftAssignments : [];\n          const stableAssignments = mergeScheduleSnapshotPreservingLocal(localAssignments, data.dailyShiftAssignments as DailyShiftAssignment[]);\n          setDailyShiftAssignments(stableAssignments);\n          try { localStorage.setItem('daily_shift_assignments', JSON.stringify(stableAssignments)); } catch {}\n          if (!data.dailyShiftAssignments.length && localAssignments.length && !syncInFlightRef.current) {\n            void pushSync({ dailyShiftAssignments: localAssignments });\n          }\n        }`
  );

  fs.writeFileSync(appPath, app, 'utf8');
}

// Make newly-created leave/permission requests carry a real mutation timestamp.
const portalPath = 'src/components/EmployeePortal.tsx';
let portal = fs.readFileSync(portalPath, 'utf8');
if (!portal.includes('/* PERSISTENCE_FINAL_V1 */')) {
  portal = portal.replace(
    /status: 'pending',\n\s*createdAt: todayStr,/g,
    `status: 'pending',\n      createdAt: todayStr,\n      updatedAt: new Date().toISOString(),`
  );
  portal += '\n/* PERSISTENCE_FINAL_V1 */\n';
  fs.writeFileSync(portalPath, portal, 'utf8');
}

console.log('[patch_persistence_final_v1] applied');

import fs from 'fs';

const path = 'src/App.tsx';
let code = fs.readFileSync(path, 'utf8');

const fetchMarker = `      const data =\n        await res.json();`;
const authoritativeMarker = '/* DEVICE_SYNC_AUTHORITATIVE_SNAPSHOT_V2 */';

// Build patches run sequentially and may change the surrounding comments/formatting.
// Match only the stable fetch statement so the sync patch remains idempotent.
if (!code.includes(authoritativeMarker)) {
  const at = code.indexOf(fetchMarker);
  if (at === -1) {
    console.warn('[patch_client_authoritative_sync] sync response marker not found; skipping safely.');
    process.exit(0);
  }

  const insertion = `\n\n      ${authoritativeMarker}\n      /*\n       * The POST /api/sync response is the authoritative database snapshot.\n       * Apply it immediately so this device never waits for the next poll and\n       * never lets stale localStorage overwrite a newer server record.\n       */\n      if (data?.success) {\n        if (Array.isArray(data.attendanceRecords)) {\n          const serverAttendance = data.attendanceRecords\n            .map(ensureSanitizedRecord)\n            .filter((r: AttendanceRecord) => r && r.date);\n          attendanceRecordsRef.current = serverAttendance;\n          setAttendanceRecords(serverAttendance);\n          try { localStorage.setItem('attendance_records', JSON.stringify(serverAttendance)); } catch {}\n        }\n        if (Array.isArray(data.employees)) {\n          employeesRef.current = data.employees;\n          setEmployees(data.employees);\n          try { localStorage.setItem('attendance_employees', JSON.stringify(data.employees)); } catch {}\n        }\n        if (Array.isArray(data.leaveRequests)) {\n          const serverLeaves = applyPendingLeaveDecisions(data.leaveRequests);\n          leaveRequestsRef.current = serverLeaves;\n          setLeaveRequests(serverLeaves);\n          try { localStorage.setItem('attendance_leaves', JSON.stringify(serverLeaves)); } catch {}\n        }\n        if (Array.isArray(data.notifications)) {\n          notificationsRef.current = data.notifications;\n          setNotifications(data.notifications);\n          try { localStorage.setItem('notifications', JSON.stringify(data.notifications)); } catch {}\n        }\n        if (Array.isArray(data.shifts)) {\n          setShifts(data.shifts);\n          try { localStorage.setItem('attendance_shifts', JSON.stringify(data.shifts)); } catch {}\n        }\n        if (Array.isArray(data.dailyShiftAssignments)) {\n          setDailyShiftAssignments(data.dailyShiftAssignments);\n          try { localStorage.setItem('daily_shift_assignments', JSON.stringify(data.dailyShiftAssignments)); } catch {}\n        }\n      }`;

  code = code.slice(0, at + fetchMarker.length) + insertion + code.slice(at + fetchMarker.length);
}

// The authoritative snapshot is already applied above; do not immediately issue
// a second request from the same successful sync path. Polling remains the safety net.
code = code.replace(
  /\n\s*if \(\s*pullFromServerRef\.current\s*\)\s*\{\s*void pullFromServerRef\.current\(\);\s*\}/g,
  '\n      // Authoritative snapshot already applied; polling remains as a safety net.'
);

fs.writeFileSync(path, code);
console.log('[patch_client_authoritative_sync] applied');

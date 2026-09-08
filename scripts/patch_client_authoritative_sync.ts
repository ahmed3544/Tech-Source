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

  const insertion = `

      ${authoritativeMarker}
      /*
       * The POST /api/sync response is the authoritative database snapshot.
       * Apply it immediately so this device never waits for the next poll and
       * never lets stale localStorage overwrite a newer server record.
       */
      if (data?.success) {
        if (Array.isArray(data.attendanceRecords)) {
          const serverAttendance = data.attendanceRecords
            .map(ensureSanitizedRecord)
            .filter((r: AttendanceRecord) => r && r.date);
          attendanceRecordsRef.current = serverAttendance;
          setAttendanceRecords(serverAttendance);
          try { localStorage.setItem('attendance_records', JSON.stringify(serverAttendance)); } catch {}
        }
        if (Array.isArray(data.employees)) {
          employeesRef.current = data.employees;
          setEmployees(data.employees);
          try { localStorage.setItem('attendance_employees', JSON.stringify(data.employees)); } catch {}
        }
        if (Array.isArray(data.leaveRequests)) {
          const serverLeaves = applyPendingLeaveDecisions(data.leaveRequests);
          leaveRequestsRef.current = serverLeaves;
          setLeaveRequests(serverLeaves);
          try { localStorage.setItem('attendance_leaves', JSON.stringify(serverLeaves)); } catch {}
        }
        if (Array.isArray(data.notifications)) {
          notificationsRef.current = data.notifications;
          setNotifications(data.notifications);
          try { localStorage.setItem('notifications', JSON.stringify(data.notifications)); } catch {}
        }
        if (Array.isArray(data.shifts)) {
          setShifts(data.shifts);
          try { localStorage.setItem('attendance_shifts', JSON.stringify(data.shifts)); } catch {}
        }
        if (Array.isArray(data.dailyShiftAssignments)) {
          setDailyShiftAssignments(data.dailyShiftAssignments);
          try { localStorage.setItem('daily_shift_assignments', JSON.stringify(data.dailyShiftAssignments)); } catch {}
        }
      }`;

  code = code.slice(0, at + fetchMarker.length) + insertion + code.slice(at + fetchMarker.length);
}

// The authoritative snapshot is already applied above; do not immediately issue
// a second request from the same successful sync path. Polling remains the safety net.
code = code.replace(
  /\n\s*if \(\s*pullFromServerRef\.current\s*\)\s*\{\s*void pullFromServerRef\.current\(\);\s*\}/g,
  '\n      // Authoritative snapshot already applied; polling remains as a safety net.'
);

// Reduce background polling from 1.5s to 15s to prevent unnecessary egress.
// Attendance actions still update immediately from the authoritative /api/sync response,
// and a focus/visibility refresh remains the fast path when a user returns to the app.
code = code.replace(
  /window\.setInterval\(\s*pullFromServer,\s*1500\s*\)/g,
  'window.setInterval(\n        pullFromServer,\n        15000\n      )'
);

fs.writeFileSync(path, code);
console.log('[patch_client_authoritative_sync] applied');

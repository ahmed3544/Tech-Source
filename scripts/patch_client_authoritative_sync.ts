import fs from 'fs';

const path = 'src/App.tsx';
let code = fs.readFileSync(path, 'utf8');

const fetchMarker = [
  '      const data =',
  '        await res.json();'
].join('\n');

const authoritativeMarker = '/* DEVICE_SYNC_AUTHORITATIVE_SNAPSHOT_V3 */';

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
       * Apply it immediately, including the logged-in user's canonical employee
       * row. This is important after migrating from legacy shift ids such as
       * shift-1 to the real Neon shift id.
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
          if (currentUser?.id) {
            const canonicalUser = data.employees.find((e: Employee) => e?.id === currentUser.id);
            if (canonicalUser) {
              setCurrentUser(canonicalUser);
              try { localStorage.setItem('logged_in_user', JSON.stringify(canonicalUser)); } catch {}
            }
          }
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

// Canonicalize employee shift ids on every authoritative response, even if the
// V3 block was already injected into App.tsx by an earlier build.
const employeeStateMarker = `        employeesRef.current = data.employees;
          setEmployees(data.employees);
          try { localStorage.setItem('attendance_employees', JSON.stringify(data.employees)); } catch {}
          if (currentUser?.id) {
            const canonicalUser = data.employees.find((e: Employee) => e?.id === currentUser.id);`;

const employeeStateReplacement = `        const serverShifts = Array.isArray(data.shifts) ? data.shifts : [];
          const shiftIds = new Set(serverShifts.map((s: Shift) => String(s?.id || '')));
          const fallbackShiftId = String(serverShifts[0]?.id || '');
          const canonicalEmployees = data.employees.map((employee: Employee) => {
            const currentShiftId = String(employee?.shiftId || '');
            return currentShiftId && shiftIds.has(currentShiftId)
              ? employee
              : fallbackShiftId
                ? { ...employee, shiftId: fallbackShiftId }
                : employee;
          });

          employeesRef.current = canonicalEmployees;
          setEmployees(canonicalEmployees);
          try { localStorage.setItem('attendance_employees', JSON.stringify(canonicalEmployees)); } catch {}
          if (currentUser?.id) {
            const canonicalUser = canonicalEmployees.find((e: Employee) => e?.id === currentUser.id);`;

if (code.includes(employeeStateMarker) && !code.includes('const serverShifts = Array.isArray(data.shifts)')) {
  code = code.replace(employeeStateMarker, employeeStateReplacement);
}

// Keep the authoritative snapshot as the single immediate state update after POST.
code = code.replace(
  /\n\s*if \(\s*pullFromServerRef\.current\s*\)\s*\{\s*void pullFromServerRef\.current\(\);\s*\}/g,
  '\n      // Authoritative snapshot already applied; polling remains as a safety net.'
);

// Poll every 15 seconds; focus/visibility refresh remains the fast path.
code = code.replace(
  /window\.setInterval\(\s*pullFromServer,\s*1500\s*\)/g,
  'window.setInterval(\n        pullFromServer,\n        15000\n      )'
);

fs.writeFileSync(path, code);
console.log('[patch_client_authoritative_sync] applied');

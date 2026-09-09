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
      if (data?.success) {
        if (Array.isArray(data.attendanceRecords)) {
          const serverAttendance = data.attendanceRecords.map(ensureSanitizedRecord).filter((r: AttendanceRecord) => r && r.date);
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
            if (canonicalUser) { setCurrentUser(canonicalUser); try { localStorage.setItem('logged_in_user', JSON.stringify(canonicalUser)); } catch {} }
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
        if (Array.isArray(data.shifts)) { setShifts(data.shifts); try { localStorage.setItem('attendance_shifts', JSON.stringify(data.shifts)); } catch {} }
        if (Array.isArray(data.dailyShiftAssignments)) { setDailyShiftAssignments(data.dailyShiftAssignments); try { localStorage.setItem('daily_shift_assignments', JSON.stringify(data.dailyShiftAssignments)); } catch {} }
      }`;

  code = code.slice(0, at + fetchMarker.length) + insertion + code.slice(at + fetchMarker.length);
}

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
            return currentShiftId && shiftIds.has(currentShiftId) ? employee : fallbackShiftId ? { ...employee, shiftId: fallbackShiftId } : employee;
          });
          employeesRef.current = canonicalEmployees;
          setEmployees(canonicalEmployees);
          try { localStorage.setItem('attendance_employees', JSON.stringify(canonicalEmployees)); } catch {}
          if (currentUser?.id) {
            const canonicalUser = canonicalEmployees.find((e: Employee) => e?.id === currentUser.id);`;
if (code.includes(employeeStateMarker) && !code.includes('const serverShifts = Array.isArray(data.shifts)')) code = code.replace(employeeStateMarker, employeeStateReplacement);

code = code.replace(/\n\s*if \(\s*pullFromServerRef\.current\s*\)\s*\{\s*void pullFromServerRef\.current\(\);\s*\}/g, '\n      // Authoritative snapshot already applied; polling remains as a safety net.');
code = code.replace(/window\.setInterval\(\s*pullFromServer,\s*1500\s*\)/g, 'window.setInterval(\n        pullFromServer,\n        15000\n      )');

// V4: preserve a locally-read notification when a stale server snapshot is older.
const notificationConsistencyMarker = '/* NOTIFICATION_READ_CONSISTENCY_V4 */';
if (!code.includes(notificationConsistencyMarker)) {
  const notificationBlock = /const serverNotifications\s*=\s*data\.notifications;[\s\S]*?localStorage\.setItem\(['"]notifications['"],\s*JSON\.stringify\(serverNotifications\)\);/;
  if (notificationBlock.test(code)) {
    const replacement = `const serverNotifications = data.notifications;

            ${notificationConsistencyMarker}
            const localNotificationById = new Map(notificationsRef.current.map((n: Notification) => [String(n.id), n]));
            const mergedNotifications = serverNotifications.map((serverItem: Notification) => {
              const localItem = localNotificationById.get(String(serverItem.id));
              if (!localItem || !localItem.isRead || serverItem.isRead) return serverItem;
              const localTime = new Date(localItem.updatedAt || localItem.createdAt || 0).getTime();
              const serverTime = new Date(serverItem.updatedAt || serverItem.createdAt || 0).getTime();
              return localTime >= serverTime ? localItem : serverItem;
            });
            const serverIds = new Set(serverNotifications.map((n: Notification) => String(n.id)));
            const preservedLocal = notificationsRef.current.filter((n: Notification) => n.isRead && !serverIds.has(String(n.id)));
            const nextNotifications = [...mergedNotifications, ...preservedLocal];
            notificationsRef.current = nextNotifications;
            setNotifications(nextNotifications);
            try { localStorage.setItem('notifications', JSON.stringify(nextNotifications)); } catch {}`;
    code = code.replace(notificationBlock, replacement);
  }
}

fs.writeFileSync(path, code);
console.log('[patch_client_authoritative_sync] applied');

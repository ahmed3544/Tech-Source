import fs from 'fs';

const path = 'src/App.tsx';
let code = fs.readFileSync(path, 'utf8');

const marker = "      const data =\n        await res.json();\n\n      /*\n       * السيرفر رجع البيانات النهائية.";

if (!code.includes(marker)) {
  throw new Error('authoritative sync marker not found');
}

const replacement = `      const data =\n        await res.json();\n\n      /*\n       * IMPORTANT: the sync response is the authoritative database snapshot.\n       * Apply it immediately instead of waiting for the next polling request.\n       * This removes the window where another device can appear stale.\n       */\n      if (Array.isArray(data?.attendanceRecords)) {\n        const serverAttendance = data.attendanceRecords.map(ensureSanitizedRecord);\n        attendanceRecordsRef.current = serverAttendance;\n        setAttendanceRecords(serverAttendance);\n        try { localStorage.setItem('attendance_records', JSON.stringify(serverAttendance)); } catch {}\n      }\n      if (Array.isArray(data?.employees)) {\n        employeesRef.current = data.employees;\n        setEmployees(data.employees);\n        try { localStorage.setItem('attendance_employees', JSON.stringify(data.employees)); } catch {}\n      }\n      if (Array.isArray(data?.leaveRequests)) {\n        const serverLeaves = applyPendingLeaveDecisions(data.leaveRequests);\n        leaveRequestsRef.current = serverLeaves;\n        setLeaveRequests(serverLeaves);\n        try { localStorage.setItem('attendance_leaves', JSON.stringify(serverLeaves)); } catch {}\n      }\n      if (Array.isArray(data?.notifications)) {\n        notificationsRef.current = data.notifications;\n        setNotifications(data.notifications);\n        try { localStorage.setItem('notifications', JSON.stringify(data.notifications)); } catch {}\n      }\n      if (Array.isArray(data?.shifts)) {\n        setShifts(data.shifts);\n        try { localStorage.setItem('attendance_shifts', JSON.stringify(data.shifts)); } catch {}\n      }\n      if (Array.isArray(data?.dailyShiftAssignments)) {\n        setDailyShiftAssignments(data.dailyShiftAssignments);\n        try { localStorage.setItem('daily_shift_assignments', JSON.stringify(data.dailyShiftAssignments)); } catch {}\n      }\n\n      /*\n       * السيرفر رجع البيانات النهائية.`;

code = code.replace(marker, replacement);

// Remove the immediate pull from the successful sync branch. The snapshot above is already applied.
code = code.replace(`      if (\n        pullFromServerRef.current\n      ) {\n        void pullFromServerRef.current();\n      }`, `      // Snapshot already applied above; polling remains as a safety net.`);

fs.writeFileSync(path, code);
console.log('[patch_client_authoritative_sync] applied');

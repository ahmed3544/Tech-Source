const fs = require('fs');

const path = 'src/App.tsx';
let code = fs.readFileSync(path, 'utf8');
const marker = '/* CLIENT_STALE_SNAPSHOT_PROTECTION_V1 */';

if (!code.includes(marker)) {
  const helperAnchor = "function mergeLeaveRequestsClient(\n  existing: LeaveRequest[] = [],\n  incoming: LeaveRequest[] = []\n): LeaveRequest[] {";
  const helperStart = code.indexOf(helperAnchor);
  if (helperStart === -1) {
    throw new Error('[patch_client_stale_snapshot_v1] helper anchor not found');
  }

  const helper = `\n\n${marker}\nfunction freshnessMs(value: any): number {\n  const raw = value?.updatedAt ?? value?.updated_at ?? value?.createdAt ?? value?.created_at;\n  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;\n  const parsed = Date.parse(String(raw || ''));\n  return Number.isFinite(parsed) ? parsed : 0;\n}\n\nfunction mergeAttendanceServerSnapshot(\n  local: AttendanceRecord[] = [],\n  server: AttendanceRecord[] = []\n): AttendanceRecord[] {\n  const map = new Map<string, AttendanceRecord>();\n  for (const item of local) {\n    if (!item) continue;\n    const key = String(item.id || `${item.employeeId || ''}:${item.date || ''}`);\n    if (key) map.set(key, item);\n  }\n  for (const item of server) {\n    if (!item) continue;\n    const key = String(item.id || `${item.employeeId || ''}:${item.date || ''}`);\n    const old = map.get(key);\n    if (!old || freshnessMs(item) >= freshnessMs(old)) map.set(key, item);\n  }\n  return Array.from(map.values());\n}\n\nfunction mergeLeaveServerSnapshot(\n  local: LeaveRequest[] = [],\n  server: LeaveRequest[] = []\n): LeaveRequest[] {\n  const map = new Map<string, LeaveRequest>();\n  for (const item of local) {\n    if (item?.id) map.set(String(item.id), item);\n  }\n  for (const item of server) {\n    if (!item?.id) continue;\n    const old = map.get(String(item.id));\n    if (!old || freshnessMs(item) >= freshnessMs(old)) map.set(String(item.id), item);\n  }\n  return Array.from(map.values());\n}\n`;
  code = code.slice(0, helperStart) + helper + code.slice(helperStart);

  const attendanceBlock = `const sanitized =\n              data.attendanceRecords.map(\n                ensureSanitizedRecord\n              );\n\n\n            attendanceRecordsRef.current =\n              sanitized;\n\n            setAttendanceRecords(\n              sanitized\n            );\n\n\n            try {\n\n              localStorage.setItem(\n                'attendance_records',\n                JSON.stringify(\n                  sanitized\n                )\n              );\n\n            } catch {}`;
  const attendanceReplacement = `const sanitized =\n              data.attendanceRecords.map(\n                ensureSanitizedRecord\n              );\n\n            // Never let an older /api/data snapshot erase a newer local punch.\n            const mergedAttendance =\n              mergeAttendanceServerSnapshot(\n                attendanceRecordsRef.current,\n                sanitized\n              );\n\n            attendanceRecordsRef.current =\n              mergedAttendance;\n\n            setAttendanceRecords(\n              mergedAttendance\n            );\n\n\n            try {\n\n              localStorage.setItem(\n                'attendance_records',\n                JSON.stringify(\n                  mergedAttendance\n                )\n              );\n\n            } catch {}`;
  if (!code.includes(attendanceBlock)) {
    throw new Error('[patch_client_stale_snapshot_v1] attendance block not found');
  }
  code = code.replace(attendanceBlock, attendanceReplacement);

  const leaveBlock = `const serverLeaves =\n              applyPendingLeaveDecisions(\n                data.leaveRequests\n              );\n\n\n            leaveRequestsRef.current =\n              serverLeaves;\n\n            setLeaveRequests(\n              serverLeaves\n            );\n\n\n            try {\n\n              localStorage.setItem(\n                'attendance_leaves',\n                JSON.stringify(\n                  serverLeaves\n                )\n              );\n\n            } catch {}`;
  const leaveReplacement = `const mergedLeaves =\n              mergeLeaveServerSnapshot(\n                leaveRequestsRef.current,\n                data.leaveRequests\n              );\n\n            const serverLeaves =\n              applyPendingLeaveDecisions(\n                mergedLeaves\n              );\n\n\n            leaveRequestsRef.current =\n              serverLeaves;\n\n            setLeaveRequests(\n              serverLeaves\n            );\n\n\n            try {\n\n              localStorage.setItem(\n                'attendance_leaves',\n                JSON.stringify(\n                  serverLeaves\n                )\n              );\n\n            } catch {}`;
  if (!code.includes(leaveBlock)) {
    throw new Error('[patch_client_stale_snapshot_v1] leave block not found');
  }
  code = code.replace(leaveBlock, leaveReplacement);

  fs.writeFileSync(path, code, 'utf8');
  console.log('[patch_client_stale_snapshot_v1] applied');
} else {
  console.log('[patch_client_stale_snapshot_v1] already applied');
}

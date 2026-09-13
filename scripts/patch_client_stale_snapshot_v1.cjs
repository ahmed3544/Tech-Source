const fs = require('fs');

const path = 'src/App.tsx';
let code = fs.readFileSync(path, 'utf8');
const marker = '/* CLIENT_STALE_SNAPSHOT_PROTECTION_V1 */';

if (!code.includes(marker)) {
  const helperAnchor = "function mergeLeaveRequestsClient(\n  existing: LeaveRequest[] = [],\n  incoming: LeaveRequest[] = []\n): LeaveRequest[] {";
  const helperStart = code.indexOf(helperAnchor);
  if (helperStart === -1) throw new Error('[patch_client_stale_snapshot_v1] helper anchor not found');

  const helper = [
    '',
    '',
    marker,
    'function freshnessMs(value: any): number {',
    '  const raw = value?.updatedAt ?? value?.updated_at ?? value?.createdAt ?? value?.created_at;',
    "  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;",
    "  const parsed = Date.parse(String(raw || ''));",
    '  return Number.isFinite(parsed) ? parsed : 0;',
    '}',
    '',
    'function mergeAttendanceServerSnapshot(local: AttendanceRecord[] = [], server: AttendanceRecord[] = []): AttendanceRecord[] {',
    '  const map = new Map<string, AttendanceRecord>();',
    '  for (const item of local) {',
    '    if (!item) continue;',
    "    const key = String(item.id || (String(item.employeeId || '') + ':' + String(item.date || '')));",
    '    if (key) map.set(key, item);',
    '  }',
    '  for (const item of server) {',
    '    if (!item) continue;',
    "    const key = String(item.id || (String(item.employeeId || '') + ':' + String(item.date || '')));",
    '    const old = map.get(key);',
    '    if (!old || freshnessMs(item) >= freshnessMs(old)) map.set(key, item);',
    '  }',
    '  return Array.from(map.values());',
    '}',
    '',
    'function mergeLeaveServerSnapshot(local: LeaveRequest[] = [], server: LeaveRequest[] = []): LeaveRequest[] {',
    '  const map = new Map<string, LeaveRequest>();',
    '  for (const item of local) {',
    '    if (item?.id) map.set(String(item.id), item);',
    '  }',
    '  for (const item of server) {',
    '    if (!item?.id) continue;',
    '    const key = String(item.id);',
    '    const old = map.get(key);',
    '    if (!old || freshnessMs(item) >= freshnessMs(old)) map.set(key, item);',
    '  }',
    '  return Array.from(map.values());',
    '}',
    ''
  ].join('\n');
  code = code.slice(0, helperStart) + helper + code.slice(helperStart);

  const attendanceBlock = `const sanitized =\n              data.attendanceRecords.map(\n                ensureSanitizedRecord\n              );\n\n\n            attendanceRecordsRef.current =\n              sanitized;\n\n            setAttendanceRecords(\n              sanitized\n            );\n\n\n            try {\n\n              localStorage.setItem(\n                'attendance_records',\n                JSON.stringify(\n                  sanitized\n                )\n              );\n\n            } catch {}`;
  const attendanceReplacement = `const sanitized =\n              data.attendanceRecords.map(\n                ensureSanitizedRecord\n              );\n\n            // Never let an older /api/data snapshot erase a newer local punch.\n            const mergedAttendance =\n              mergeAttendanceServerSnapshot(\n                attendanceRecordsRef.current,\n                sanitized\n              );\n\n            attendanceRecordsRef.current =\n              mergedAttendance;\n\n            setAttendanceRecords(\n              mergedAttendance\n            );\n\n\n            try {\n\n              localStorage.setItem(\n                'attendance_records',\n                JSON.stringify(\n                  mergedAttendance\n                )\n              );\n\n            } catch {}`;
  if (!code.includes(attendanceBlock)) throw new Error('[patch_client_stale_snapshot_v1] attendance block not found');
  code = code.replace(attendanceBlock, attendanceReplacement);

  const leaveBlock = `const serverLeaves =\n              applyPendingLeaveDecisions(\n                data.leaveRequests\n              );\n\n\n            leaveRequestsRef.current =\n              serverLeaves;\n\n            setLeaveRequests(\n              serverLeaves\n            );\n\n\n            try {\n\n              localStorage.setItem(\n                'attendance_leaves',\n                JSON.stringify(\n                  serverLeaves\n                )\n              );\n\n            } catch {}`;
  const leaveReplacement = `const mergedLeaves =\n              mergeLeaveServerSnapshot(\n                leaveRequestsRef.current,\n                data.leaveRequests\n              );\n\n            const serverLeaves =\n              applyPendingLeaveDecisions(\n                mergedLeaves\n              );\n\n\n            leaveRequestsRef.current =\n              serverLeaves;\n\n            setLeaveRequests(\n              serverLeaves\n            );\n\n\n            try {\n\n              localStorage.setItem(\n                'attendance_leaves',\n                JSON.stringify(\n                  serverLeaves\n                )\n              );\n\n            } catch {}`;
  if (!code.includes(leaveBlock)) throw new Error('[patch_client_stale_snapshot_v1] leave block not found');
  code = code.replace(leaveBlock, leaveReplacement);

  fs.writeFileSync(path, code, 'utf8');
  console.log('[patch_client_stale_snapshot_v1] applied');
} else {
  console.log('[patch_client_stale_snapshot_v1] already applied');
}

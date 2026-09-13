const fs = require('fs');

const path = 'src/App.tsx';
let code = fs.readFileSync(path, 'utf8');
const marker = '/* CLIENT_STALE_SNAPSHOT_PROTECTION_V1 */';

if (!code.includes(marker)) {
  const anchor = 'function mergeLeaveRequestsClient(';
  const at = code.indexOf(anchor);
  if (at === -1) throw new Error('[patch_client_stale_snapshot_v1] mergeLeaveRequestsClient anchor not found');

  const helper = `/* CLIENT_STALE_SNAPSHOT_PROTECTION_V1 */
function freshnessMs(value: any): number {
  const raw = value?.updatedAt ?? value?.updated_at ?? value?.createdAt ?? value?.created_at;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  const parsed = Date.parse(String(raw || ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function mergeAttendanceServerSnapshot(local: AttendanceRecord[] = [], server: AttendanceRecord[] = []): AttendanceRecord[] {
  const map = new Map<string, AttendanceRecord>();
  for (const item of local) {
    if (!item) continue;
    const key = String(item.id || (String(item.employeeId || '') + ':' + String(item.date || '')));
    if (key) map.set(key, item);
  }
  for (const item of server) {
    if (!item) continue;
    const key = String(item.id || (String(item.employeeId || '') + ':' + String(item.date || '')));
    const old = map.get(key);
    if (!old || freshnessMs(item) >= freshnessMs(old)) map.set(key, item);
  }
  return Array.from(map.values());
}

function mergeLeaveServerSnapshot(local: LeaveRequest[] = [], server: LeaveRequest[] = []): LeaveRequest[] {
  const map = new Map<string, LeaveRequest>();
  for (const item of local) {
    if (item?.id) map.set(String(item.id), item);
  }
  for (const item of server) {
    if (!item?.id) continue;
    const key = String(item.id);
    const old = map.get(key);
    if (!old || freshnessMs(item) >= freshnessMs(old)) map.set(key, item);
  }
  return Array.from(map.values());
}

`;
  code = code.slice(0, at) + helper + code.slice(at);
}

const attendanceNeedle = /const sanitized\s*=\s*data\.attendanceRecords\.map\(\s*ensureSanitizedRecord\s*\);\s*attendanceRecordsRef\.current\s*=\s*sanitized;\s*setAttendanceRecords\(\s*sanitized\s*\);/m;
if (attendanceNeedle.test(code) && !code.includes('mergeAttendanceServerSnapshot(')) {
  code = code.replace(attendanceNeedle, `const sanitized = data.attendanceRecords.map(ensureSanitizedRecord);
            const mergedAttendance = mergeAttendanceServerSnapshot(attendanceRecordsRef.current, sanitized);
            attendanceRecordsRef.current = mergedAttendance;
            setAttendanceRecords(mergedAttendance);`);
} else if (attendanceNeedle.test(code)) {
  code = code.replace(attendanceNeedle, `const sanitized = data.attendanceRecords.map(ensureSanitizedRecord);
            const mergedAttendance = mergeAttendanceServerSnapshot(attendanceRecordsRef.current, sanitized);
            attendanceRecordsRef.current = mergedAttendance;
            setAttendanceRecords(mergedAttendance);`);
}

const leaveNeedle = /const serverLeaves\s*=\s*applyPendingLeaveDecisions\(\s*data\.leaveRequests\s*\);\s*leaveRequestsRef\.current\s*=\s*serverLeaves;\s*setLeaveRequests\(\s*serverLeaves\s*\);/m;
if (leaveNeedle.test(code)) {
  code = code.replace(leaveNeedle, `const mergedLeaves = mergeLeaveServerSnapshot(leaveRequestsRef.current, data.leaveRequests);
            const serverLeaves = applyPendingLeaveDecisions(mergedLeaves);
            leaveRequestsRef.current = serverLeaves;
            setLeaveRequests(serverLeaves);`);
}

fs.writeFileSync(path, code, 'utf8');
console.log('[patch_client_stale_snapshot_v1] applied/verified');

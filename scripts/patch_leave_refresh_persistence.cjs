const fs = require('fs');

const path = 'src/App.tsx';
let code = fs.readFileSync(path, 'utf8');
const marker = '/* LEAVE_REFRESH_PERSISTENCE_V1 */';

if (!code.includes(marker)) {
  const exact = `if (Array.isArray(data.leaveRequests)) {
          const serverLeaves = applyPendingLeaveDecisions(data.leaveRequests);
          leaveRequestsRef.current = serverLeaves;
          setLeaveRequests(serverLeaves);
          try { localStorage.setItem('attendance_leaves', JSON.stringify(serverLeaves)); } catch {}
        }`;

  const replacement = `if (Array.isArray(data.leaveRequests)) {
          ${marker}
          // Never let an empty/stale server snapshot erase a leave that is still
          // present locally. The server copy wins for the same ID; locally-created
          // pending requests are retained and retried once after the pull.
          const localLeaves = Array.isArray(leaveRequestsRef.current)
            ? leaveRequestsRef.current
            : [];
          const mergedLeaves = mergeLeaveRequestsClient(localLeaves, data.leaveRequests);
          const serverIds = new Set(data.leaveRequests.map((leave: LeaveRequest) => String(leave?.id || '')));
          const nowForLeaves = Date.now();
          const pendingLocalLeaves = localLeaves.filter((leave: LeaveRequest) => {
            if (!leave?.id || leave.status !== 'pending' || serverIds.has(String(leave.id))) return false;
            const created = new Date(String(leave.createdAt || '')).getTime();
            return !Number.isFinite(created) || nowForLeaves - created < 24 * 60 * 60 * 1000;
          });
          const currentLeaves = applyPendingLeaveDecisions(mergedLeaves);
          leaveRequestsRef.current = currentLeaves;
          setLeaveRequests(currentLeaves);
          try { localStorage.setItem('attendance_leaves', JSON.stringify(currentLeaves)); } catch {}
          if (pendingLocalLeaves.length && !syncInFlightRef.current) {
            void pushSync({ leaveRequests: pendingLocalLeaves });
          }
        }`;

  if (!code.includes(exact)) {
    console.warn('[patch_leave_refresh_persistence] leave pull block not found; skipping safely.');
  } else {
    code = code.replace(exact, replacement);
    fs.writeFileSync(path, code, 'utf8');
    console.log('[patch_leave_refresh_persistence] applied');
  }
}

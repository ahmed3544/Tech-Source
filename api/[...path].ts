import app from "../dist/server.js";

// Vercel runtime entrypoint: load the exact bundled Node server produced by
// `npm run build`. This avoids Node ESM resolving ../server.js as the
// `/var/task/server` directory when the TypeScript source is deployed.

function enrichLeaveAttendance(body: any) {
  if (!body || !Array.isArray(body.leaveRequests) || !Array.isArray(body.attendanceRecords)) {
    return body;
  }

  const attendance = [...body.attendanceRecords];
  let changed = false;

  const normalize = (value: any) => String(value ?? "").trim().toLowerCase();
  const isWeekend = (date: Date) => {
    const day = date.getUTCDay();
    return day === 5 || day === 6; // Friday / Saturday
  };

  for (const leave of body.leaveRequests) {
    if (leave?.status !== "approved" || !leave?.employeeId || !leave?.startDate || !leave?.endDate) {
      continue;
    }

    const start = new Date(`${String(leave.startDate).slice(0, 10)}T00:00:00Z`);
    const end = new Date(`${String(leave.endDate).slice(0, 10)}T00:00:00Z`);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) continue;

    const from = start <= end ? start : end;
    const to = start <= end ? end : start;

    for (const cursor = new Date(from); cursor <= to; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
      if (isWeekend(cursor)) continue;

      const date = cursor.toISOString().slice(0, 10);
      const employeeId = String(leave.employeeId);
      const index = attendance.findIndex(
        (record: any) =>
          normalize(record?.employeeId) === normalize(employeeId) &&
          String(record?.date ?? "").slice(0, 10) === date
      );

      if (index >= 0) {
        const existing = attendance[index];

        // Never erase a real punch. If the day has no punch yet, the approved
        // leave is authoritative and must be shown as leave on every device.
        if (!existing?.checkIn && existing?.status !== "on_leave") {
          attendance[index] = {
            ...existing,
            status: "on_leave",
            leaveType: leave.type,
            workHours: 0,
            lateMinutes: 0,
            lateSeconds: 0,
            earlyLeaveMinutes: 0,
            overtimeHours: 0,
            notes: existing?.notes || `إجازة معتمدة${leave.reason ? `: ${leave.reason}` : ""}`,
            updatedAt: leave.updatedAt || leave.createdAt || new Date().toISOString(),
          };
          changed = true;
        }
        continue;
      }

      attendance.push({
        id: `rec-leave-${employeeId}-${date}`,
        employeeId,
        date,
        status: "on_leave",
        leaveType: leave.type,
        workHours: 0,
        lateMinutes: 0,
        lateSeconds: 0,
        earlyLeaveMinutes: 0,
        overtimeHours: 0,
        notes: `إجازة معتمدة${leave.reason ? `: ${leave.reason}` : ""}`,
        verifiedByFace: true,
        updatedAt: leave.updatedAt || leave.createdAt || new Date().toISOString(),
      });
      changed = true;
    }
  }

  if (!changed) return body;

  return {
    ...body,
    attendanceRecords: attendance,
    // Force the client to accept this authoritative leave-derived attendance
    // snapshot even when an older device has a newer unrelated local mutation.
    lastUpdated: Math.max(Number(body.lastUpdated) || 0, Date.now()),
  };
}

export default function handler(req: any, res: any) {
  const originalJson = res.json.bind(res);

  res.json = (body: any) => {
    try {
      return originalJson(enrichLeaveAttendance(body));
    } catch (error) {
      console.error("[leave-sync-response] enrichment failed", error);
      return originalJson(body);
    }
  };

  return app(req, res);
}

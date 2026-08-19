const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const replacement = `function sanitizeRecordServer(r: any): any {
  if (!r) return r;
  let status = r.status;
  let workHours = r.workHours || 0;
  let earlyLeaveMinutes = r.earlyLeaveMinutes || 0;
  let overtimeHours = r.overtimeHours || 0;

  if (r.checkIn && typeof r.checkIn === 'string' && r.checkIn.trim() !== '') {
    if (r.checkOut && typeof r.checkOut === 'string' && r.checkOut.trim() !== '') {
      // Calculate work hours directly from checkIn, checkOut, breakStart, breakEnd
      workHours = calculateWorkHoursServer(r.checkIn, r.checkOut, r.breakStart, r.breakEnd);
      
      // Automatic Overtime (after 8 actual worked hours)
      if (workHours > 8) {
        overtimeHours = Math.round((workHours - 8) * 10) / 10;
        // workHours = 8; // If standard says 8 max for regular, wait, we can leave workHours as total or cap it. Let's just set overtimeHours. 
        // The prompt says "MAX(0, WORKED HOURS - 8 HOURS)". So workHours remains the total.
      } else {
        overtimeHours = 0;
      }

      const outSecs = parseSecsServer(r.checkOut);
      const shiftEndSecs = parseSecsServer('17:00:00');
      
      if (outSecs < shiftEndSecs - 60 && !earlyLeaveMinutes) {
        earlyLeaveMinutes = Math.floor((shiftEndSecs - outSecs) / 60);
      }
      
      if (status === 'in_progress' || status === 'absent' || !status) {
        if (r.lateMinutes && r.lateMinutes > 0) {
          status = 'late';
        } else if (earlyLeaveMinutes > 0) {
          status = 'early_leave';
        } else {
          status = 'on_time';
        }
      }
    } else if (!r.checkOut) {
      if (status === 'absent' || !status) {
        if (r.lateMinutes && r.lateMinutes > 0) {
          status = 'late';
        } else {
          status = 'in_progress';
        }
      }
    }
  }

  return { ...r, status, workHours, earlyLeaveMinutes, overtimeHours };
}`;

code = code.replace(/function sanitizeRecordServer\(r: any\): any \{[\s\S]*?return \{ \.\.\.r, status, workHours, earlyLeaveMinutes \};\n\}/, replacement);
fs.writeFileSync('server.ts', code);

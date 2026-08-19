const fs = require('fs');

let code = fs.readFileSync('server.ts', 'utf8');

// 1. Add schema imports for shifts
code = code.replace(/export const settings = pgTable/g, "export const shifts = pgTable('shifts', { id: text('id').primaryKey(), name: text('name').notNull(), startTime: text('start_time').notNull(), endTime: text('end_time').notNull(), durationMinutes: integer('duration_minutes').notNull(), breakMinutes: integer('break_minutes').default(0), gracePeriodMinutes: integer('grace_period_minutes').default(0), overtimeEnabled: boolean('overtime_enabled').default(false), isOvernight: boolean('is_overnight').default(false), createdAt: text('created_at'), updatedAt: text('updated_at') });\n\nexport const settings = pgTable");

// 2. Add /api/shifts endpoint
if (!code.includes("app.get('/api/shifts'")) {
  code = code.replace("app.get('/api/data', async (req, res) => {", 
  `
app.get('/api/shifts', async (req, res) => {
  if (process.env.SUPABASE_DB_URL) {
    const dbShifts = await db.select().from(schema.shifts);
    return res.json({ success: true, shifts: dbShifts });
  }
  return res.json({ success: true, shifts: serverState.shifts || [] });
});

app.post('/api/shifts', async (req, res) => {
  const shift = req.body;
  if (!shift || !shift.id) return res.status(400).json({ error: 'Invalid shift' });
  if (process.env.SUPABASE_DB_URL) {
    await db.insert(schema.shifts).values(shift).onConflictDoUpdate({ target: schema.shifts.id, set: shift });
  } else {
    serverState.shifts = serverState.shifts || [];
    const idx = serverState.shifts.findIndex(s => s.id === shift.id);
    if (idx >= 0) serverState.shifts[idx] = shift;
    else serverState.shifts.push(shift);
  }
  return res.json({ success: true });
});

app.delete('/api/shifts/:id', async (req, res) => {
  if (process.env.SUPABASE_DB_URL) {
    await db.delete(schema.shifts).where(sql\`id = \${req.params.id}\`);
  } else {
    serverState.shifts = (serverState.shifts || []).filter(s => s.id !== req.params.id);
  }
  return res.json({ success: true });
});

app.get('/api/data', async (req, res) => {`
  );
}

// 3. Include shifts in /api/data
code = code.replace(
  "const dbOvertime = await db.select().from(schema.overtimeRequests);",
  "const dbOvertime = await db.select().from(schema.overtimeRequests);\n      const dbShifts = await db.select().from(schema.shifts);"
);
code = code.replace(
  "overtimeRequests: dbOvertime,",
  "overtimeRequests: dbOvertime,\n        shifts: dbShifts,"
);
code = code.replace(
  "overtimeRequests: serverState.overtimeRequests || [],",
  "overtimeRequests: serverState.overtimeRequests || [],\n        shifts: serverState.shifts || [],"
);

// We need to rewrite calculation functions completely.
// Let's replace from `function calculateWorkHoursServer` to `function parseRecordMsServer`

const newFunctions = `
// Parses HH:MM or HH:MM:SS string to total minutes
function parseMinutes(timeStr) {
  if (!timeStr) return 0;
  const parts = timeStr.split(':');
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
}

// Format minutes to HH:MM format (without using raw decimal/fraction like 11.1)
function formatHoursMinutes(totalMinutes) {
  if (isNaN(totalMinutes) || totalMinutes < 0) return '00:00';
  const h = Math.floor(totalMinutes / 60);
  const m = Math.floor(totalMinutes % 60);
  return \`\${String(h).padStart(2, '0')}:\${String(m).padStart(2, '0')}\`;
}

function calculateAttendanceStatus(r, shiftConfig, checkInMinutes, checkOutMinutes) {
  const isLeave = r.status === 'on_leave' || r.status === 'approved_leave' || r.status === 'vacation' || r.status === 'official_holiday' || r.isExcused;
  if (isLeave) return { status: r.status, lateMinutes: 0, earlyLeaveMinutes: 0 };

  const startMin = parseMinutes(shiftConfig.startTime);
  const endMin = parseMinutes(shiftConfig.endTime);
  const grace = shiftConfig.gracePeriodMinutes || 0;
  
  let lateMinutes = 0;
  if (r.checkIn && r.checkIn.trim()) {
    let diff = checkInMinutes - startMin;
    // Handle overnight shift late check (e.g. start is 22:00, checkIn is 00:00 (1440 min shift?))
    if (diff < -720) diff += 1440; // Crossed midnight
    
    if (diff > grace) {
      lateMinutes = diff;
    }
  }

  let earlyLeaveMinutes = 0;
  if (r.checkOut && r.checkOut.trim() && !r.isExplicitCancelCheckOut) {
    let diff = endMin - checkOutMinutes;
    if (diff < -720) diff += 1440;
    if (diff > 0) {
      earlyLeaveMinutes = diff;
    }
  }

  let finalStatus = r.status || 'in_progress';
  if (lateMinutes > 0) {
    finalStatus = 'late';
  } else if (r.checkIn && !r.checkOut) {
    finalStatus = 'in_progress';
  } else if (r.checkIn && r.checkOut) {
    if (earlyLeaveMinutes > 0) finalStatus = 'early_leave';
    else finalStatus = 'on_time';
  } else if (!r.checkIn && !r.checkOut) {
     if (r.status === 'absent') finalStatus = 'absent';
  }

  return { status: finalStatus, lateMinutes, earlyLeaveMinutes };
}

function sanitizeRecordServer(r, employeesMap = {}, shiftsMap = {}) {
  if (!r) return r;
  
  const emp = employeesMap[r.employeeId] || {};
  const shiftId = emp.shiftId || 'default';
  const shift = shiftsMap[shiftId] || {
    id: 'default',
    name: 'Default Shift',
    startTime: '09:00',
    endTime: '17:00',
    durationMinutes: 480,
    breakMinutes: 0,
    gracePeriodMinutes: 10,
    overtimeEnabled: true,
    isOvernight: false
  };

  let workHours = 0; // Total worked fraction (keep for legacy compatibility, but we use formatted now)
  let minusHours = 0;
  let overtimeHours = 0;
  let regularMinutes = 0;
  let minusMinutes = 0;
  let overtimeMinutes = 0;
  
  const shiftDurationMinutes = shift.durationMinutes || 480;
  
  let inMin = 0, outMin = 0;

  if (r.checkIn && typeof r.checkIn === 'string' && r.checkIn.trim() !== '') {
    inMin = parseMinutes(r.checkIn);
    
    if (r.checkOut && typeof r.checkOut === 'string' && r.checkOut.trim() !== '') {
      outMin = parseMinutes(r.checkOut);
      
      let diffSecs = outMin - inMin;
      if (diffSecs < 0) {
         // Crossed midnight
         diffSecs += 1440; 
      }
      
      let workedMinutes = diffSecs;
      
      // Breaks
      if (r.breakStart && typeof r.breakStart === 'string') {
        const bs = parseMinutes(r.breakStart);
        const be = (r.breakEnd && typeof r.breakEnd === 'string') ? parseMinutes(r.breakEnd) : outMin;
        let breakSecs = be - bs;
        if (breakSecs < 0) breakSecs += 1440;
        workedMinutes = Math.max(0, workedMinutes - breakSecs);
      }

      regularMinutes = Math.min(workedMinutes, shiftDurationMinutes);
      overtimeMinutes = Math.max(workedMinutes - shiftDurationMinutes, 0);
      minusMinutes = Math.max(shiftDurationMinutes - workedMinutes, 0);
      
      // If leave/excused, we zero out minusMinutes
      if (r.status === 'on_leave' || r.status === 'approved_leave' || r.status === 'vacation' || r.status === 'official_holiday' || r.isExcused) {
        minusMinutes = 0;
      }
      
      workHours = Math.round((workedMinutes / 60) * 100) / 100;
      overtimeHours = Math.round((overtimeMinutes / 60) * 100) / 100;
      minusHours = Math.round((minusMinutes / 60) * 100) / 100;

      // Status
      const st = calculateAttendanceStatus(r, shift, inMin, outMin);
      r.status = st.status;
      r.lateMinutes = st.lateMinutes;
      r.earlyLeaveMinutes = st.earlyLeaveMinutes;

    } else {
       // Only checked in, no checkout
       // Status check for check-in
       const st = calculateAttendanceStatus(r, shift, inMin, 0);
       r.status = st.status;
       r.lateMinutes = st.lateMinutes;
       r.earlyLeaveMinutes = 0;
       
       workHours = 0;
       overtimeHours = 0;
       minusHours = 0;
    }
  } else {
    // No checkin
    if (r.status === 'absent') {
       minusMinutes = shiftDurationMinutes;
       minusHours = Math.round((minusMinutes / 60) * 100) / 100;
    }
  }

  return { ...r, workHours, overtimeHours, minusHours: minusHours || 0 };
}
`;

code = code.replace(/function calculateWorkHoursServer[\s\S]*?function parseRecordMsServer/m, newFunctions + '\n\nfunction parseRecordMsServer');

fs.writeFileSync('server.ts', code);
